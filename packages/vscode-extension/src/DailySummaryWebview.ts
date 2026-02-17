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
• [Repo Name]
  - [Summary point 1]
  - [Summary point 2]
...
• [Repo Name 2]
...`;

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
    otherActivities?: string;
  }) {
    console.log('template', data.template);
    const config = vscode.workspace.getConfiguration('logmycode');
    const apiUrl = config.get<string>('apiUrl');

    try {
      const response = await fetch(`${apiUrl}/commits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          template: data.template || this._summaryTemplate,
          otherActivities: data.otherActivities,
        }),
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
  --radius: 8px;
  --border: var(--vscode-widget-border);
  --bg: var(--vscode-editor-background);
  --panel-bg: var(--vscode-editorWidget-background);
  --panel-hover: var(--vscode-list-hoverBackground);
  --muted: var(--vscode-descriptionForeground);
  --accent: var(--vscode-textLink-foreground);
  --font-family: var(--vscode-font-family);
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 24px;
  height: 100vh;
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 32px;
  background: var(--bg);
  color: var(--vscode-foreground);
  font-family: var(--font-family);
  overflow: hidden;
}

/* ---------------- HEADINGS ---------------- */

h1 {
  font-size: 1.5rem;
  margin: 0 0 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

h3 {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

/* ---------------- LAYOUT ---------------- */

.main {
  overflow-y: auto;
  padding-right: 12px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.sidebar {
  border-left: 1px solid var(--border);
  padding-left: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
  height: 100%;
}

/* ---------------- CARDS ---------------- */

.card {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: var(--shadow);
  transition: transform 0.2s, box-shadow 0.2s;
}

.card:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--muted);
}

input,
textarea {
  border: 1px solid var(--vscode-input-border);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 0.9rem;
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
  width: 100%;
}

textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
  font-family: var(--vscode-font-monospace);
}

input:focus,
textarea:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
  box-shadow: 0 0 0 2px var(--vscode-focusBorder00); /* transparent focus ring if supported */
}

/* ---------------- BUTTONS ---------------- */

button {
  font-size: 0.85rem;
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

button:hover {
  background: var(--vscode-button-hoverBackground);
  transform: translateY(-1px);
}

button:active {
  transform: translateY(0);
}

button.secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

button.secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

button.primary {
  padding: 10px 24px;
  font-size: 0.95rem;
}

button.icon-btn {
  padding: 6px;
  background: transparent;
  color: var(--muted);
}
button.icon-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

/* ---------------- SIDEBAR ITEMS ---------------- */

.folder-list, .history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.folder-item, .history-item {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  transition: all 0.2s;
  cursor: pointer;
}

.folder-item:hover, .history-item:hover {
  background: var(--panel-hover);
  border-color: var(--vscode-focusBorder);
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.history-date {
  font-weight: 600;
  font-size: 0.9rem;
}

.history-meta {
  font-size: 0.8rem;
  color: var(--muted);
}

/* ---------------- COMMITS LIST ---------------- */

#commitsList {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  max-height: 250px;
  overflow-y: auto;
  font-size: 0.85rem;
  background: var(--vscode-input-background);
}

.repo-commits {
  border-bottom: 1px solid var(--border);
}
.repo-commits:last-child {
  border-bottom: none;
}

.repo-header {
  padding: 8px 12px;
  background: var(--panel-bg);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
}

.commit-item {
  padding: 6px 12px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.commit-item:hover {
  background: var(--panel-hover);
}

.commit-msg {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.commit-time {
  color: var(--muted);
  font-size: 0.8em;
  white-space: nowrap;
}

/* ---------------- RESULTS ---------------- */

#summaryContent {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  background: var(--vscode-editor-background);
  font-family: var(--vscode-font-monospace);
  font-size: 0.9rem;
  line-height: 1.6;
  white-space: pre-wrap;
  min-height: 150px;
}

.hidden { display: none !important; }

/* ---------------- SCROLLBAR ---------------- */

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
  border-radius: 5px;
  border: 2px solid transparent; /* padding around thumb */
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.toggle-container {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
  background: var(--vscode-input-background);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
  transition: all 0.2s;
}
.toggle-container:hover {
  background: var(--panel-hover);
  border-color: var(--vscode-focusBorder);
  color: var(--vscode-foreground);
}
.toggle-container input {
  margin: 0;
  width: auto;
  cursor: pointer;
}
</style>
</head>

<body>
  <div class="main">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h1>Daily Summary</h1>
      <button id="getCommitsBtn" class="primary">
        <span>Get Commits</span>
      </button>
    </div>

    <!-- CONFIGURATION CARD -->
    <div class="card">
      <h3>Configuration</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="date" />
        </div>
        <div class="form-group">
          <label>User ID</label>
          <input type="text" id="userId" value="${this._defaultGitAuthor}" placeholder="e.g. johndoe" />
        </div>
        <div class="form-group">
          <label>Git Author</label>
          <input type="text" id="gitAuthor" value="${this._defaultGitAuthor}" placeholder="e.g. John Doe" />
        </div>
      </div>
    </div>

    <!-- INPUTS CARD -->
    <div class="card">
      <h3>Inputs</h3>
      <div class="form-group">
        <label>Style Instructions</label>
        <textarea id="template" rows="3" placeholder="e.g. Concise, professional tone...">${this._summaryTemplate}</textarea>
      </div>
      <div class="form-group">
        <label>Manual Work Log</label>
        <textarea id="otherActivities" rows="3" placeholder="e.g. Argued with testing team about ticket #123 (will be rewritten professionally)..."></textarea>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center">
      <span id="statusMessage" style="font-size:0.85rem;color:var(--muted)"></span>
    </div>

    <!-- COMMITS SECTION -->
    <div class="hidden" id="inputsSection">
      <h3>Commits Found</h3>
      <div id="commitsList"></div>
    </div>

    <!-- RESULTS SECTION -->
    <div id="resultsArea" class="hidden">
      <div class="card">
        <div class="section-header">
          <div style="display:flex;align-items:center;gap:16px;">
            <h3>Generated Summary</h3>
            <label class="toggle-container">
              <input type="checkbox" id="standupToggle">
              <span>Standup Format</span>
            </label>
          </div>
          <div style="display:flex;gap:8px;">
          <button class="primary" id="sendBtn">Generate AI Summary</button>
          <button class="secondary" id="regenerateBtn" title="Regenerate Summary">Regenerate</button>
          <button class="secondary" id="copyBtn">Copy</button>
        </div>
        </div>
        <div id="summaryContent"></div>
      </div>
    </div>
  </div>

  <div class="sidebar">
    <!-- SOURCE FOLDERS -->
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3>Source Folders</h3>
        <button class="secondary" id="clearFoldersBtn" style="padding:4px 8px;font-size:0.75rem;">Clear</button>
      </div>

      <div class="folder-list" id="folderList">
        <div class="folder-item" style="text-align:center;color:var(--muted)">
          No folders selected
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
        <button class="secondary" id="addFolderBtn">Add Folder</button>
        <button class="secondary" id="addWorkspaceBtn">Workspace</button>
      </div>
    </div>

    <!-- HISTORY -->
    <div style="flex-grow:1;display:flex;flex-direction:column;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3>History</h3>
        <button class="icon-btn" id="refreshHistoryBtn" title="Refresh">↻</button>
      </div>

      <div id="historyList" class="history-list">
        <div style="text-align:center;color:var(--muted);font-size:0.85rem;padding:20px;">
          Load history to see past summaries
        </div>
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
