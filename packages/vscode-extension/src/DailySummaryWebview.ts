import * as vscode from 'vscode';
import { GitService, RepoCommits } from './GitService';


export class DailySummaryWebview {
    public static currentPanel: DailySummaryWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _gitService: GitService;
    private _context: vscode.ExtensionContext;

    private _folders: string[] = [];

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = context.extensionUri;
        this._context = context;
        this._gitService = new GitService();
        
        this._folders = this._context.globalState.get<string[]>('dailySummary.folders') || [];


        this._update();
        
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'selectFolder':
                        this._selectFolder();
                        return;
                    case 'clearFolders':
                        this._folders = [];
                         this._context.globalState.update('dailySummary.folders', []);
                         this._panel.webview.postMessage({ command: 'updateFolders', folders: this._folders });
                        return;
                    case 'getCommits':
                        this._getCommits(message.data);
                        return;
                    case 'sendToApi':
                        this._sendToApi(message.data);
                        return;
                    case 'fetchHistory':
                        this._fetchHistory(message.data);
                        return;
                    case 'copyToClipboard': {
                        const { text } = message.data;
                        if (!text) {
                            vscode.window.showErrorMessage('Nothing to copy.');
                            return;
                        }

                        vscode.env.clipboard.writeText(text);
                        vscode.window.showInformationMessage('Copied to clipboard!');
                        return;
                    }
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DailySummaryWebview.currentPanel) {
            DailySummaryWebview.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dailySummary',
            'Daily Summary',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'dist')
                ]
            }
        );

        DailySummaryWebview.currentPanel = new DailySummaryWebview(panel, context);
    }

    public dispose() {
        DailySummaryWebview.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _selectFolder() {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: true,
            openLabel: 'Select Folder',
            canSelectFiles: false,
            canSelectFolders: true
        };
       
        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
             const newPaths = fileUri.map(uri => uri.fsPath);
             this._folders = [...new Set([...this._folders, ...newPaths])];
             await this._context.globalState.update('dailySummary.folders', this._folders);
             this._panel.webview.postMessage({ command: 'updateFolders', folders: this._folders });
        }
    }

    private async _getCommits(data: { date: string; author: string, userId: string }) {
        const { date, author, userId } = data;
        
        const dateObj = new Date(date);
        const results: RepoCommits[] = [];

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Fetching commits...",
            cancellable: false
        }, async (progress) => {
            for (const folder of this._folders) {
                progress.report({ message: `Scanning ${folder}...` });
                const result = await this._gitService.getCommitsForDay(folder, dateObj, author);
                if (result.commits.length > 0) {
                    results.push(result);
                }
            }
            if (results.length === 0) {
                vscode.window.showInformationMessage(`No commits found for ${date}.`);
                return;
            }

            const responsePayload = {
                userId: userId,
                date: date,
                repos: results
            };
    
            // Automatically send to API to generate summary
            await this._sendToApi(responsePayload);
        });
    }

    private async _sendToApi(data: any) {
        const config = vscode.workspace.getConfiguration('logmycode');
        const apiUrl = config.get<string>('apiUrl');
        
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Generating summary...",
                cancellable: false
            }, async () => {
                const response = await fetch(`${apiUrl}/commits`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    const json = await response.json();
                    this._panel.webview.postMessage({ command: 'showResults', data: json });
                    vscode.window.showInformationMessage('Summary generated successfully!');
                } else {
                    vscode.window.showErrorMessage(`Failed to generate summary: ${response.statusText}`);
                }
            });
        } catch (error) {
             vscode.window.showErrorMessage(`Failed to connect to API: ${error}`);
        }
    }

    private async _fetchHistory(data: { userId: string, date: string }) {
        const config = vscode.workspace.getConfiguration('logmycode');
        const apiUrl = config.get<string>('apiUrl');
        const { userId, date } = data;

        const url = `${apiUrl}/recent-summaries?userId=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}`;

        try {
            const response = await fetch(url);
            if (response.ok) {
                const json = await response.json();
                this._panel.webview.postMessage({ command: 'showResults', data: json });
                vscode.window.showInformationMessage('History fetched successfully!');
            } else {
                vscode.window.showErrorMessage('Failed to fetch history.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error fetching history: ${error}`);
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        const scriptUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'script.js')
        );

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>LogMyCode</title>
            <style>
                :root {
                    --container-paddding: 20px;
                    --input-padding-vertical: 6px;
                    --input-padding-horizontal: 4px;
                    --input-margin-vertical: 4px;
                    --input-margin-horizontal: 0;
                }

                body {
                    padding: var(--container-paddding);
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                }

                h1, h2, h3 {
                    font-weight: 600;
                }

                .container {
                    max-width: 800px;
                    margin: 0 auto;
                }

                .card {
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 6px;
                    padding: 16px;
                    margin-bottom: 20px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }

                .form-group {
                    margin-bottom: 15px;
                }

                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 500;
                    color: var(--vscode-descriptionForeground);
                }

                input[type="text"], input[type="date"] {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                }

                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 16px;
                    cursor: pointer;
                    border-radius: 4px;
                    font-weight: 500;
                    transition: background 0.2s;
                }

                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                
                button.secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                
                button.secondary:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }

                .folder-list {
                    margin-top: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    max-height: 150px;
                    overflow-y: auto;
                }

                .folder-item {
                    padding: 8px 12px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 0.9em;
                }
                
                .folder-item:last-child {
                    border-bottom: none;
                }

                .actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }

                pre {
                    background: var(--vscode-textBlockQuote-background);
                    border: 1px solid var(--vscode-textBlockQuote-border);
                    padding: 10px;
                    border-radius: 4px;
                    overflow-x: auto;
                    font-size: 0.9em;
                }

                .hidden {
                    display: none;
                }
                
                .results-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }

                .header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header-row">
                    <h1>LogMyCode Daily Summary</h1>
                </div>

                <div class="card">
                    <div class="form-group">
                        <label for="date">Date</label>
                        <input type="date" id="date" />
                    </div>
                    <div class="form-group">
                        <label for="userId">User ID</label>
                        <input type="text" id="userId" value="alen" placeholder="e.g. alen" />
                    </div>
                    <div class="form-group">
                        <label for="gitAuthor">Git Author (Optional)</label>
                        <input type="text" id="gitAuthor" placeholder="Git Author Name (if different from User ID)" />
                    </div>
                </div>

                <div class="card">
                    <h3>Source Folders</h3>
                    <p style="color: var(--vscode-descriptionForeground); font-size: 0.9em;">Select folders to scan for git commits.</p>
                    <div class="folder-list" id="folderList">
                        <div style="padding: 10px; text-align: center; color: var(--vscode-descriptionForeground);">No folders selected</div>
                    </div>
                    <div style="margin-top: 10px; display: flex; gap: 10px;">
                        <button id="addFolderBtn" class="secondary">Add Folder</button>
                        <button id="clearFoldersBtn" class="secondary">Clear All</button>
                    </div>
                </div>

                <div class="actions">
                    <button id="getCommitsBtn">Generate Async</button>
                    <button id="fetchHistoryBtn" class="secondary">Fetch & Format History</button>
                </div>

                <div id="resultsArea" class="hidden" style="margin-top: 30px;">
                    <div class="results-header">
                        <div style="display: flex; align-items: baseline; gap: 10px;">
                            <h2>Results</h2>
                            <a href="#" id="reviewInputsLink" style="font-size: 0.9em; text-decoration: none;">Review inputs</a>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button id="copyBtn" class="secondary">Copy Output</button>
                        </div>
                    </div>
                    <div id="summaryContent" class="card hidden" style="white-space: pre-wrap; font-family: var(--vscode-font-monospace); line-height: 1.5;"></div>
                    
                    <div id="inputsArea" class="hidden" style="margin-top: 20px;">
                        <h3>Review & Edit Inputs</h3>
                        <p style="font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-bottom: 10px;">Make changes to your commit messages below and click Regenerate.</p>
                        <div id="commitsList" style="margin-bottom: 15px;"></div>
                        <button id="regenerateBtn">Regenerate</button>
                    </div>

                    <pre id="jsonOutput" class="hidden"></pre>
                </div>
            </div>

            <script>
                window.initialFolders = ${JSON.stringify(this._folders)};
            </script>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
