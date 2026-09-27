import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { run, get, closeDb } from './client.js';

/**
 * Seed script (bootstrap only):
 *  - Creates the admin user from ADMIN_USERNAME / ADMIN_PASSWORD.
 *  - Inserts a few default recruiter skills.
 *
 * Resume data is intentionally NOT seeded. The résumé is owner content and
 * enters the system exclusively through the admin portal (upload / agent
 * write tools). Until then the recruiter frontend shows an anonymous
 * placeholder — no fallback data ships in code or images.
 *
 * Run with: npm run seed
 */

function nowIso(): string {
  return new Date().toISOString();
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
  await seedSkills();

  console.log('[seed] done. (resume data is NOT seeded — publish it via the admin portal)');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
