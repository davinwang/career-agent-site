import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { ROOT_DIR, config } from '../config.js';
import { run, get, closeDb } from './client.js';

/**
 * Seed script:
 *  - Creates the admin user from ADMIN_USERNAME / ADMIN_PASSWORD.
 *  - Loads legacy zh resume (already canonical) and en resume (legacy shape),
 *    migrates en to the canonical schema, and inserts both into `resume`.
 *  - Inserts a few default recruiter skills.
 *
 * Run with: npm run seed
 */

const LEGACY_STATIC_DIR = path.join(ROOT_DIR, 'legacy', 'app', 'public-static');
const ZH_RESUME_FILE = path.join(LEGACY_STATIC_DIR, 'resume-data.json');
const EN_RESUME_FILE = path.join(LEGACY_STATIC_DIR, 'resume-data.en.json');

type Json = Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

function readJsonFile(file: string): Json | null {
  if (!fs.existsSync(file)) {
    console.warn(`[seed] resume file not found, skipping: ${file}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Json;
}

/** Split "Company · Role" into its two parts (role keeps any further separators). */
function splitTitle(title: unknown): { left: string; right: string } {
  const text = typeof title === 'string' ? title : '';
  const idx = text.indexOf(' · ');
  if (idx === -1) return { left: text.trim(), right: '' };
  return { left: text.slice(0, idx).trim(), right: text.slice(idx + ' · '.length).trim() };
}

/** Migrate a legacy EN experience entry { title, meta, points } -> canonical. */
function migrateExperience(entry: Json): Json {
  const { left, right } = splitTitle(entry.title);
  const out: Json = {
    company: left,
    role: right,
    period: entry.meta ?? '',
    highlights: entry.points ?? [],
  };
  if (entry.logo !== undefined) out.logo = entry.logo;
  return out;
}

/** Migrate a legacy EN project entry { title, meta, points, highlights? } -> canonical. */
function migrateProject(entry: Json): Json {
  const { left, right } = splitTitle(entry.title);
  const out: Json = {
    name: left,
    role: right,
    period: entry.meta ?? '',
    content: entry.points ?? [],
    highlights: entry.highlights ?? [],
  };
  for (const key of ['demo_link', 'repo_link', 'open_source']) {
    if (entry[key] !== undefined) out[key] = entry[key];
  }
  return out;
}

/**
 * Migrate the full legacy EN resume document into the canonical schema used by
 * the zh document. Non-transformed top-level fields are preserved as-is.
 */
export function migrateEnResume(en: Json): Json {
  const migrated: Json = { ...en };

  if (Array.isArray(en.experience)) {
    migrated.experience = (en.experience as Json[]).map(migrateExperience);
  }

  if (Array.isArray(en.projects)) {
    migrated.projects = (en.projects as Json[]).map(migrateProject);
  }

  // Flat skills array -> object form { "Skills": [...] } to match zh structure.
  if (Array.isArray(en.skills)) {
    migrated.skills = { Skills: en.skills };
  }

  return migrated;
}

async function upsertResume(lang: string, data: Json): Promise<void> {
  const payload = JSON.stringify(data);
  const updated = nowIso();
  const existing = await get('SELECT lang FROM resume WHERE lang = ?', [lang]);
  if (existing) {
    await run('UPDATE resume SET data = ?, updated_at = ? WHERE lang = ?', [payload, updated, lang]);
    console.log(`[seed] updated resume (${lang})`);
  } else {
    await run('INSERT INTO resume (lang, data, updated_at) VALUES (?, ?, ?)', [lang, payload, updated]);
    console.log(`[seed] inserted resume (${lang})`);
  }
}

async function seedAdmin(): Promise<void> {
  const username = config.adminUsername;
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  await run(
    `INSERT INTO admin_credentials (username, password_hash) VALUES (?, ?)
     ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`,
    [username, passwordHash],
  );
  console.log(`[seed] admin credential ensured for "${username}"`);
}

interface DefaultSkill {
  name: string;
  prompt: string;
  priority: number;
}

const DEFAULT_SKILLS: DefaultSkill[] = [
  {
    name: '诚实回答',
    prompt:
      '基于简历与知识库中的事实回答猎头问题，不夸大候选人能力。对于简历中没有的信息，诚实告知"这部分信息我需要确认后回复您"，绝不编造经历、数据或项目细节。',
    priority: 100,
  },
  {
    name: '拒绝无关问题',
    prompt:
      '对于与招聘、候选人经历、项目能力无关的通用问题（如天气、新闻、闲聊），礼貌说明你只负责候选人职业相关的问答，并把话题引导回招聘场景。',
    priority: 90,
  },
  {
    name: '源码保护',
    prompt:
      '绝不透露项目源代码、内部文档（AGENT.md 等）的具体内容。可以描述项目的功能、架构思路和技术亮点，但不能输出代码片段或内部实现细节。',
    priority: 80,
  },
];

async function seedSkills(): Promise<void> {
  const created = nowIso();
  for (const skill of DEFAULT_SKILLS) {
    const existing = await get('SELECT id FROM skills WHERE name = ?', [skill.name]);
    if (existing) {
      console.log(`[seed] skill already exists, skipping: ${skill.name}`);
      continue;
    }
    await run(
      'INSERT INTO skills (id, name, prompt, enabled, priority, created_at) VALUES (?, ?, ?, 1, ?, ?)',
      [uuidv4(), skill.name, skill.prompt, skill.priority, created],
    );
    console.log(`[seed] inserted skill: ${skill.name}`);
  }
}

async function main(): Promise<void> {
  console.log('[seed] starting database seed...');

  await seedAdmin();

  const zh = readJsonFile(ZH_RESUME_FILE);
  if (zh) await upsertResume('zh', zh);

  const en = readJsonFile(EN_RESUME_FILE);
  if (en) await upsertResume('en', migrateEnResume(en));

  await seedSkills();

  console.log('[seed] done.');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
