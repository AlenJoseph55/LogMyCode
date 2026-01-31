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
  template?: string
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
`;

  const defaultInstructions = `
Instructions:
1. Group the work by repository.
2. For each repository, summarize the changes in 3-4 concise bullet points.
3. CRITICAL: Describe ACTIONS, not impact.
   - Strip phrases like "resulting in...", "which allows...", "improving...", "enhancing...".
   - Start specific points with preferred verbs: Added, Updated, Fixed, Refactored, Optimized.
   - Do NOT explain the outcome or benefit (e.g., "to improve performance"). Just state what was done (e.g., "Optimized database queries").
4. Combine related commits where appropriate but keep points purely action-oriented.
5. Calculate the total number of commits.
6. Format the output EXACTLY as follows:

LogMyCode – Daily Summary (${date})

Repos:    
• [Repo Name]
• [Summary point 1]
• [Summary point 2]
...
• [Repo Name 2]
...

Total commits: [Total Count]

Do not add any other text before or after this format.
`;

  // Use provided template (instructions) or default
  const instructions = template || defaultInstructions;

  // prompt = preamble + instructions
  // We do simple concatenation. The template should NOT contain placeholders like {{commits}} anymore,
  // as the context is now hardcoded in preamble.
  // HOWEVER, if the user *wants* to use placeholders in their instructions for some reason, we could support it,
  // but the requirement says "Summary template should only contain the instructions".
  // Let's just concatenate.

  const prompt = `${preamble}\n\n${instructions}`;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant that summarizes code changes.' },
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
