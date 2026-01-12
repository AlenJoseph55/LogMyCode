# Change Log

All notable changes to the "logmycode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [2.0.0] - 2026-01-12

- **Feat**: Separated webview scripts from the main extension logic for cleaner architecture.
- **Feat**: Enhanced git log command to automatically exclude merge commits (`--no-merges`), ensuring cleaner summaries.
- **Feat**: Updated history fetching logic to retrieve the *latest available* commits rather than just the previous calendar date.

## [1.0.0] - 2025-12-17

- Initial release of LogMyCode extension.
- Added usage of `git` CLI for local repository scanning to avoid VS Code API limitations.
- Improved git scanning to include commits from all branches.
- Automatically generates daily work summaries from git commits.
- Enhanced summary formatting for "standup-ready" output (Q1/Q2/Q3 format) with RingCentral compatibility.
- Fixed visibility of "Send to API" button and added copy-to-clipboard functionality for formatted summaries.
- Exports summaries for standups, Excel reports, and Jira updates.
- Configurable API URL and User ID.