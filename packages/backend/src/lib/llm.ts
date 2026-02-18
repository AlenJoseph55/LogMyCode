import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { StoredCommit } from './db';

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function generateDailySummary(
  userId: string,
  date: string,
  commits: StoredCommit[],
  template?: string,
  otherActivities?: string
): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY not found. Returning mock summary.');
    return 'Error: GROQ_API_KEY not configured. Cannot generate AI summary.';
  }

  const byRepo = new Map<string, StoredCommit[]>();
  for (const c of commits) {
    const list = byRepo.get(c.repoName) || [];
    list.push(c);
    byRepo.set(c.repoName, list);
  }

  const commitsText = Array.from(byRepo.entries())
    .map(([repoName, repoCommits]) => {
      return `Repo: ${repoName}\n` + repoCommits.map((c) => `- ${c.message}`).join('\n');
    })
    .join('\n\n');

  const preamble = `
You are an AI assistant for a developer tool called "LogMyCode".
Your task is to generate a daily work summary based on the following git commits for User "${userId}" on Date "${date}".

Input Commits:
${commitsText}

Manual Work Log:
${otherActivities || 'None'}
`;

  const defaultFormat = `
• [Repo Name]
  - [Summary point 1]
  - [Summary point 2]
...
• [Repo Name 2]
...`;

  const userFormat = template || defaultFormat;

  const instructions = `
Instructions:
1. Group the work by repository.
2. For each repository, summarize the changes in 3-4 concise bullet points.
3. CRITICAL: Describe ACTIONS, not impact.
   - Strip phrases like "resulting in...", "which allows...", "improving...", "enhancing...".
   - Start specific points with preferred verbs: Added, Updated, Fixed, Refactored, Optimized.
   - Do NOT explain the outcome or benefit (e.g., "to improve performance"). Just state what was done (e.g., "Optimized database queries").
4. Combine related commits where appropriate but keep points purely action-oriented.
5. PROCESS MANUAL WORK LOG:
   - "Manual Work Log" entries may be informal or emotional (e.g., "Argued with testing team").
   - You MUST rewrite them into concise, professional updates (e.g., "Discussed ticket requirements with QA").
   - IF a manual entry refers to a specific repository or task context present in the commits, MERGE it as a bullet point under that repository.
   - IF it is a general activity (e.g., "Client meeting"), add it to a "General / Other" section or a relevant repository if one exists for it.
6. Calculate the total number of commits.
7. Format the output EXACTLY as follows:

${userFormat}

Do not add any other text before or after this format.
`;

  // prompt = preamble + instructions
  const prompt = `${preamble}\n\n${instructions}`;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are a strict reporting bot. You generate daily work summaries. You MUST ONLY output the summary in the requested format. Do NOT add greetings, introductions, or closing remarks. Do NOT say "Here is a daily work summary" or "Let me know if you need any further assistance or details!".',
        },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
    });
    console.log(response.choices[0]?.message?.content);
    return response.choices[0]?.message?.content || 'Failed to generate summary.';
  } catch (error) {
    console.error('Error calling Groq:', error);
    return 'Error generating summary via AI.';
  }
}
