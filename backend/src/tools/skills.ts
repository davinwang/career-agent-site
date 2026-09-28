import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { get, all, run } from '../db/client.js';

interface SkillRow {
  id: string;
  name: string;
  prompt: string;
  enabled: number;
  priority: number;
}

/**
 * List all skills (agent-facing view, includes disabled ones).
 * Admin agent only. Used to inspect the current skill configuration
 * ("看一下现在配置了哪些提示词/Skills").
 */
export const listSkills = createTool({
  id: 'list-skills',
  description:
    'List all configured behaviour skills (prompts appended to agent system instructions), with enabled state and priority.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const rows = await all<SkillRow>(
        'SELECT id, name, prompt, enabled, priority FROM skills ORDER BY priority DESC, created_at ASC',
      );
      return { skills: rows.map((r) => ({ ...r, enabled: !!r.enabled })) };
    } catch (err: any) {
      return { error: `Failed to list skills: ${err.message}` };
    }
  },
});

/**
 * Create a new skill. Admin only.
 */
export const createSkill = createTool({
  id: 'create-skill',
  description:
    'Create a new behaviour skill (a prompt fragment appended to agent system instructions). Use for mentorship guidance like 外企英语简历准备, 转型方向辅导 etc.',
  inputSchema: z.object({
    name: z.string().min(1).describe('Short skill name, e.g. 外企求职辅导'),
    prompt: z.string().min(1).describe('The prompt fragment content'),
    priority: z.number().int().default(0).describe('Higher priority sorts first'),
  }),
  execute: async (context) => {
    try {
      const { name, prompt, priority = 0 } = context;
      const id = uuidv4();
      await run(
        'INSERT INTO skills (id, name, prompt, enabled, priority, created_at) VALUES (?, ?, ?, 1, ?, ?)',
        [id, name, prompt, priority, new Date().toISOString()],
      );
      return { ok: true, id, name, enabled: true, priority };
    } catch (err: any) {
      return { error: `Failed to create skill: ${err.message}` };
    }
  },
});

/**
 * Update an existing skill (name/prompt/enabled/priority). Admin only.
 */
export const updateSkill = createTool({
  id: 'update-skill',
  description:
    'Update an existing behaviour skill by id. All fields optional; enabled toggles whether it is appended to agent instructions.',
  inputSchema: z.object({
    id: z.string().describe('Skill id from listSkills'),
    name: z.string().min(1).optional(),
    prompt: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().optional(),
  }),
  execute: async (context) => {
    try {
      const { id, name, prompt, enabled, priority } = context;
      const existing = await get<SkillRow>('SELECT id FROM skills WHERE id = ?', [id]);
      if (!existing) {
        return { error: `Skill not found: ${id}` };
      }

      const sets: string[] = [];
      const params: Array<string | number> = [];
      if (name !== undefined) {
        sets.push('name = ?');
        params.push(name);
      }
      if (prompt !== undefined) {
        sets.push('prompt = ?');
        params.push(prompt);
      }
      if (enabled !== undefined) {
        sets.push('enabled = ?');
        params.push(enabled ? 1 : 0);
      }
      if (priority !== undefined) {
        sets.push('priority = ?');
        params.push(priority);
      }
      if (sets.length === 0) {
        return { error: 'Nothing to update' };
      }

      await run(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      return { ok: true, id };
    } catch (err: any) {
      return { error: `Failed to update skill: ${err.message}` };
    }
  },
});

/**
 * Delete a skill. Admin only.
 */
export const deleteSkill = createTool({
  id: 'delete-skill',
  description: 'Delete a behaviour skill by id.',
  inputSchema: z.object({
    id: z.string().describe('Skill id from listSkills'),
  }),
  execute: async (context) => {
    try {
      const { id } = context;
      const existing = await get<SkillRow>('SELECT id FROM skills WHERE id = ?', [id]);
      if (!existing) {
        return { error: `Skill not found: ${id}` };
      }
      await run('DELETE FROM skills WHERE id = ?', [id]);
      return { ok: true, id };
    } catch (err: any) {
      return { error: `Failed to delete skill: ${err.message}` };
    }
  },
});
