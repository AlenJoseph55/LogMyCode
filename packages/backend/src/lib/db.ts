import { Pool } from 'pg';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// ---------- Types & validation ----------

export const CommitSchema = z.object({
  hash: z.string(),
  message: z.string(),
  timestamp: z.string().optional(),
});

export const RepoCommitsSchema = z.object({
  name: z.string(),
  commits: z.array(CommitSchema),
});

export const BulkCommitPayloadSchema = z.object({
  userId: z.string(),
  date: z.string(),
  repos: z.array(RepoCommitsSchema),
  template: z.string().optional(),
});

export type BulkCommitPayload = z.infer<typeof BulkCommitPayloadSchema>;

export type StoredCommit = {
  id: string;
  userId: string;
  repoId: string;
  repoName: string;
  hash: string;
  message: string;
  committedAt: string;
  insertedAt: string;
};

export type StoredSummary = {
  id: string;
  userId: string;
  date: string;
  summary: string;
  totalCommits: number;
  createdAt: string;
};

// ---------- DB Connection ----------

const pool = new Pool({
  connectionString: process.env.NEONDB_API_KEY,
  ssl: {
    rejectUnauthorized: false,
  },
});

// ---------- Init ----------

export async function initDb() {
  const client = await pool.connect();
  try {
    // Enable pgcrypto for UUID generation
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS repos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, name)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS commits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        repo_id UUID REFERENCES repos(id),
        hash TEXT NOT NULL,
        message TEXT NOT NULL,
        committed_at TIMESTAMP NOT NULL,
        inserted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(repo_id, hash)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        date DATE NOT NULL,
        summary TEXT NOT NULL,
        total_commits INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, date)
      );
    `);

    console.log('Database initialized (normalized schema).');
  } catch (err) {
    console.error('Error initializing DB:', err);
  } finally {
    client.release();
  }
}

// ---------- Commits ----------

export async function saveCommits(payload: BulkCommitPayload) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `INSERT INTO users (username) VALUES ($1) 
       ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username 
       RETURNING id`,
      [payload.userId]
    );
    const userId = userRes.rows[0].id;

    for (const repo of payload.repos) {
      const repoRes = await client.query(
        `INSERT INTO repos (user_id, name) VALUES ($1, $2)
         ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [userId, repo.name]
      );
      const repoId = repoRes.rows[0].id;

      for (const commit of repo.commits) {
        const committedAt = commit.timestamp || new Date().toISOString();

        await client.query(
          `INSERT INTO commits (user_id, repo_id, hash, message, committed_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (repo_id, hash) DO UPDATE SET message = EXCLUDED.message`,
          [userId, repoId, commit.hash, commit.message, committedAt]
        );
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getCommits(username: string, date: string): Promise<StoredCommit[]> {
  // We need to join users, repos, commits
  // And filter by date (committed_at or inserted_at? User asked for daily summary based on date.
  // Usually git commits have their own date. The payload has a "date" field which implies the "work log date".
  // But the commits table stores `committed_at`.
  // If we filter by `committed_at` matching the `date`, we might miss commits made previous night but pushed today.
  // However, the prompt implies "Generate daily work logs... from your git commits".
  // Let's assume we filter by the `date` passed in the query, comparing it to `committed_at`.
  // OR, we rely on the fact that the user POSTed these commits for this specific date.
  // But since we are now storing them permanently, we should query by `committed_at::DATE = date`.

  const res = await pool.query(
    `SELECT 
       c.id,
       c.user_id as "userId",
       c.repo_id as "repoId",
       r.name as "repoName",
       c.hash,
       c.message,
       c.committed_at as "committedAt",
       c.inserted_at as "insertedAt"
     FROM commits c
     JOIN users u ON c.user_id = u.id
     JOIN repos r ON c.repo_id = r.id
     WHERE u.username = $1 AND c.committed_at::DATE = $2::DATE`,
    [username, date]
  );

  return res.rows;
}

// ---------- Summaries ----------

export async function saveSummary(
  username: string,
  date: string,
  summary: string,
  totalCommits: number
) {
  const client = await pool.connect();
  try {
    // Get user ID
    const userRes = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      throw new Error(`User ${username} not found`);
    }
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO daily_summaries (user_id, date, summary, total_commits)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, date) 
       DO UPDATE SET summary = EXCLUDED.summary, total_commits = EXCLUDED.total_commits, created_at = NOW()`,
      [userId, date, summary, totalCommits]
    );
  } finally {
    client.release();
  }
}

export async function getSummary(
  username: string,
  date: string
): Promise<StoredSummary | undefined> {
  const res = await pool.query(
    `SELECT 
       s.id,
       s.user_id as "userId",
       s.date::TEXT as "date", -- Cast to text to avoid timezone issues in JS Date object
       s.summary,
       s.total_commits as "totalCommits",
       s.created_at as "createdAt"
     FROM daily_summaries s
     JOIN users u ON s.user_id = u.id
     WHERE u.username = $1 AND s.date = $2`,
    [username, date]
  );
  return res.rows[0];
}
export async function getLatestSummaryBeforeDate(
  username: string,
  date: string
): Promise<StoredSummary | undefined> {
  const res = await pool.query(
    `SELECT 
       s.id,
       s.user_id as "userId",
       s.date::TEXT as "date",
       s.summary,
       s.total_commits as "totalCommits",
       s.created_at as "createdAt"
     FROM daily_summaries s
     JOIN users u ON s.user_id = u.id
     WHERE u.username = $1 AND s.date < $2
     ORDER BY s.date DESC
     LIMIT 1`,
    [username, date]
  );
  return res.rows[0];
}
