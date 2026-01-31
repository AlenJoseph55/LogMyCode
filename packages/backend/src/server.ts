import express from 'express';
import {
  initDb,
  saveCommits,
  saveSummary,
  getSummary,
  getCommits,
  getLatestSummaryBeforeDate,
  StoredCommit,
  BulkCommitPayloadSchema,
} from './lib/db';
import { generateDailySummary } from './lib/llm';

const app = express();
const PORT = process.env.PORT || 4001;

app.use(express.json());

initDb();

app.post('/api/commits', async (req, res) => {
  const parsed = BulkCommitPayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.format(),
    });
  }

  const payload = parsed.data;

  try {
    await saveCommits(payload);
    const dayCommits = await getCommits(payload.userId, payload.date);

    const summaryText = await generateDailySummary(
      payload.userId,
      payload.date,
      dayCommits,
      payload.template
    );

    const totalCommits = dayCommits.length;

    console.log('Summary generated successfully!', summaryText);

    await saveSummary(payload.userId, payload.date, summaryText, totalCommits);

    const byRepo = new Map<string, StoredCommit[]>();
    for (const entry of dayCommits) {
      const list = byRepo.get(entry.repoName) || [];
      list.push(entry);
      byRepo.set(entry.repoName, list);
    }

    const repos: {
      name: string;
      commits: { hash: string; message: string }[];
    }[] = [];

    for (const [repoName, entries] of byRepo.entries()) {
      const seen = new Set<string>();
      const uniqueCommits: { hash: string; message: string }[] = [];
      for (const c of entries) {
        if (!seen.has(c.hash)) {
          seen.add(c.hash);
          uniqueCommits.push({
            hash: c.hash,
            message: c.message,
          });
        }
      }

      repos.push({
        name: repoName,
        commits: uniqueCommits,
      });
    }

    return res.json({
      userId: payload.userId,
      date: payload.date,
      summary: summaryText,
      repos,
    });
  } catch (error) {
    console.error('Error processing commits:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/daily-summary', async (req, res) => {
  const userId = (req.query.userId as string) || '';
  const date = (req.query.date as string) || '';
  if (!userId || !date) {
    return res.status(400).json({
      error: 'Missing userId or date',
    });
  }

  try {
    const storedSummary = await getSummary(userId, date);
    const dayCommits = await getCommits(userId, date);

    const byRepo = new Map<string, StoredCommit[]>();
    for (const entry of dayCommits) {
      const list = byRepo.get(entry.repoName) || [];
      list.push(entry);
      byRepo.set(entry.repoName, list);
    }

    const repos: {
      name: string;
      commits: { hash: string; message: string }[];
    }[] = [];

    for (const [repoName, entries] of byRepo.entries()) {
      const seen = new Set<string>();
      const uniqueCommits: { hash: string; message: string }[] = [];
      for (const c of entries) {
        if (!seen.has(c.hash)) {
          seen.add(c.hash);
          uniqueCommits.push({
            hash: c.hash,
            message: c.message,
          });
        }
      }

      repos.push({
        name: repoName,
        commits: uniqueCommits,
      });
    }

    return res.json({
      userId,
      date,
      summary: storedSummary?.summary || 'No summary generated yet.',
      repos,
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/recent-summaries', async (req, res) => {
  console.log('Received request for recent summaries');
  const userId = (req.query.userId as string) || '';
  const dateStr = req.query.date as string;
  console.log(dateStr);
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    const [todaySummary, lastSummary] = await Promise.all([
      getSummary(userId, dateStr),
      getLatestSummaryBeforeDate(userId, dateStr),
    ]);

    let yesterdayDate = null;
    if (lastSummary) {
      yesterdayDate = lastSummary.date;
    }

    return res.json({
      userId,
      today: {
        date: dateStr,
        summary: todaySummary?.summary || null,
        totalCommits: todaySummary?.totalCommits || 0,
      },
      yesterday: {
        date: yesterdayDate || 'N/A',
        summary: lastSummary?.summary || null,
        totalCommits: lastSummary?.totalCommits || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching recent summaries:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`LogMyCode backend listening on port ${PORT}`);
});
