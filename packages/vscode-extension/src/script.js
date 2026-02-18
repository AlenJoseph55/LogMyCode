(function () {
  // eslint-disable-next-line no-undef
  const vscode = acquireVsCodeApi();

  window.onerror = function (message, _source, _lineno, _colno, _error) {
    if (statusMessage) {
      showStatus(`JS Error: ${message}`, 'error');
    }
    return false;
  };

  const dateInput = document.getElementById('date');
  const userIdInput = document.getElementById('userId');
  const gitAuthorInput = document.getElementById('gitAuthor');
  const folderList = document.getElementById('folderList');
  const addFolderBtn = document.getElementById('addFolderBtn');
  const getCommitsBtn = document.getElementById('getCommitsBtn');
  const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
  const addWorkspaceBtn = document.getElementById('addWorkspaceBtn');
  const statusMessage = document.getElementById('statusMessage');

  const resultsArea = document.getElementById('resultsArea');
  const summaryContent = document.getElementById('summaryContent');
  const historyList = document.getElementById('historyList');

  const copyBtn = document.getElementById('copyBtn');
  const sendBtn = document.getElementById('sendBtn');
  const regenerateBtn = document.getElementById('regenerateBtn');
  const standupToggle = document.getElementById('standupToggle');

  let currentData = null;
  let historyData = null;
  let originalSummary = '';
  let isStandupMode = false;

  // Set default date to today
  dateInput.valueAsDate = new Date();

  // Restore state
  const oldState = vscode.getState() || {};
  if (oldState.userId) {
    userIdInput.value = oldState.userId;
  }
  if (oldState.gitAuthor) {
    gitAuthorInput.value = oldState.gitAuthor;
  }

  if (addFolderBtn) {
    addFolderBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'selectFolder' });
    });
  }

  if (addWorkspaceBtn) {
    addWorkspaceBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'addWorkspaceFolders' });
    });
  }

  const clearFoldersBtn = document.getElementById('clearFoldersBtn');
  if (clearFoldersBtn) {
    clearFoldersBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'clearFolders' });
    });
  }

  const initialFolders = window.initialFolders || [];
  renderFolders(initialFolders);

  // Auto-fetch history
  setTimeout(() => {
    const date = dateInput.value;
    const userId = userIdInput.value;
    if (userId && date) {
      vscode.postMessage({
        command: 'fetchHistory',
        data: { date, userId },
      });
      showStatus('Fetching history...', 'info');
    }
  }, 500);

  if (getCommitsBtn) {
    getCommitsBtn.addEventListener('click', generateSummary);
  }

  if (standupToggle) {
    standupToggle.addEventListener('change', (e) => {
      isStandupMode = e.target.checked;
      updateSummaryDisplay();
    });
  }

  function generateSummary() {
    const date = dateInput.value;
    const userId = userIdInput.value;
    const gitAuthor = gitAuthorInput.value || userId;

    vscode.setState({ ...vscode.getState(), userId, gitAuthor });

    vscode.postMessage({
      command: 'getCommits',
      data: { date, author: gitAuthor, userId },
    });

    showStatus('Scanning folders...', 'info');
  }

  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener('click', () => {
      const date = dateInput.value;
      const userId = userIdInput.value;
      vscode.postMessage({
        command: 'fetchHistory',
        data: { date, userId },
      });
      showStatus('Fetching history...', 'info');
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (summaryContent.textContent) {
        const lines = summaryContent.textContent.split('\n');
        let validLines = lines;

        // 1. Find Start: Look for "LogMyCode – Daily Summary"
        const startIndex = lines.findIndex((l) => l.trim().startsWith('LogMyCode – Daily Summary'));
        if (startIndex !== -1) {
          validLines = lines.slice(startIndex + 1);
        } else {
          // Fallback: if we can't find the header, assume standard format and remove first line
          if (validLines.length > 0) {
            validLines = validLines.slice(1);
          }
        }

        // 2. Find End: Look for "Total commits:" from the end
        let endIndex = -1;
        for (let i = validLines.length - 1; i >= 0; i--) {
          if (validLines[i].trim().startsWith('Total commits:')) {
            endIndex = i;
            break;
          }
        }

        if (endIndex !== -1) {
          validLines = validLines.slice(0, endIndex);
        }

        const textToCopy = validLines.join('\n').trim();

        vscode.postMessage({
          command: 'copyToClipboard',
          data: { text: textToCopy },
        });
        showStatus('Copied to clipboard', 'success');
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      sendToApi('Generate AI Summary');
    });
  }

  if (regenerateBtn) {
    regenerateBtn.addEventListener('click', () => {
      sendToApi('Regenerate');
    });
  }

  function sendToApi(actionType) {
    if (currentData) {
      if (actionType === 'Generate AI Summary' || actionType === 'Regenerate') {
        showStatus('Sending to AI...', 'info');
      } else {
        showStatus('Saving...', 'info');
      }

      const templateInput = document.getElementById('template');
      const template = templateInput ? templateInput.value : '';

      const otherActivitiesInput = document.getElementById('otherActivities');
      const otherActivities = otherActivitiesInput ? otherActivitiesInput.value : '';

      vscode.postMessage({
        command: 'sendToApi',
        data: { ...currentData, template, otherActivities },
      });
    }
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.command) {
      case 'updateFolders':
        renderFolders(message.folders);
        break;
      case 'showResults':
        try {
          handleResults(message.data);
          showStatus('Done', 'success');
        } catch (e) {
          showStatus(`Error processing results: ${e}`, 'error');
          console.error(e);
        }
        break;
      case 'status':
        showStatus(message.text, message.type);
        break;
    }
  });

  function handleResults(data) {
    if (data.today && data.yesterday) {
      // This is history data
      historyData = data;
      renderHistory(data);
    } else {
      // This is summary generation
      currentData = data;
      renderSummary(data);
    }
  }

  function renderSummary(data) {
    resultsArea.classList.remove('hidden');

    // Inputs Section (Commits list + Template is already visible in main card)
    const inputsSection = document.getElementById('inputsSection');

    // Check if we have commits
    let hasCommits = false;
    if (data.repos && data.repos.length > 0) {
      let total = 0;
      data.repos.forEach((r) => (total += r.commits.length));
      if (total > 0) {
        hasCommits = true;
      }
    }

    if (hasCommits) {
      if (inputsSection) {
        inputsSection.classList.remove('hidden');
        renderCommitsList(data.repos);
      }
    } else {
      if (inputsSection) {
        inputsSection.classList.add('hidden');
      }
      if (!data.summary) {
        // Only show error if we don't have a summary and no commits
        showStatus('No commits found for this selection.', 'error');
      }
    }

    console.log('I am here');
    if (data.summary) {
      console.log('Summary data:', data);

      originalSummary = data.summary;
      // If we are already in standup mode, we should construct the standup view immediately
      // But usually this function is called when new summary arrives.
      // Let's defer to updateSummaryDisplay.

      updateSummaryDisplay();

      summaryContent.classList.remove('hidden');
      sendBtn.style.display = 'inline-block';
      sendBtn.textContent = 'Save';
      if (regenerateBtn) {
        regenerateBtn.style.display = 'inline-block';
      }
    } else {
      summaryContent.classList.add('hidden');

      if (hasCommits) {
        sendBtn.style.display = 'inline-block';
        sendBtn.textContent = 'Generate AI Summary';
        if (regenerateBtn) {
          regenerateBtn.style.display = 'none';
        }
      } else {
        sendBtn.style.display = 'none';
        if (regenerateBtn) {
          regenerateBtn.style.display = 'none';
        }
      }
    }
  }

  function renderCommitsList(repos) {
    const list = document.getElementById('commitsList');
    list.innerHTML = '';

    let totalCommits = 0;
    repos.forEach((repo) => {
      totalCommits += repo.commits.length;

      const repoDiv = document.createElement('div');
      repoDiv.style.marginBottom = '15px';

      const title = document.createElement('div');
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '5px';
      title.textContent = `${repo.name} (${repo.commits.length})`;
      repoDiv.appendChild(title);

      const ul = document.createElement('ul');
      ul.style.paddingLeft = '20px';
      ul.style.margin = '0';

      repo.commits.forEach((commit) => {
        const li = document.createElement('li');
        li.style.fontSize = '0.9em';
        li.style.marginBottom = '4px';
        li.style.color = 'var(--text-color)';

        const msg = document.createElement('span');
        msg.textContent = commit.message;
        li.appendChild(msg);

        const time = document.createElement('span');
        time.style.opacity = '0.6';
        time.style.fontSize = '0.85em';
        time.style.marginLeft = '8px';
        time.textContent = commit.timestamp
          ? new Date(commit.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';
        li.appendChild(time);

        ul.appendChild(li);
      });

      repoDiv.appendChild(ul);
      list.appendChild(repoDiv);
    });

    const headerObj = document.querySelector('#inputsSection h3');
    if (headerObj) {
      headerObj.textContent = `Found ${totalCommits} commits to process:`;
    }
  }

  function updateSummaryDisplay() {
    if (!originalSummary) {
      return;
    }

    if (isStandupMode) {
      const yesterdaySummary = historyData?.yesterday?.summary
        ? historyData.yesterday.summary
        : 'No record found.';

      const todaySummary = originalSummary;

      const standupText = `Q1: What DID you work yesterday?
${yesterdaySummary}

Q2: What ARE you working today?
${todaySummary}

Q3: Any BOTTLE NECK or ISSUES to complete your task?
No`;

      summaryContent.textContent = standupText;
    } else {
      summaryContent.textContent = originalSummary;
    }
  }

  function renderHistory(data) {
    // Clear current list
    historyList.innerHTML = '';

    const items = [
      { label: 'Today', ...data.today },
      { label: 'Yesterday', ...data.yesterday },
    ];

    items.forEach((item) => {
      if (!item.date || item.date === 'N/A') {
        return;
      }

      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
            <div class="history-date">${item.label} <span style="font-weight:normal;opacity:0.7">(${item.date})</span></div>
            <div class="history-meta">${item.totalCommits} commits</div>
          `;

      div.addEventListener('click', () => {
        // Load this summary into the main view
        currentData = {
          userId: data.userId,
          date: item.date,
          summary: item.summary,
          repos: [], // We don't have repos detail in history summary, but that's fine for viewing
        };
        renderSummary(currentData);
      });

      historyList.appendChild(div);
    });

    if (historyList.children.length === 0) {
      historyList.innerHTML =
        '<div style="padding:20px; text-align:center; color:var(--muted-color)">No history found</div>';
    }
  }

  function renderFolders(folders) {
    if (folders.length === 0) {
      folderList.innerHTML =
        '<div style="padding: 10px; text-align: center; color: var(--muted-color);">No folders selected</div>';
      return;
    }
    folderList.innerHTML = folders
      .map(
        (f) => `
            <div class="folder-item">
                <span title="${f}">${f.split(/[\\/]/).pop()} <span style="opacity:0.5; font-size: 0.8em">(${f})</span></span>
            </div>
        `
      )
      .join('');
  }

  function showStatus(text, type = 'info') {
    if (!statusMessage) {
      return;
    }
    statusMessage.textContent = text;
    statusMessage.style.color =
      type === 'error'
        ? 'var(--vscode-errorForeground)'
        : type === 'success'
          ? 'var(--vscode-testing-iconPassed)'
          : 'var(--vscode-descriptionForeground)';

    // Clear after 3 seconds if success
    if (type === 'success') {
      setTimeout(() => {
        if (statusMessage.textContent === text) {
          statusMessage.textContent = '';
        }
      }, 3000);
    }
  }
})();
