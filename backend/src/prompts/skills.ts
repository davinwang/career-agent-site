import { all } from '../db/client.js';

interface SkillRow {
  id: string;
  name: string;
  prompt: string;
  lang: string;
  enabled: number;
  priority: number;
}

export type SkillLang = 'zh' | 'en' | (string & {});

/**
 * Load enabled skills for ONE language (highest priority first) and render
 * them as a prompt fragment to append to an agent's base instructions.
 * Falls back to legacy rows: rows created before the lang column existed are
 * 'zh'; if a language has no rows we return '' (never cross-inject — an
 * English conversation must not get Chinese behavioural rules).
 */
export async function loadSkillsPrompt(lang: SkillLang = 'zh'): Promise<string> {
  let rows: SkillRow[];
  try {
    rows = await all<SkillRow>(
      'SELECT id, name, prompt, lang, enabled, priority FROM skills WHERE enabled = 1 AND lang = ? ORDER BY priority DESC, created_at ASC',
      [lang],
    );
  } catch (err) {
    // A missing/uninitialized skills table should never crash agent construction.
    console.warn('[skills] failed to load skills, continuing without them:', err);
    return '';
  }

  if (rows.length === 0) return '';

  const body = rows.map((r) => `- **${r.name}**：${r.prompt}`).join('\n');
  const label = lang.toLowerCase().startsWith('zh') ? '中文' : 'English';
  return `\n\n## 行为技能（Skills · ${label}）\n${body}`;
}

/**
 * Compose the full instructions for an agent: base prompt + enabled skills
 * in the conversation's language.
 */
export async function composeInstructions(basePrompt: string, lang: SkillLang = 'zh'): Promise<string> {
  const skills = await loadSkillsPrompt(lang);
  return `${basePrompt}${skills}`;
}
