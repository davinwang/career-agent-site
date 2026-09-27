/**
 * Resume PDF generation (pdfkit).
 *
 * Renders the structured resume data — the same JSON that powers the public
 * landing page — into an A4 PDF using the bundled Alibaba PuHuiTi fonts so that
 * Chinese (and any CJK) content renders correctly. This is a TypeScript port of
 * the legacy `common/resumepdf.py` layout.
 *
 * Font policy: hard-fail if the PuHuiTi fonts are missing. No silent fallback
 * to system fonts (avoids licensing risk and inconsistent output).
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { config } from '../config.js';

// --- Flexible resume schema --------------------------------------------------
// The resume JSON supports two shapes (bulk-edited vs. update-tool), so every
// field is optional and read defensively.

interface ExperienceItem {
  company?: string;
  role?: string;
  period?: string;
  title?: string;
  meta?: string;
  highlights?: string[];
  points?: string[];
  [key: string]: unknown;
}

interface ProjectItem {
  name?: string;
  title?: string;
  role?: string;
  period?: string;
  meta?: string;
  content?: string[];
  highlights?: string[];
  points?: string[];
  demo_link?: string;
  link?: string;
  repo_link?: string;
  attachment_link?: string;
  [key: string]: unknown;
}

interface EducationItem {
  school?: string;
  title?: string;
  degree?: string;
  field?: string;
  period?: string;
  meta?: string;
  details?: string[];
  points?: string[];
  [key: string]: unknown;
}

export interface ResumeData {
  name?: string;
  status?: string;
  tags?: string[];
  summary?: string;
  experience?: ExperienceItem[];
  projects?: ProjectItem[];
  education?: EducationItem[];
  skills?: Record<string, string[]> | string[];
  [key: string]: unknown;
}

// --- Layout constants (ported from resumepdf.py) ------------------------------

const MM = 2.834645669291339; // 1mm in PDF points
const MARGIN_LEFT = 18 * MM; // ~51pt
const MARGIN_RIGHT = 18 * MM;
const MARGIN_TOP = 16 * MM; // ~45pt
const MARGIN_BOTTOM = 18 * MM; // ~51pt
const FOOTER_OFFSET = 10 * MM; // footer sits 10mm from the bottom edge

const COLOR = {
  ink: '#1a2233',
  sub: '#5a6478',
  accent: '#2563eb',
  rule: '#e4e8f0',
} as const;

const SIZE = {
  name: 20,
  status: 10,
  tag: 9,
  h2: 12.5,
  h3: 10.5,
  meta: 8.5,
  body: 9.5,
  skill: 9.5,
  footer: 8,
} as const;

const FONT = 'PuHuiTi';
const FONT_BOLD = 'PuHuiTi-Bold';

// Section headings per language (falls back to English).
const HEADINGS: Record<string, Record<string, string>> = {
  zh: { summary: '个人简介', experience: '工作经历', projects: '项目经验', skills: '技能', education: '教育经历' },
  en: { summary: 'Summary', experience: 'Experience', projects: 'Projects', skills: 'Skills', education: 'Education' },
};

const FONT_FILES = {
  [FONT]: ['alibabapuhuiti-3-55-regular.ttf', 'alibabapuhuiti-regular.ttf'],
  [FONT_BOLD]: ['alibabapuhuiti-3-85-bold.ttf', 'alibabapuhuiti-3-105-heavy.ttf', 'alibabapuhuiti-3-65-medium.ttf'],
} as const;

/**
 * Locate a font file inside FONT_DIR. Tries the preferred canonical names first,
 * then falls back to a case-insensitive substring match against any .ttf/.otf in
 * the directory. Returns an absolute path or `undefined` when not found.
 */
function findFont(fontDir: string, candidates: readonly string[]): string | undefined {
  let entries: string[];
  try {
    entries = fs.readdirSync(fontDir);
  } catch {
    return undefined;
  }
  const fonts = entries.filter((f) => /\.(ttf|otf|ttc)$/i.test(f));

  for (const candidate of candidates) {
    const exact = fonts.find((f) => f.toLowerCase() === candidate.toLowerCase());
    if (exact) return path.join(fontDir, exact);
  }
  for (const candidate of candidates) {
    const stem = candidate.replace(/\.(ttf|otf|ttc)$/i, '').toLowerCase();
    const partial = fonts.find((f) => f.toLowerCase().includes(stem));
    if (partial) return path.join(fontDir, partial);
  }
  return undefined;
}

