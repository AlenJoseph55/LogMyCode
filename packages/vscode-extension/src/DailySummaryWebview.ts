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
  private _defaultGitAuthor: string = '';
  private readonly _summaryTemplate = `
You are an AI assistant for a developer tool called "LogMyCode".
Your task is to generate a daily work summary based on the following git commits for User "{{userId}}" on Date "{{date}}".

Input Commits:
{{commits}}

Instructions:
1. Group the work by repository.
2. For each repository, summarize the changes in 3-4 concise bullet points.
3. CRITICAL: Describe ACTIONS, not impact.
   - Strip phrases like "resulting in...", "which allows...", "improving...", "enhancing...".
   - Start specific points with preferred verbs: Added, Updated, Fixed, Refactored, Optimized.
   - Do NOT explain the outcome or benefit (e.g., "to improve performance"). Just state what was done (e.g., "Optimized database queries").
4. Combine related commits where appropriate but keep points purely action-oriented.
5. Calculate the total number of commits.
6. Format the output EXACTLY as follows:

LogMyCode – Daily Summary ({{date}})

Repos:    
• [Repo Name]
• [Summary point 1]
• [Summary point 2]
...
• [Repo Name 2]
...

Total commits: [Total Count]

Do not add any other text before or after this format.
`;

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._extensionUri = context.extensionUri;
    this._context = context;
    this._gitService = new GitService();

    this._folders = this._context.globalState.get<string[]>('dailySummary.folders') || [];

    // Fetch global git user and then update the view
    this._gitService.getGlobalGitUser().then((user) => {
      this._defaultGitAuthor = user;
      this._update();
    });

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
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
          case 'addWorkspaceFolders':
            this._addWorkspaceFolders();
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
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
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
      canSelectFolders: true,
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (fileUri && fileUri[0]) {
      const newPaths = fileUri.map((uri) => uri.fsPath);
      this._folders = [...new Set([...this._folders, ...newPaths])];
      await this._context.globalState.update('dailySummary.folders', this._folders);
      this._panel.webview.postMessage({ command: 'updateFolders', folders: this._folders });
    }
  }

  private async _addWorkspaceFolders() {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const newPaths = folders.map((f) => f.uri.fsPath);
      this._folders = [...new Set([...this._folders, ...newPaths])];
      await this._context.globalState.update('dailySummary.folders', this._folders);
      this._panel.webview.postMessage({ command: 'updateFolders', folders: this._folders });
      vscode.window.showInformationMessage(`Added ${newPaths.length} workspace folders.`);
      this._panel.webview.postMessage({
        command: 'status',
        text: `Added ${newPaths.length} folders`,
        type: 'success',
      });
    } else {
      vscode.window.showInformationMessage('No workspace folders open.');
      this._panel.webview.postMessage({
        command: 'status',
        text: 'No workspace folders',
        type: 'error',
      });
    }
  }

  private async _getCommits(data: { date: string; author: string; userId: string }) {
    const { date, author, userId } = data;
    const results: RepoCommits[] = [];

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Fetching commits...',
          cancellable: false,
        },
        async (progress) => {
          if (this._folders.length === 0) {
            this._panel.webview.postMessage({
              command: 'status',
              text: 'No folders selected',
              type: 'error',
            });
            return;
          }

          for (const folder of this._folders) {
            progress.report({ message: `Scanning ${folder}...` });
            try {
              const result = await this._gitService.getCommitsForDay(folder, date, author);
              if (result.commits.length > 0) {
                results.push(result);
              }
            } catch (err) {
              console.error(`Failed to scan ${folder}:`, err);
              // Continue scanning other folders
            }
          }
        }
      );

      const responsePayload = {
        userId: userId,
        date: date,
        repos: results,
      };

      this._panel.webview.postMessage({ command: 'showResults', data: responsePayload });

      if (results.length === 0) {
        this._panel.webview.postMessage({
          command: 'status',
          text: 'No commits found',
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error in _getCommits:', error);
      vscode.window.showErrorMessage(`Error fetching commits: ${error}`);
      this._panel.webview.postMessage({
        command: 'status',
        text: 'Error fetching commits',
        type: 'error',
      });
    }
  }

  private async _sendToApi(data: {
    userId: string;
    date: string;
    summary?: string;
    repos?: unknown[];
    template?: string;
  }) {
    const config = vscode.workspace.getConfiguration('logmycode');
    const apiUrl = config.get<string>('apiUrl');

    try {
      const response = await fetch(`${apiUrl}/commits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...data, template: data.template || this._summaryTemplate }),
      });

      if (response.ok) {
        const json = await response.json();
        vscode.window.showInformationMessage('Configuration saved!');
        this._panel.webview.postMessage({ command: 'showResults', data: json });
      } else {
        vscode.window.showErrorMessage(`Failed to send to API: ${response.statusText}`);
        this._panel.webview.postMessage({
          command: 'status',
          text: `Failed: ${response.statusText}`,
          type: 'error',
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to send to API: ${error}`);
      this._panel.webview.postMessage({
        command: 'status',
        text: `Error: ${error}`,
        type: 'error',
      });
    }
  }

  private async _fetchHistory(data: { userId: string; date: string }) {
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
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>LogMyCode</title>

<style>
:root {
  --radius: 6px;
  --border: var(--vscode-widget-border);
  --bg: var(--vscode-editor-background);
  --panel-bg: var(--vscode-editorWidget-background);
  --muted: var(--vscode-descriptionForeground);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 16px 20px;
  height: 100vh;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  background: var(--bg);
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family);
  overflow: hidden;
}

/* ---------------- HEADINGS ---------------- */

h1 {
  font-size: 1.4rem;
  margin: 0 0 16px;
  font-weight: 600;
}

h3 {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0 0 8px;
}

/* ---------------- LAYOUT ---------------- */

.main {
  overflow-y: auto;
  padding-right: 8px;
}

.history {
  border-left: 1px solid var(--border);
  padding-left: 16px;
  overflow-y: auto;
}

/* ---------------- SECTIONS ---------------- */

.section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  margin-bottom: 16px;
  background: var(--panel-bg);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

/* ---------------- FORM ---------------- */

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

label {
  font-size: 0.75rem;
  color: var(--muted);
}

input,
textarea {
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 6px 8px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 0.85rem;
  font-family: inherit;
}

textarea {
  resize: vertical;
  font-family: var(--vscode-font-monospace);
}

input:focus,
textarea:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

/* ---------------- BUTTONS ---------------- */

button {
  font-size: 0.8rem;
  padding: 6px 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
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

button.primary {
  padding: 8px 18px;
  font-size: 0.85rem;
}

/* ---------------- FOLDERS ---------------- */

.folder-list {
  border: 1px solid var(--border);
  border-radius: 4px;
  max-height: 120px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.folder-item {
  padding: 6px 8px;
  font-size: 0.75rem;
  border-bottom: 1px solid var(--border);
}

.folder-item:last-child {
  border-bottom: none;
}

/* ---------------- COMMITS ---------------- */

#commitsList {
  border: 1px solid var(--border);
  border-radius: 4px;
  max-height: 180px;
  overflow-y: auto;
  font-size: 0.8rem;
}

#commitsList div {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}

#commitsList div:last-child {
  border-bottom: none;
}

/* ---------------- RESULTS ---------------- */

#summaryContent {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  background: var(--bg);
  font-family: var(--vscode-font-monospace);
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

/* ---------------- HISTORY ---------------- */

.history-item {
  padding: 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  margin-bottom: 6px;
  cursor: pointer;
}

.history-item:hover {
  background: var(--vscode-list-hoverBackground);
  border-color: var(--border);
}

.history-date {
  font-size: 0.8rem;
  font-weight: 600;
}

.history-meta {
  font-size: 0.7rem;
  color: var(--muted);
}

.hidden {
  display: none;
}

/* ---------------- SCROLLBAR ---------------- */

::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
  border-radius: 4px;
}
</style>
</head>

