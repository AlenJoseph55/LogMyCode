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
    
    public async getCommitsForDay(folderPath: string, date: Date, author: string): Promise<RepoCommits> {
        const dateStr = date.toISOString().split('T')[0]; 
        const since = `${dateStr} 00:00:00`;
        const until = `${dateStr} 23:59:59`;
        
        const command = `git log --no-merges --all --author="${author}" --since="${since}" --until="${until}" --pretty=format:"%H|%s|%aI"`;
        
        try {
            const { stdout } = await exec(command, { cwd: folderPath });
            
            const commits: Commit[] = [];
            
            if (stdout.trim()) {
                const lines = stdout.split('\n');
                for (const line of lines) {
                    const [hash, message, timestamp] = line.split('|');
                    commits.push({
                        hash,
                        message,
                        timestamp
                    });
                }
            }
            
            return {
                name: path.basename(folderPath),
                commits
            };
        } catch (error) {
            console.error(`Error fetching commits for ${folderPath}:`, error);
            return {
                name: path.basename(folderPath),
                commits: []
            };
        }
    }
}
