import { all } from '../db/client.js';

interface SkillRow {
  id: string;
  name: string;
  prompt: string;
  enabled: number;
  priority: number;
}

/**
 * Load all enabled skills from the DB (highest priority first) and render them
 * as a single prompt fragment to append to an agent's base system instructions.
 *
 * Returns an empty string when no skills are enabled or the table is empty, so
 * callers can concatenate the result unconditionally.
 */
export async function loadSkillsPrompt(): Promise<string> {
  let rows: SkillRow[];
  try {
    rows = await all<SkillRow>(
      'SELECT id, name, prompt, enabled, priority FROM skills WHERE enabled = 1 ORDER BY priority DESC, created_at ASC',
    );
  } catch (err) {
    // A missing/uninitialized skills table should never crash agent construction.
    console.warn('[skills] failed to load skills, continuing without them:', err);
    return '';
  }

  if (rows.length === 0) return '';

  const body = rows.map((r) => `- **${r.name}**：${r.prompt}`).join('\n');
  return `\n\n## 行为技能（Skills）\n${body}`;
}

/**
 * Compose the full instructions for an agent: base prompt + enabled skills.
 */
export async function composeInstructions(basePrompt: string): Promise<string> {
  const skills = await loadSkillsPrompt();
  return `${basePrompt}${skills}`;
}