/** Resolve and validate both font paths, throwing a descriptive error if absent. */
function resolveFonts(): { regular: string; bold: string } {
  const fontDir = config.fontDir;
  const regular = findFont(fontDir, FONT_FILES[FONT]);

  if (!regular) {
    throw new Error(
      `找不到中文字体：请将 AlibabaPuHuiTi-3-55-Regular.ttf / AlibabaPuHuiTi-3-85-Bold.ttf 放入字体目录 "${fontDir}"（Docker 打包时随 COPY fonts/ 打入镜像），或用环境变量 FONT_DIR 指定目录。不做其它字体回退。`,
    );
  }

  // Fall back to the regular face for bold when only one weight is present.
  const bold = findFont(fontDir, FONT_FILES[FONT_BOLD]) ?? regular;
  return { regular, bold };
}

/** Coerce an unknown value into a trimmed string ('' when absent). */
function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
}

/** First present string among the candidates. */
function pick(...values: unknown[]): string {
  for (const v of values) {
    const s = str(v);
    if (s) return s;
  }
  return '';
}

/** Normalize a value that may be a string[] / string / undefined into string[]. */
function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => str(v)).filter(Boolean);
  const s = str(value);
  return s ? [s] : [];
}

/**
 * Render `resumeData` to an A4 PDF and return the bytes.
 *
 * @throws Error if the PuHuiTi fonts cannot be located.
 */
