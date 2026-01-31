# LogMyCode

**LogMyCode** is a developer productivity tool that automatically captures your daily git commits and uses AI to generate concise, readable work summaries for standups, work logs, or Jira updates.

The project is a monorepo containing:
- **VS Code Extension** (`packages/vscode-extension`): The client-side tool to scan repos and display summaries.
- **Backend API** (`packages/backend`): The server that handles data persistence and AI summarization.

## Features

- **Automated Summaries**: Scans your local git repositories for commits made on a specific date.
- **AI-Powered**: Uses Groq LLM to turn raw commit messages into professional bullet points.
- **Multi-Repo Support**: Aggregates work across multiple projects into a single daily report.
- **History Tracking**: View "Today" and "Yesterday" summaries to stay on top of your progress.
- **Privacy-Focused**: Commits are processed securely, and only the summary is generated.

## Getting Started

### Prerequisites
- Node.js (v18+)
- pnpm
- PostgreSQL (or NeonDB) account
- Groq API Key

### 1. Setup Backend

1. Navigate to the backend directory:
   ```bash
   cd packages/backend
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Configure environment variables:
   - Copy the example file:
     ```bash
     cp .env.example .env
     ```
   - Edit `.env` and add your `NEONDB_API_KEY` (Postgres connection string) and `GROQ_API_KEY`.
4. Start the server:
   ```bash
   pnpm run dev
   ```
   The server will run on `http://localhost:4001`.

### 2. Run VS Code Extension

1. Open the project in VS Code.
2. Navigate to `packages/vscode-extension`.
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Press `F5` to launch the extension in a new VS Code Extension Development Host window.
5. In the new window, open the command palette (`Ctrl+Shift+P`) and run:
   ```
   LogMyCode: Show Daily Summary
   ```
6. Configure the extension settings if needed (search for "LogMyCode" in settings) to point to your local backend (`http://localhost:4001/api`).

## Development

- **Build Backend**: `pnpm run build`
- **Lint Extension**: `pnpm run lint`
- **Test Extension**: `pnpm test`

## Project Structure

- `packages/backend`: Express.js server with PostgreSQL and Groq SDK.
- `packages/vscode-extension`: VS Code Webview-based extension.