<body>
  <div class="main">
    <h1>LogMyCode Daily Summary</h1>

    <div class="section">
      <div class="form-row">
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="date" />
        </div>
        <div class="form-group">
          <label>User ID</label>
          <input type="text" id="userId" value="${this._defaultGitAuthor}" />
        </div>
        <div class="form-group">
          <label>Git Author</label>
          <input type="text" id="gitAuthor" value="${this._defaultGitAuthor}" />
        </div>
      </div>

      <div class="form-group">
        <label>Summary Template</label>
        <textarea id="template" rows="6">${this._summaryTemplate}</textarea>
      </div>
    </div>

    <div class="section">
      <h3>Source Folders</h3>

      <div class="folder-list" id="folderList">
        <div class="folder-item" style="text-align:center;color:var(--muted)">
          No folders selected
        </div>
      </div>

      <div style="display:flex;gap:8px;">
        <button class="secondary" id="addFolderBtn">Add Folder</button>
        <button class="secondary" id="addWorkspaceBtn">Add Workspace</button>
        <button class="secondary" id="clearFoldersBtn">Clear</button>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:12px;">
      <button id="getCommitsBtn" class="primary">Get Commits</button>
      <span id="statusMessage" style="font-size:0.75rem;color:var(--muted)"></span>
    </div>
    <div class="card">
      <div class="hidden" id="inputsSection" style="margin-top:12px;">
        <h3>Commits</h3>
        <div id="commitsList"></div>
      </div>
    </div>

    <div id="resultsArea" class="hidden" style="margin-top:20px;">
      <div class="section-header">
        <h3>Generated Summary</h3>
        <div style="display:flex;gap:6px;">
          <button class="primary" id="sendBtn">Generate AI Summary</button>
          <button class="secondary" id="copyBtn">Copy</button>
        </div>
      </div>
      <div id="summaryContent"></div>
    </div>
  </div>

  <div class="history">
    <div class="section-header">
      <h3>History</h3>
      <button class="secondary" id="refreshHistoryBtn">↻</button>
    </div>

    <div id="historyList">
      <div style="text-align:center;color:var(--muted);font-size:0.8rem;">
        Load history to see past summaries
      </div>
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
