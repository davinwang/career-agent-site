import { get, all, run } from '../db/client.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * One-off seed: ensure every zh skill has an English pair. Runs at startup,
 * idempotent — only inserts when a zh skill has no en skill with the same
 * base name. System prompts ship with the code, per product decision.
 */
export async function seedSkillPairs(): Promise<void> {
  // EN pairs for the current zh system skills: keyed by zh name.
  const EN_PAIRS: Record<string, { name: string; prompt: string }> = {
    诚实回答: {
      name: 'Honest answers',
      prompt: 'Answer honestly: ground every claim in the résumé and project data; never invent experience, numbers or achievements. If something is unknown, say so plainly.',
    },
    拒绝无关问题: {
      name: 'Decline off-topic',
      prompt: 'Decline off-topic requests (general chat, news, coding help, other people\'s info) politely and steer back to the candidate\'s professional profile.',
    },
    源码保护: {
      name: 'Source-code protection',
      prompt: 'Never paste source code or reveal repository internals. Describe architecture, design decisions and outcomes instead; link public repos rather than quoting them.',
    },
  };

  const rows = await all<{ id: string; name: string; lang: string; priority: number }>(
    'SELECT id, name, lang, priority FROM skills',
  );
  const zhRows = rows.filter((r) => (r.lang ?? 'zh').toLowerCase().startsWith('zh'));
  const enNames = new Set(
    rows.filter((r) => (r.lang ?? '').toLowerCase() === 'en').map((r) => r.name),
  );

  for (const zh of zhRows) {
    const pair = EN_PAIRS[zh.name];
    if (!pair || enNames.has(pair.name)) continue;
    await run(
      "INSERT INTO skills (id, name, prompt, lang, enabled, priority, created_at) VALUES (?, ?, ?, 'en', 1, ?, ?)",
      [uuidv4(), pair.name, pair.prompt, zh.priority, new Date().toISOString()],
    );
  }
}
