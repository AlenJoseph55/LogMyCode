import * as cp from 'child_process';
import * as util from 'util';
import * as path from 'path';

const exec = util.promisify(cp.exec);

export interface Commit {
  hash: string;
  message: string;
  timestamp: string;
}

export interface RepoCommits {
  name: string;
  commits: Commit[];
}

export class GitService {
  public async getCommitsForDay(
    folderPath: string,
    dateStr: string,
    author: string
  ): Promise<RepoCommits> {
    const since = `${dateStr} 00:00:00`;
    const until = `${dateStr} 23:59:59`;

    // Use simpler format first to debounce quoting issues, but %H|%s|%aI is standard.
    // Ensure author is safe to use in command
    const cleanAuthor = author.replace(/"/g, '\\"');

    const command = `git log --no-merges --all --author="${cleanAuthor}" --since="${since}" --until="${until}" --pretty=format:"%H|%s|%aI"`;

    console.log(`[GitService] Executing in ${folderPath}: ${command}`);

    try {
      const { stdout } = await exec(command, { cwd: folderPath });

      const commits: Commit[] = [];

      if (stdout.trim()) {
        const lines = stdout.split('\n');
        for (const line of lines) {
          const parts = line.split('|');
          if (parts.length < 3) {
            continue;
          }

          const [hash, message, timestamp] = parts;
          commits.push({
            hash,
            message,
            timestamp,
          });
        }
      }

      console.log(`[GitService] Found ${commits.length} commits in ${folderPath}`);

      return {
        name: path.basename(folderPath),
        commits,
      };
    } catch (error) {
      console.error(`[GitService] Error fetching commits for ${folderPath}:`, error);
      // Return empty commits but maybe we should surface the error?
      // For now, let's just log it.
      return {
        name: path.basename(folderPath),
        commits: [],
      };
    }
  }

  public async getGlobalGitUser(): Promise<string> {
    try {
      const { stdout } = await exec('git config --global user.name');
      return stdout.trim();
    } catch (error) {
      console.warn('Failed to get global git user:', error);
      return '';
    }
  }
}
