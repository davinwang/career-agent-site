import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findAndStoreLogo } from '../services/logo.js';
import { get, run } from '../db/client.js';

interface ResumeRow {
  lang: string;
  data: string;
}

/** Match an experience/education entry by company/school name (fuzzy contains). */
function findEntry(
  resumeData: Record<string, unknown>,
  kind: 'company' | 'school',
  name: string,
): { list: Array<Record<string, unknown>>; index: number; key: string } | null {
  const key = kind === 'company' ? 'experience' : 'education';
  const list = resumeData[key];
  if (!Array.isArray(list)) return null;
  const lower = name.toLowerCase();
  const index = list.findIndex((item) => {
    const target = kind === 'company' ? (item as Record<string, unknown>).company : (item as Record<string, unknown>).school;
    return typeof target === 'string' && (target.toLowerCase().includes(lower) || lower.includes(target.toLowerCase()));
  });
  return index >= 0 ? { list: list as Array<Record<string, unknown>>, index, key } : null;
}

/**
 * findLogo — admin agent tool. Searches the web for an organization's
 * logo (Bing -> official site icons -> Wikipedia thumbnail), normalizes
 * it through the same sharp pipeline as uploads, stores it, and backfills
 * the matching experience/education entry in BOTH language versions.
 */
export const findLogo = createTool({
  id: 'find-logo',
  description:
    'Search the web for a company or school logo, normalize it to a 256x256 PNG, store it, ' +
    'and set it as the logo of the matching experience (company) or education (school) entry ' +
    'in both language versions of the resume. Use this whenever the user asks to find/add a logo.',
  inputSchema: z.object({
    kind: z.enum(['company', 'school']).describe('Whether the logo is for a work-experience company or an education school entry.'),
    name: z.string().describe('Organization name as it should be searched, e.g. "国泰君安期货" or "上海交通大学".'),
    domain: z.string().optional().describe('Official site domain if already known, e.g. "gtjaqh.com" — skips the search step.'),
  }),
  execute: async (context) => {
    try {
      const { kind, name, domain } = context;
      const result = await findAndStoreLogo({ name, domain, kind });
      if (!result) {
        return {
          error:
            `未能找到「${name}」的可用 logo（搜索官网图标与 Wikipedia 均失败）。` +
            `可以请用户提供域名重试，或让用户上传图片（上传后会自动 normalize）。`,
        };
      }

      // Backfill both language resumes where an entry matches by name.
      const updated: string[] = [];
      for (const lang of ['zh', 'en']) {
        const row = await get<ResumeRow>('SELECT lang, data FROM resume WHERE lang = ?', [lang]);
        if (!row) continue;
        const resumeData = JSON.parse(row.data) as Record<string, unknown>;
        const hit = findEntry(resumeData, kind, name);
        if (!hit) continue;
        hit.list[hit.index].logo = result.path;
        await run('UPDATE resume SET data = ?, updated_at = ? WHERE lang = ?', [
          JSON.stringify(resumeData, null, 2),
          new Date().toISOString(),
          lang,
        ]);
        updated.push(lang);
      }

      return {
        ok: true,
        logo_path: result.path,
        source: result.source,
        updated_resume_langs: updated,
        note: updated.length
          ? `已回填到 ${updated.join('/')} 简历对应条目。`
          : 'logo 已存储，但简历中没有匹配的公司/学校条目——请用 updateResumeSection 手动指定。',
      };
    } catch (err: any) {
      return { error: `findLogo failed: ${err.message}` };
    }
  },
});
