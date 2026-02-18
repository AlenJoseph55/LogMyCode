# Change Log

All notable changes to the "logmycode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [2.2.0] - 2026-02-18

### Added

- **Standup Mode**: Toggle between standard summary and a Q1/Q2/Q3 standup format (Yesterday/Today/Blockers).
- **Manual Work Log**: New field to input non-commit activities, which are professionally rewritten by AI.
- **Regenerate Summary**: Button to re-run AI generation with updated inputs.
- **Auto-fetch History**: History loads automatically when the extension opens.

### Changed

- **UI Overhaul**: Complete visual redesign with a modern, card-based layout and improved styling.
- **Smart History**: specific "Yesterday" logic replaced with fetching the _latest_ available previous summary for better context.
- **Data Storage**: Summaries are now stored cleanly without headers/footers, allowing for dynamic formatting.
- **Sidebar**: Improved organization for Source Folders and History.

## [2.1.0] - 2026-02-17

- **Feat**: Updated default API URL to production endpoint (`https://api.logmycode.alenjoseph.dev/api`).
- **Refactor**: Improved daily summary templates and clipboard copy logic to exclude unnecessary headers/footers.
- **Feat**: Added VSCode launch and task configurations for better development experience.
- **Feat**: Separated LLM summary instructions from user-defined output format for better customization.
- **Fix**: Parse `PORT` environment variable as an integer and bind server to all network interfaces.

## [2.0.0] - 2026-01-12

- **Feat**: Separated webview scripts from the main extension logic for cleaner architecture.
- **Feat**: Enhanced git log command to automatically exclude merge commits (`--no-merges`), ensuring cleaner summaries.
- **Feat**: Updated history fetching logic to retrieve the _latest available_ commits rather than just the previous calendar date.

## [1.0.0] - 2025-12-17

- Initial release of LogMyCode extension.
- Added usage of `git` CLI for local repository scanning to avoid VS Code API limitations.
- Improved git scanning to include commits from all branches.
- Automatically generates daily work summaries from git commits.
- Enhanced summary formatting for "standup-ready" output (Q1/Q2/Q3 format) with RingCentral compatibility.
- Fixed visibility of "Send to API" button and added copy-to-clipboard functionality for formatted summaries.
- Exports summaries for standups, Excel reports, and Jira updates.
- Configurable API URL and User ID.
