# LogMyCode

LogMyCode is a VS Code extension that automatically generates daily work summaries from your git commits and exports them for standups, Excel reports, and Jira updates.

## Features

- **Daily Summary Dashboard**: View your commits for the day across multiple local repositories.
- **Git Integration**: Automatically fetches commits from your local folders using the `git` command.
- **Filter by User/Author**: Specify your User ID and Git Author name to filter only your commits.
- **API Integration**: Send your daily summaries to a central API or fetch previous history.
- **Export Options**: Copy the summary as JSON to your clipboard for easy sharing.

## Usage

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
2. Run **"Show Daily Summary"**.
3. In the dashboard:
    - Select the **Date**.
    - Enter your **User ID** (e.g., `alen`).
    - Add local **Source Folders** that you want to scan.
    - Click **Generate Summary**.

## Extension Settings

This extension contributes the following settings:

* `logmycode.apiUrl`: The base URL for the LogMyCode API (default: `http://localhost:4001`).
* `logmycode.defaultUserId`: The default User ID to pre-fill in the dashboard (default: `alen`).

### Command line usage:

```bash
npx @vscode/vsce package --no-dependencies
```

## Requirements

- `git` must be installed and available in your system's PATH.
- Local folders must be valid git repositories.

## Release Notes

### 2.0.0

- **Smarter History Fetching**: Now fetches the *latest available* commit history instead of strictly the previous day's, ensuring you see your last work session even after a weekend or break.
- **Cleaner Logs**: Automatically filters out merge commits to reduce noise in your summaries.
- **Improved Architecture**: Separated internal scripts from the extension core for better performance and maintainability.

### 0.0.1

Initial release with:
- Daily summary generation from local git repos.
- API integration for sending/fetching summaries.
- Webview dashboard.
