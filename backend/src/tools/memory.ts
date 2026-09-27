import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { all, run } from '../db/client.js';

interface FactRow {
  id: string;
  content: string;
  created_at: string;
}

/**
 * Store a durable fact in long-term memory. Admin only.
 */
export const rememberFact = createTool({
  id: 'remember-fact',
  description:
    'Save a durable fact to long-term memory (e.g., job preferences, salary policy, talking points, boundaries). These facts inform both the admin and recruiter agents.',
  inputSchema: z.object({
    content: z.string().min(1).describe('The fact to remember'),
  }),
  execute: async (context) => {
    try {
      const { content } = context;
      const id = uuidv4();
      const now = new Date().toISOString();

      await run(
        'INSERT INTO facts (id, content, created_at) VALUES (?, ?, ?)',
        [id, content.trim(), now],
      );

      return { ok: true, id, content: content.trim(), created_at: now };
    } catch (err: any) {
      return { error: `Failed to save fact: ${err.message}` };
    }
  },
});

/**
 * Recall facts from long-term memory. Available to both agents.
 * Optionally filters by substring match on query.
 */
export const recallFacts = createTool({
  id: 'recall-facts',
  description:
    'Recall stored long-term facts. Optionally filter by a query string (substring match). Returns all matching facts.',
  inputSchema: z.object({
    query: z.string().optional().describe('Optional filter: return facts containing this substring'),
  }),
  execute: async (context) => {
    try {
      const query = context.query?.trim();

      let rows: FactRow[];
      if (query) {
        // Use SQL LIKE for substring match
        rows = await all<FactRow>(
          'SELECT id, content, created_at FROM facts WHERE content LIKE ? ORDER BY created_at DESC',
          [`%${query}%`],
        );
      } else {
        rows = await all<FactRow>(
          'SELECT id, content, created_at FROM facts ORDER BY created_at DESC',
        );
      }

      return { facts: rows, count: rows.length };
    } catch (err: any) {
      return { error: `Failed to recall facts: ${err.message}` };
    }
  },
});

/**
 * Delete a fact by ID. Admin only.
 */
export const forgetFact = createTool({
  id: 'forget-fact',
  description: 'Delete a specific fact from long-term memory by its ID.',
  inputSchema: z.object({
    id: z.string().describe('The fact ID to delete'),
  }),
  execute: async (context) => {
    try {
      const { id } = context;
      const result = await run('DELETE FROM facts WHERE id = ?', [id]);

      if (result.rowsAffected === 0) {
        return { error: `No fact found with id: ${id}` };
      }

      return { ok: true, deleted: id };
    } catch (err: any) {
      return { error: `Failed to delete fact: ${err.message}` };
    }
  },
});
