import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { StoredCommit } from './db';

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Make the LLM model configurable via environment variable.
// Default fallback model: 'qwen-3.6-27b' (Qwen 3.6 27B)
const LLM_MODEL = process.env.LLM_MODEL || 'qwen-3.6-27b';

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

  const placeholders = ['none', 'no manual work log entries to report', ''];
  const isManualEmpty =
    !otherActivities || placeholders.includes(otherActivities.toLowerCase().trim());

  if (commits.length === 0 && isManualEmpty) {
    return '';
  }

  const sanitizedActivities = isManualEmpty ? 'None' : otherActivities;

  const preamble = `
You are an AI assistant for a developer tool called "LogMyCode".
Your task is to generate a daily work summary based on the following git commits for User "${userId}" on Date "${date}".

Input Commits:
${commitsText}

Manual Work Log:
${sanitizedActivities}
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
   - "Manual Work Log" entries may be informal, emotional, or placeholders (e.g., "None", "No manual work log entries to report", "Argued with testing team").
   - IF the log only contains placeholders like "None" or "No manual work log entries to report", IGNORE IT ENTIRELY.
   - Otherwise, you MUST rewrite them into concise, professional updates (e.g., "Discussed ticket requirements with QA").
   - IF a manual entry refers to a specific repository or task context present in the commits, MERGE it as a bullet point under that repository.
   - IF it is a general activity (e.g., "Client meeting"), add it to a "General / Other" section ONLY if it's a real activity.
6. NO PLACEHOLDERS: Do NOT include sections or bullet points like "No general activities", "No commits", "None", or "No work found". If a section has no content, OMIT it.
7. EMPTY STATE HANDLING:
   - IF there are NO commits AND the Manual Work Log is "None" or empty/placeholder, you MUST return absolutely NOTHING. No text, no headings, no spaces. Your output length should be 0.
8. Format the output EXACTLY as follows:

${userFormat}

Do not add any other text before or after this format. If the result is empty based on rule 7, ignore this format and return an empty string "".
`;

  // prompt = preamble + instructions
  const prompt = `${preamble}\n\n${instructions}`;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are a strict reporting bot. You generate daily work summaries. You MUST ONLY output the summary in the requested format. If there is no work to report and no commits, you MUST return an empty string.',
        },
        { role: 'user', content: prompt },
      ],
      model: LLM_MODEL,
      temperature: 0.5,
    });
    let content = response.choices[0]?.message?.content?.trim();

    // Final fallback if LLM still returned placeholder-like text
    if (
      content &&
      (content.toLowerCase().includes('no commits') ||
        content.toLowerCase().includes('no work found') ||
        content.toLowerCase() === 'none')
    ) {
      if (commits.length === 0 && isManualEmpty) {
        return '';
      }
    }

    // Aggressively strip trailing placeholder sections if they slip through
    if (content && isManualEmpty) {
      const gO = '• General / Other';
      const pText = '- No manual work log entries to report';
      if (content.includes(gO) && content.includes(pText)) {
        content = content.replace(new RegExp(`${gO}\\s*${pText}`, 'g'), '').trim();
      }
    }

    console.log(content);
    return content || 'Failed to generate summary.';
  } catch (error) {
    console.error('Error calling Groq:', error);
    return 'Error generating summary via AI.';
  }
}
