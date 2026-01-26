(function () {
    const vscode = acquireVsCodeApi();

    const dateInput = document.getElementById('date');
    const userIdInput = document.getElementById('userId');
    const gitAuthorInput = document.getElementById('gitAuthor');
    const folderList = document.getElementById('folderList');
    const addFolderBtn = document.getElementById('addFolderBtn');
    const getCommitsBtn = document.getElementById('getCommitsBtn');
    const fetchHistoryBtn = document.getElementById('fetchHistoryBtn');
    const resultsArea = document.getElementById('resultsArea');
    const jsonOutput = document.getElementById('jsonOutput');
    const copyBtn = document.getElementById('copyBtn');

    // New elements
    const reviewInputsLink = document.getElementById('reviewInputsLink');
    const inputsArea = document.getElementById('inputsArea');
    const commitsListContainer = document.getElementById('commitsList');
    const regenerateBtn = document.getElementById('regenerateBtn');

    let currentData = null;

    dateInput.valueAsDate = new Date();

    const oldState = vscode.getState() || {};
    if (oldState.userId) userIdInput.value = oldState.userId;
    if (oldState.gitAuthor) gitAuthorInput.value = oldState.gitAuthor;


    addFolderBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'selectFolder' });
    });

    const initialFolders = window.initialFolders || [];
    renderFolders(initialFolders);

    document.getElementById('clearFoldersBtn').addEventListener('click', () => {
        vscode.postMessage({ command: 'clearFolders' });
    });

    getCommitsBtn.addEventListener('click', () => {
        const date = dateInput.value;
        const userId = userIdInput.value;
        const gitAuthor = gitAuthorInput.value || userId;

        vscode.setState({ ...vscode.getState(), userId, gitAuthor });

        vscode.postMessage({
            command: 'getCommits',
            data: { date, author: gitAuthor, userId }
        });
    });

    fetchHistoryBtn.addEventListener('click', () => {
        const date = dateInput.value;
        const userId = userIdInput.value;
        vscode.postMessage({
            command: 'fetchHistory',
            data: { date, userId }
        });
    });

    copyBtn.addEventListener('click', () => {
        if (currentData) {
            let textToCopy = '';
            if (currentData.today && currentData.yesterday) {
                textToCopy = formatStandup(currentData);
            } else {
                const summaryEl = document.getElementById('summaryContent');
                textToCopy = summaryEl.textContent;
            }

            vscode.postMessage({ command: 'copyToClipboard', data: { text: textToCopy } });
        }
    });

    if (reviewInputsLink) {
        reviewInputsLink.addEventListener('click', (e) => {
            e.preventDefault();
            inputsArea.classList.toggle('hidden');
        });
    }

    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', () => {
            try {
                const repoGroups = document.querySelectorAll('.repo-group');
                const editedRepos = [];

                repoGroups.forEach(group => {
                    const repoName = group.dataset.repoName;
                    const commitInputs = group.querySelectorAll('.commit-input-row');
                    const commits = [];

                    commitInputs.forEach(row => {
                        const hash = row.dataset.hash;
                        const messageInput = row.querySelector('input[type="text"]');
                        const timestamp = row.dataset.timestamp;

                        commits.push({
                            hash: hash,
                            message: messageInput.value,
                            timestamp: timestamp
                        });
                    });

                    editedRepos.push({
                        name: repoName,
                        commits: commits
                    });
                });

                const newData = {
                    userId: currentData.userId,
                    date: currentData.date,
                    repos: editedRepos
                };

                vscode.postMessage({ command: 'sendToApi', data: newData });
                inputsArea.classList.add('hidden');
            } catch (e) {
                console.error("Error gathering inputs", e);
            }
        });
    }

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'updateFolders':
                renderFolders(message.folders);
                break;
            case 'showResults':
                currentData = message.data;
                renderResults(message.data);
                break;
        }
    });

    function formatSection(summaryText) {
        if (!summaryText) return 'No data';

        const lines = summaryText.split('\n');
        const formatted = [];

        for (const raw of lines) {
            const line = raw.trim();

            // Skip useless summary headers
            if (!line ||
                line.startsWith('LogMyCode') ||
                line.startsWith('Total commits') ||
                line === 'Repos:' ||
                line === 'Repos') {
                continue;
            }

            // Repo line: "• RepoName"
            if (line.startsWith('• ')) {
                const content = line.substring(2).trim();

                const looksLikeAction =
                    content.match(/^(added|updated|fixed|refactored|removed|optimized|Completed)/i);

                if (!looksLikeAction) {
                    formatted.push(` ${content}`);
                    continue;
                }
                formatted.push(`  - ${content}`);
            }
        }

        return formatted.join('\n');
    }

    function formatStandup(data) {
        const yesterdaySummary = formatSection(data.yesterday.summary || '');
        const todaySummary = formatSection(data.today.summary || '');

        return 'Q1: What DID you work yesterday?\n' +
            yesterdaySummary + '\n\n' +
            'Q2: What ARE you working today?\n' +
            todaySummary + '\n\n' +
            'Q3: Any BOTTLE NECK or ISSUES to complete your task?\n' +
            'No';
    }

    function renderResults(data) {
        resultsArea.classList.remove('hidden');
        const summaryContent = document.getElementById('summaryContent');

        if (data.today && data.yesterday) {
            // It's the history response
            summaryContent.classList.remove('hidden');
            summaryContent.textContent = formatStandup(data);
            reviewInputsLink.style.display = 'none'; // No editing for history fetch?
        } else if (data.summary) {
            // Standard single summary
            summaryContent.classList.remove('hidden');
            summaryContent.textContent = data.summary;
            reviewInputsLink.style.display = 'inline';
        } else {
            summaryContent.classList.add('hidden');
        }

        // Populate inputs area with editable form
        if (data.repos) {
            renderEditableCommits(data.repos);
        } else {
            commitsListContainer.innerHTML = '';
        }

        inputsArea.classList.add('hidden');
        jsonOutput.textContent = JSON.stringify(data, null, 2);
    }

    function renderEditableCommits(repos) {
        if (!repos || repos.length === 0) {
            commitsListContainer.innerHTML = '<p>No commits found to edit.</p>';
            return;
        }

        const html = repos.map(repo => `
            <div class="repo-group" data-repo-name="${repo.name}" style="margin-bottom: 20px;">
                <h4 style="margin-bottom: 8px; color: var(--vscode-editor-foreground); border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px;">${repo.name}</h4>
                ${repo.commits.map(commit => `
                    <div class="commit-input-row" data-hash="${commit.hash}" data-timestamp="${commit.timestamp || ''}" style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <input type="text" value="${commit.message.replace(/"/g, '&quot;')}" 
                            style="flex-grow: 1; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px;"
                        />
                         <span style="font-family: monospace; font-size: 0.8em; opacity: 0.6;">${commit.hash.substring(0, 7)}</span>
                    </div>
                `).join('')}
            </div>
        `).join('');

        commitsListContainer.innerHTML = html;
    }

    function renderFolders(folders) {
        if (folders.length === 0) {
            folderList.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--vscode-descriptionForeground);">No folders selected</div>';
            return;
        }
        folderList.innerHTML = folders.map(f => `
            <div class="folder-item">
                <span title="${f}">${f.split(/[\\\/]/).pop()} <span style="opacity:0.5; font-size: 0.8em">(${f})</span></span>
            </div>
        `).join('');
    }
})();