export async function generateResumePdf(resumeData: ResumeData, lang = 'zh'): Promise<Buffer> {
  const data = resumeData ?? {};
  const name = str(data.name) || '候选人';
  const h = HEADINGS[lang] ?? HEADINGS.en;
  const { regular, bold } = resolveFonts();

  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
    info: {
      Title: `${name} - Resume${lang && lang !== 'zh' ? ` (${lang})` : ''}`,
      Author: name,
    },
  });

  doc.registerFont(FONT, regular);
  doc.registerFont(FONT_BOLD, bold);

  const contentWidth = doc.page.width - MARGIN_LEFT - MARGIN_RIGHT;

  // -- primitives -------------------------------------------------------------

  /** Thin horizontal rule at the current cursor, then advance below it. */
  const rule = (thickness: number, gap = 6): void => {
    const y = doc.y + 2;
    doc.moveTo(MARGIN_LEFT, y).lineTo(doc.page.width - MARGIN_RIGHT, y).lineWidth(thickness).strokeColor(COLOR.rule).stroke();
    doc.x = MARGIN_LEFT;
    doc.y = y + gap;
  };

  const body = (text: string): void => {
    doc.font(FONT).fontSize(SIZE.body).fillColor(COLOR.ink).text(text, MARGIN_LEFT, doc.y, { width: contentWidth, lineGap: 2 });
  };

  const bullet = (text: string): void => {
    doc.font(FONT).fontSize(SIZE.body).fillColor(COLOR.ink).text(`•  ${text}`, MARGIN_LEFT + 2, doc.y, {
      width: contentWidth - 2,
      lineGap: 2,
    });
  };

  const meta = (text: string): void => {
    doc.font(FONT).fontSize(SIZE.meta).fillColor(COLOR.sub).text(text, MARGIN_LEFT, doc.y, { width: contentWidth });
  };

  /** Section heading (h2 bold) with a rule underneath. */
  const section = (title: string): void => {
    doc.moveDown(0.6);
    doc.font(FONT_BOLD).fontSize(SIZE.h2).fillColor(COLOR.ink).text(title, MARGIN_LEFT, doc.y, { width: contentWidth });
    doc.moveDown(0.2);
    rule(0.6, 5);
  };

  /** Sub-heading (h3 bold) with an inline, sub-colored period on the same line. */
  const headingWithPeriod = (title: string, period: string): void => {
    const hasPeriod = period.length > 0;
    doc.font(FONT_BOLD).fontSize(SIZE.h3).fillColor(COLOR.ink).text(title, MARGIN_LEFT, doc.y, {
      width: contentWidth,
      continued: hasPeriod,
    });
    if (hasPeriod) {
      doc.font(FONT).fontSize(SIZE.meta).fillColor(COLOR.sub).text(`   ${period}`);
    }
  };

  // -- header -----------------------------------------------------------------

  doc.font(FONT_BOLD).fontSize(SIZE.name).fillColor(COLOR.ink).text(name, MARGIN_LEFT, doc.y, { width: contentWidth });
  doc.moveDown(0.15);

  const status = str(data.status);
  if (status) {
    doc.font(FONT).fontSize(SIZE.status).fillColor(COLOR.sub).text(status, MARGIN_LEFT, doc.y, { width: contentWidth });
    doc.moveDown(0.2);
  }

  const tags = list(data.tags);
  if (tags.length) {
    doc.font(FONT).fontSize(SIZE.tag).fillColor(COLOR.accent).text(tags.join(' · '), MARGIN_LEFT, doc.y, { width: contentWidth, lineGap: 1 });
    doc.moveDown(0.3);
  }

  rule(1, 8);

  // -- summary ----------------------------------------------------------------

  const summary = str(data.summary);
  if (summary) {
    section(h.summary);
    body(summary);
  }

  // -- experience -------------------------------------------------------------

  const experience = Array.isArray(data.experience) ? data.experience : [];
  if (experience.length) {
    section(h.experience);
    for (const e of experience) {
      const title = pick(e.title, [str(e.company), str(e.role)].filter(Boolean).join(' · '), e.company, e.role);
      const period = pick(e.period, e.meta);
      const role = str(e.role);
      const points = list(e.highlights?.length ? e.highlights : e.points);

      if (title) headingWithPeriod(title, title === role ? '' : period);
      else if (period) meta(period);

      // Show the role on its own line when it wasn't folded into the title.
      if (role && title !== role && !title.includes(role)) {
        doc.font(FONT).fontSize(SIZE.body).fillColor(COLOR.sub).text(role, MARGIN_LEFT, doc.y, { width: contentWidth });
      }
      for (const p of points) bullet(p);
      doc.moveDown(0.4);
    }
  }

  // -- projects ---------------------------------------------------------------

  const projects = Array.isArray(data.projects) ? data.projects : [];
  if (projects.length) {
    section(h.projects);
    for (const p of projects) {
      const title = pick(p.title, p.name);
      const period = pick(p.period, p.meta);
      const role = str(p.role);
      const content = list(p.content?.length ? p.content : p.points);
      const highlights = list(p.highlights);
      const demo = pick(p.demo_link, p.link);
      const repo = pick(p.repo_link);
      const attachment = pick(p.attachment_link);

      if (title) headingWithPeriod(title, period);
      else if (period) meta(period);
      if (role) {
        doc.font(FONT).fontSize(SIZE.body).fillColor(COLOR.sub).text(role, MARGIN_LEFT, doc.y, { width: contentWidth });
      }
      for (const c of content) bullet(c);
      for (const hl of highlights) bullet(hl);

      const links: string[] = [];
      if (demo) links.push(demo);
      if (repo) links.push(`[源代码] ${repo}`);
      if (attachment) links.push(`[附件] ${attachment}`);
      if (links.length) {
        doc.font(FONT).fontSize(SIZE.meta).fillColor(COLOR.accent).text(links.join('  |  '), MARGIN_LEFT + 2, doc.y, {
          width: contentWidth - 2,
        });
      }
      doc.moveDown(0.4);
    }
  }

  // -- education --------------------------------------------------------------

  const education = Array.isArray(data.education) ? data.education : [];
  if (education.length) {
    section(h.education);
    for (const ed of education) {
      const school = pick(ed.school, ed.title);
      const degree = str(ed.degree);
      const field = str(ed.field);
      const period = pick(ed.period, ed.meta);
      const head = school + (degree ? ` · ${degree}` : '');
      const subline = [field, period].filter(Boolean).join(' · ');

      if (head) headingWithPeriod(head, '');
      if (subline) meta(subline);
      for (const d of list(ed.details?.length ? ed.details : ed.points)) bullet(d);
      doc.moveDown(0.4);
    }
  }

  // -- skills -----------------------------------------------------------------

  const skills = data.skills;
  const hasSkills =
    (skills && !Array.isArray(skills) && Object.keys(skills).length > 0) || (Array.isArray(skills) && skills.length > 0);
  if (hasSkills) {
    section(h.skills);
    if (Array.isArray(skills)) {
      for (const s of skills) {
        doc.font(FONT).fontSize(SIZE.skill).fillColor(COLOR.ink).text(str(s), MARGIN_LEFT, doc.y, { width: contentWidth, lineGap: 1 });
      }
    } else if (skills && typeof skills === 'object') {
      for (const [group, items] of Object.entries(skills as Record<string, unknown>)) {
        const parts = list(items);
        doc.font(FONT_BOLD).fontSize(SIZE.skill).fillColor(COLOR.ink).text(`${group}：`, MARGIN_LEFT, doc.y, {
          width: contentWidth,
          continued: parts.length > 0,
        });
        if (parts.length) {
          doc.font(FONT).fontSize(SIZE.skill).fillColor(COLOR.ink).text(parts.join('、'), { width: contentWidth, lineGap: 1 });
        }
        doc.moveDown(0.15);
      }
    }
  }

  // -- footers (drawn onto every buffered page) -------------------------------

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = doc.page.height - FOOTER_OFFSET - SIZE.footer;
    doc.font(FONT).fontSize(SIZE.footer).fillColor(COLOR.sub).text(`${name} · ${i + 1}`, MARGIN_LEFT, footerY, {
      width: contentWidth,
      align: 'center',
    });
  }

  // -- collect bytes ----------------------------------------------------------

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}
