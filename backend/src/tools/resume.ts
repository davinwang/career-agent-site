import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { get, run } from '../db/client.js';

interface ResumeRow {
  lang: string;
  data: string;
  updated_at: string;
}

/**
 * Read the full resume for a given language. Available to both agents.
 */
export const getFullResume = createTool({
  id: 'get-full-resume',
  description:
    'Get the full resume data for a language (default: zh). Returns the complete structured resume JSON.',
  inputSchema: z.object({
    lang: z.string().default('zh').describe('Language code: zh, en, etc.'),
  }),
  execute: async (context) => {
    try {
      const lang = context.lang || 'zh';
      const row = await get<ResumeRow>(
        'SELECT lang, data, updated_at FROM resume WHERE lang = ?',
        [lang],
      );
      if (!row) {
        return { error: `No resume found for language "${lang}"` };
      }
      const parsed = JSON.parse(row.data);
      return { lang: row.lang, updated_at: row.updated_at, data: parsed };
    } catch (err: any) {
      return { error: `Failed to read resume: ${err.message}` };
    }
  },
});

/**
 * Update a specific section of the resume. Admin only.
 * Performs atomic read-modify-write on the JSON data.
 */
export const updateResumeSection = createTool({
  id: 'update-resume-section',
  description:
    'Update a specific section of the resume. Sections: experience, projects, skills, education, summary, status, tags. Performs atomic read-modify-write.',
  inputSchema: z.object({
    lang: z.string().default('zh').describe('Language code: zh, en, etc.'),
    section: z
      .enum(['experience', 'projects', 'skills', 'education', 'summary', 'status', 'tags', 'name', 'photo'])
      .describe('Which resume section to update. "photo" takes a public URL path like /uploads/xxx.png'),
    data: z.unknown().describe('New data for the section (type depends on section)'),
  }),
  execute: async (context) => {
    try {
      const lang = context.lang || 'zh';
      const { section, data } = context;

      // Read current resume
      const row = await get<ResumeRow>(
        'SELECT lang, data, updated_at FROM resume WHERE lang = ?',
        [lang],
      );

      let resumeData: Record<string, unknown>;
      if (row) {
        resumeData = JSON.parse(row.data);
      } else {
        resumeData = {};
      }

      // Merge the section
      resumeData[section] = data;

      const now = new Date().toISOString();
      const serialized = JSON.stringify(resumeData, null, 2);

      if (row) {
        await run('UPDATE resume SET data = ?, updated_at = ? WHERE lang = ?', [
          serialized,
          now,
          lang,
        ]);
      } else {
        await run('INSERT INTO resume (lang, data, updated_at) VALUES (?, ?, ?)', [
          lang,
          serialized,
          now,
        ]);
      }

      return { ok: true, lang, section, updated_at: now };
    } catch (err: any) {
      return { error: `Failed to update resume section: ${err.message}` };
    }
  },
});
