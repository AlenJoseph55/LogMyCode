# Contributing to LogMyCode

Thank you for your interest in contributing to **LogMyCode**! We welcome contributions from the community to help make this tool better for everyone.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/LogMyCode.git
    cd LogMyCode
    ```
3.  **Install dependencies**:
    ```bash
    pnpm install
    ```
4.  **Create a new branch** for your feature or bug fix:
    ```bash
    git checkout -b features/my-new-feature
    ```

## Development Workflow

### Project Structure

This is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces).

- `packages/vscode-extension`: The VS Code extension source code.
- `packages/backend`: The backend API server.

### Running Locally

Refer to the [README.md](./README.md) for detailed instructions on how to run the extension and backend in development mode.

### Code Style

We use **ESLint** and **Prettier** to maintain code quality.

- Run linting: `pnpm run lint`
- Format code: `pnpm run format`

Before submitting a PR, ensure your code passes all linting checks.

## Submitting a Pull Request

1.  Push your branch to GitHub.
2.  Open a Pull Request against the `main` branch.
3.  Fill out the PR template with details about your changes.
4.  Ensure all CI checks pass.

## Reporting Bugs

Please use the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md) to report issues. Provide as much detail as possible, including steps to reproduce and logical logs.

## Code of Conduct

Please note that this project is released with a [Code of Conduct](./CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.
