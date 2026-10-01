/**
 * Project analysis service.
 *
 * Shared by the agent tool (tools/projects.ts) and the REST API
 * (api/projects.ts): clones repos, computes file statistics and runs the LLM
 * analysis that produces the understanding doc and resume entry.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { get, run } from '../db/client.js';
import { config } from '../config.js';
import { authedCloneUrl, getGithubToken } from './github.js';

export interface ProjectRow {
  id: string;
  name: string;
  repo_url: string | null;
  doc: string | null;
  resume_content: string | null;
  status: string;
  created_at: string;
}

/** Derive a project name from a git URL: https://github.com/user/repo.git -> repo */
export function deriveProjectName(url: string): string {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = cleaned.split('/');
  return parts[parts.length - 1] || 'unnamed-project';
}

/**
 * Fetch a repo snapshot via the official GitHub tarball API and extract it to
 * `<repoDir>/<name>/src`. Uses the hosted credential server-side only — the
 * agent never sees the token. Works for private repos when the credential has
 * Contents:Read; public repos need no credential at all.
 */
export async function fetchRepoTarball(
  ownerRepo: string,
  destDir: string,
): Promise<{ ok: true } | { ok: false; error: string; hint?: string }> {
  const current = await getGithubToken();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'job-agent-site',
  };
  if (current) headers.Authorization = `Bearer ${current.token}`;

  const res = await fetch(`https://api.github.com/repos/${ownerRepo}/tarball`, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });

  if (res.status === 404) {
    return {
      ok: false,
      error: `Repository not found or no access: ${ownerRepo}`,
      hint: current
        ? '托管凭证可能没有该仓库的 Contents:Read 权限（fine-grained token 需在 Repository permissions 中勾选）。'
        : '尚未托管 GitHub 凭证，私有仓库无法拉取。',
    };
  }
  if (res.status === 403) {
    return {
      ok: false,
      error: `GitHub refused tarball download for ${ownerRepo} (403).`,
      hint: 'Fine-grained PAT 需要 Repository permissions → Contents: Read；classic PAT 需要 repo scope。',
    };
  }
  if (!res.ok) {
    return { ok: false, error: `GitHub tarball API error ${res.status}` };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(destDir, { recursive: true });

  // GitHub tarballs contain a single top-level dir `<repo>-<sha>/`. Extract
  // into a temp subdir, then move everything to <destDir>/src (replacing any
  // stale content) — the analysis code expects sources there.
  const { extract } = await import('tar');
  const tmpDir = path.join(destDir, '.tmp-extract');
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });
  const tarball = path.join(destDir, '.download.tar.gz');
  await fs.writeFile(tarball, buf);
  try {
    await extract({ file: tarball, cwd: tmpDir, strip: 1 });
  } finally {
    await fs.rm(tarball, { force: true });
  }

  const srcDir = path.join(destDir, 'src');
  await fs.rm(srcDir, { recursive: true, force: true });
  await fs.rename(tmpDir, srcDir);
  return { ok: true };
}

/**
 * Clone a git repository (shallow) into `<repoDir>/<name>/src` and register it
 * in the projects table with status 'pending'. If a project with the same
 * name already exists it is re-pointed at the new URL instead of duplicated.
 *
 * Preferred path: official tarball API (no token ever enters git or the agent
 * context). Fallback: git clone with the hosted credential injected into the
 * URL, for non-github git hosts.
 */
export async function cloneRepo(
  url: string,
  nameOpt?: string,
): Promise<{ ok: true; id: string; name: string; status: string; created_at: string; updated?: boolean } | { ok: false; error: string }> {
  const name = nameOpt?.trim() || deriveProjectName(url);
  const initialStatus = 'pending';

  const repoBase = path.join(config.repoDir, name);
  const srcDir = path.join(repoBase, 'src');

  // Normalize owner/repo from a GitHub URL for the tarball API.
  const ghMatch = url.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);

  try {
    await fs.mkdir(srcDir, { recursive: true });

    if (ghMatch) {
      // Clean any stale partial download first.
      await fs.rm(srcDir, { recursive: true, force: true });

      const result = await fetchRepoTarball(`${ghMatch[1]}/${ghMatch[2]}`, repoBase);
      if (!result.ok) {
        const hint = result.hint ? ` 提示：${result.hint}` : '';
        return { ok: false, error: `${result.error}${hint}` };
      }
    } else {
      // Non-GitHub git URL: fall back to git clone (credential injection when HTTPS).
      const effectiveUrl = await authedCloneUrl(url);
      const { simpleGit } = await import('simple-git');
      const git = simpleGit();
      await git.clone(effectiveUrl, srcDir, ['--depth', '1']);
    }
  } catch (err: any) {
    return { ok: false, error: `Failed to fetch repository: ${err.message}` };
  }

  const now = new Date().toISOString();

  // Check if already exists by name
  const existing = await get<ProjectRow>('SELECT id, created_at FROM projects WHERE name = ?', [name]);
  if (existing) {
    await run('UPDATE projects SET repo_url = ?, status = ? WHERE id = ?', [url, initialStatus, existing.id]);
    return { ok: true, id: existing.id, name, status: initialStatus, created_at: existing.created_at, updated: true };
  }

  const id = uuidv4();
  await run(
    'INSERT INTO projects (id, name, repo_url, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, url, initialStatus, now],
  );
  return { ok: true, id, name, status: initialStatus, created_at: now };
}

/** Result of an LLM-driven project analysis. */
export interface AnalysisResult {
  ok: true;
  id: string;
  name: string;
  status: 'done';
  doc_length: number;
  resume_content: unknown;
}

// --- Git history (contribution & timeline evidence) ---

export interface AuthorContribution {
  name: string;
  email: string | null;
  commits: number;
  firstCommitAt: string;
  lastCommitAt: string;
}

export interface GitHistory {
  source: 'github-api' | 'git-log';
  /** null = unknown / sampled (repo has more commits than we fetched) */
  totalCommits: number | null;
  firstCommitAt: string | null;
  lastCommitAt: string | null;
  authors: AuthorContribution[];
  commitMessages: string[];
  note?: string;
}

const GITHUB_COMMITS_PAGES = 3; // 3 × 100 = 300 sampled commits max
const MAX_COMMIT_MESSAGES = 20;
const MAX_AUTHORS_IN_PROMPT = 10;

/**
 * Collect commit history for a project to infer contribution and timeline.
 * GitHub repos: official commits API (works even though we store a tarball
 * without .git). Non-GitHub: `git log` on the cloned source when available.
 * Best-effort — any failure returns null and analysis proceeds without it.
 */
export async function collectGitHistory(project: {
  name: string;
  repo_url: string | null;
}): Promise<GitHistory | null> {
  try {
    const ghMatch = project.repo_url?.match(
      /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/,
    );
    if (ghMatch) {
      return await githubApiHistory(`${ghMatch[1]}/${ghMatch[2]}`);
    }

    const srcDir = path.join(config.repoDir, project.name, 'src');
    return await gitLogHistory(srcDir);
  } catch (err: any) {
    console.warn(`[projects] git history collection failed for ${project.name}:`, err?.message);
    return null;
  }
}

async function githubApiHistory(ownerRepo: string): Promise<GitHistory | null> {
  const cred = await getGithubToken();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'job-agent-site',
  };
  if (cred) headers.Authorization = `Bearer ${cred.token}`;

  const commits: Array<{
    commit: { author?: { name?: string; email?: string; date?: string }; message?: string };
    author?: { login?: string } | null;
    sha: string;
  }> = [];
  let lastPage: number | null = null;

  for (let page = 1; page <= GITHUB_COMMITS_PAGES; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${ownerRepo}/commits?per_page=100&page=${page}`,
      { headers, signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) {
      if (commits.length > 0) break; // partial data is still useful
      return null;
    }
    const batch = (await res.json()) as typeof commits;
    commits.push(...batch);

    // Parse Link header once for the total page count.
    if (lastPage === null) {
      const link = res.headers.get('link') ?? '';
      const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
      lastPage = m ? Number(m[1]) : 1;
    }
    if (batch.length < 100 || page >= lastPage) break;
  }

  if (commits.length === 0) return null;

  const sampled = GITHUB_COMMITS_PAGES * 100;
  const complete = lastPage !== null && lastPage <= GITHUB_COMMITS_PAGES;

  const byAuthor = new Map<string, AuthorContribution>();
  const dates: string[] = [];
  const messages: string[] = [];

  for (const c of commits) {
    const date = c.commit.author?.date ?? '';
    if (date) dates.push(date);
    if (c.commit.message) {
      messages.push(c.commit.message.split('\n')[0].slice(0, 120));
    }
    const name = c.author?.login || c.commit.author?.name || 'unknown';
    const email = c.commit.author?.email ?? null;
    const key = c.author?.login || email || name;
    const existing = byAuthor.get(key);
    if (existing) {
      existing.commits++;
      if (date && date < existing.firstCommitAt) existing.firstCommitAt = date;
      if (date && date > existing.lastCommitAt) existing.lastCommitAt = date;
    } else {
      byAuthor.set(key, {
        name,
        email,
        commits: 1,
        firstCommitAt: date,
        lastCommitAt: date,
      });
    }
  }

  const sortedDates = dates.sort();
  return {
    source: 'github-api',
    totalCommits: complete ? commits.length : null,
    firstCommitAt: sortedDates[0] ?? null,
    lastCommitAt: sortedDates[sortedDates.length - 1] ?? null,
    authors: [...byAuthor.values()].sort((a, b) => b.commits - a.commits),
    commitMessages: messages.slice(0, MAX_COMMIT_MESSAGES),
    note: complete
      ? undefined
      : `仓库提交较多，仅采样最近 ${Math.min(commits.length, sampled)} 条（共约 ${lastPage ?? '?'} 页）`,
  };
}

async function gitLogHistory(srcDir: string): Promise<GitHistory | null> {
  try {
    await fs.access(path.join(srcDir, '.git'));
  } catch {
    return null; // tarball-only checkout, no git metadata
  }

  try {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(srcDir);
    const raw = await git.raw([
      'log',
      '--pretty=format:%an%x1f%ae%x1f%aI%x1f%s',
      '-n',
      '1000',
    ]);
    if (!raw.trim()) return null;

    let shallow = false;
    try {
      await fs.access(path.join(srcDir, '.git', 'shallow'));
      shallow = true;
    } catch { /* full history */ }

    const byAuthor = new Map<string, AuthorContribution>();
    const dates: string[] = [];
    const messages: string[] = [];

    for (const line of raw.split('\n')) {
      const [name, email, date, subject] = line.split('\x1f');
      if (!name || !date) continue;
      dates.push(date);
      if (subject) messages.push(subject.slice(0, 120));
      const key = email || name;
      const existing = byAuthor.get(key);
      if (existing) {
        existing.commits++;
        if (date < existing.firstCommitAt) existing.firstCommitAt = date;
        if (date > existing.lastCommitAt) existing.lastCommitAt = date;
      } else {
        byAuthor.set(key, { name, email: email || null, commits: 1, firstCommitAt: date, lastCommitAt: date });
      }
    }

    const sortedDates = dates.sort();
    return {
      source: 'git-log',
      totalCommits: shallow ? null : dates.length >= 1000 ? null : dates.length,
      firstCommitAt: sortedDates[0] ?? null,
      lastCommitAt: sortedDates[sortedDates.length - 1] ?? null,
      authors: [...byAuthor.values()].sort((a, b) => b.commits - a.commits),
      commitMessages: messages.slice(0, MAX_COMMIT_MESSAGES),
      note: shallow ? '本地克隆为浅克隆（shallow），历史不完整' : undefined,
    };
  } catch (err: any) {
    console.warn('[projects] git log failed:', err?.message);
    return null;
  }
}

function formatGitHistoryForPrompt(h: GitHistory): string {
  const authors = h.authors
    .slice(0, MAX_AUTHORS_IN_PROMPT)
    .map((a) => `  - ${a.name}${a.email ? ` <${a.email}>` : ''}: ${a.commits} commits (${a.firstCommitAt.slice(0, 10)} ~ ${a.lastCommitAt.slice(0, 10)})`)
    .join('\n');
  const messages = h.commitMessages.map((m) => `  - ${m}`).join('\n');
  const total = h.totalCommits !== null ? `${h.totalCommits}` : '未知（采样统计）';
  return `来源: ${h.source === 'github-api' ? 'GitHub Commits API' : 'git log'}${h.note ? `（${h.note}）` : ''}
总提交数: ${total}
时间跨度: ${h.firstCommitAt?.slice(0, 10) ?? '未知'} ~ ${h.lastCommitAt?.slice(0, 10) ?? '未知'}
作者贡献（按提交数降序）:
${authors || '  （无作者信息）'}
最近提交消息:
${messages || '  （无）'}`;
}

/**
 * Analyze a cloned project: compute stats, read key files, then generate the
 * understanding doc and resume content via the LLM. Persists the results and
 * flips status to 'done'; on any failure the project is marked 'error'.
 */
/**
 * Check whether a GitHub repo is publicly accessible (no auth). Returns
 * { isPublic } on success, or null when the check fails / not a GitHub URL.
 */
export async function checkRepoVisibility(repoUrl: string | null): Promise<{ isPublic: boolean } | null> {
  const m = repoUrl?.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (!m) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'job-agent-site',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return { isPublic: false };
    if (!res.ok) return null;
    const data = (await res.json()) as { private?: boolean };
    return { isPublic: !data.private };
  } catch {
    return null;
  }
}

export async function runProjectAnalysis(projectId: string): Promise<AnalysisResult | { ok: false; error: string }> {
  try {
    const project = await get<ProjectRow>('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return { ok: false, error: `Project not found: ${projectId}` };
    }

    const srcDir = path.join(config.repoDir, project.name, 'src');

    // Verify source directory exists
    try {
      await fs.access(srcDir);
    } catch {
      await run('UPDATE projects SET status = ? WHERE id = ?', ['error', projectId]);
      return { ok: false, error: `Source directory not found: ${srcDir}. Was the repo cloned?` };
    }

    // Gather file stats
    const fileStats = await computeFileStats(srcDir);
    const dirTree = await buildDirectoryTree(srcDir, 3);
    const keyFiles = await readKeyFiles(srcDir);

    // Collect git history for contribution/timeline evidence (best-effort).
    const gitHistory = await collectGitHistory(project);

    // Build the LLM prompt for analysis
    const analysisPrompt = buildAnalysisPrompt(project.name, fileStats, dirTree, keyFiles, gitHistory);

    // Call LLM for analysis
    const llmResult = await callLlm(analysisPrompt);

    if (llmResult.error) {
      await run('UPDATE projects SET status = ? WHERE id = ?', ['error', projectId]);
      return { ok: false, error: `LLM analysis failed: ${llmResult.error}` };
    }

    // Parse the LLM response into doc and resume content
    const { doc, resumeContent } = parseAnalysisResult(llmResult.text!, project.name);

    // Authoritative visibility check: only expose the source link for repos
    // that are publicly accessible WITHOUT any credential. Private repos (or
    // non-GitHub URLs / failed checks) never get a repo_link in resume output.
    const visibility = await checkRepoVisibility(project.repo_url);
    if (visibility) {
      resumeContent.open_source = visibility.isPublic;
      resumeContent.repo_link = visibility.isPublic
        ? project.repo_url?.replace(/\.git$/, '').replace(/\/$/, '') ?? null
        : null;
    } else {
      resumeContent.open_source = false;
      resumeContent.repo_link = null;
    }

    // Store results
    await run(
      'UPDATE projects SET doc = ?, resume_content = ?, status = ? WHERE id = ?',
      [doc, JSON.stringify(resumeContent), 'done', projectId],
    );

    // Land the doc as AGENTS.md next to the cloned source (best-effort).
    try {
      const repoDir = path.join(config.repoDir, project.name);
      await fs.mkdir(repoDir, { recursive: true });
      await fs.writeFile(path.join(repoDir, 'AGENTS.md'), doc, 'utf-8');
    } catch (writeErr: any) {
      console.warn(`[projects] AGENTS.md write failed for ${project.name}:`, writeErr?.message);
    }

    return {
      ok: true,
      id: projectId,
      name: project.name,
      status: 'done',
      doc_length: doc.length,
      resume_content: resumeContent,
    };
  } catch (err: any) {
    // Mark as error on failure
    try {
      await run('UPDATE projects SET status = ? WHERE id = ?', ['error', projectId]);
    } catch { /* ignore */ }
    return { ok: false, error: `Project analysis failed: ${err.message}` };
  }
}

/**
 * Best-effort removal of a project's cloned directory. Deletion failures are
 * logged but never thrown: the DB record removal is what matters.
 */
export async function deleteProjectDir(project: { name?: string | null; repo_url?: string | null }): Promise<void> {
  const name = project.name || (project.repo_url ? deriveProjectName(project.repo_url) : '');
  if (!name) return;
  try {
    await fs.rm(path.join(config.repoDir, name), { recursive: true, force: true });
  } catch (err) {
    console.warn('[projects] failed to remove cloned repo directory:', err);
  }
}

// --- Helper functions ---

interface FileStats {
  totalFiles: number;
  totalLines: number;
  byExtension: Record<string, { files: number; lines: number }>;
}

async function computeFileStats(dir: string): Promise<FileStats> {
  const stats: FileStats = { totalFiles: 0, totalLines: 0, byExtension: {} };
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'venv', '.venv']);

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase() || '(no ext)';
        stats.totalFiles++;

        if (!stats.byExtension[ext]) {
          stats.byExtension[ext] = { files: 0, lines: 0 };
        }
        stats.byExtension[ext].files++;

        // Count lines for text files
        if (isTextFile(ext)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n').length;
            stats.totalLines += lines;
            stats.byExtension[ext].lines += lines;
          } catch { /* binary or unreadable */ }
        }
      }
    }
  }

  await walk(dir);
  return stats;
}

function isTextFile(ext: string): boolean {
  const textExts = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.kt', '.swift',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.sh', '.bash', '.sql',
    '.yaml', '.yml', '.toml', '.ini', '.cfg', '.json', '.md', '.txt', '.html',
    '.css', '.scss', '.less', '.xml', '.env', '.gitignore', '.dockerignore',
  ]);
  return textExts.has(ext) || ext === '';
}

async function buildDirectoryTree(dir: string, maxDepth: number): Promise<string> {
  const lines: string[] = [];
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'venv', '.venv']);

  async function walk(currentDir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const suffix = entry.isDirectory() ? '/' : '';
      lines.push(`${prefix}${connector}${entry.name}${suffix}`);

      if (entry.isDirectory()) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        await walk(path.join(currentDir, entry.name), childPrefix, depth + 1);
      }
    }
  }

  await walk(dir, '', 0);
  return lines.slice(0, 100).join('\n'); // Cap tree output
}

/**
 * Read key files for project understanding: README, package manifests, entrypoints, configs.
 */
async function readKeyFiles(dir: string): Promise<Array<{ name: string; content: string }>> {
  const keyPatterns = [
    'README.md', 'README.rst', 'README.txt', 'README',
    'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
    'requirements.txt', 'Pipfile',
    'tsconfig.json', 'vite.config.ts', 'webpack.config.js', 'next.config.js',
    'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
    'src/main.ts', 'src/index.ts', 'src/app.ts', 'src/server.ts',
    'main.py', 'app.py', 'src/main.py', 'manage.py',
    'src/main.rs', 'src/lib.rs', 'main.go',
    'src/App.tsx', 'src/App.jsx', 'pages/index.tsx',
    'AGENT.md', 'CLAUDE.md',
  ];

  const results: Array<{ name: string; content: string }> = [];
  const MAX_PER_FILE = 3000;
  const MAX_TOTAL = 15000;
  let totalSize = 0;

  for (const pattern of keyPatterns) {
    const filePath = path.join(dir, pattern);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      let content = await fs.readFile(filePath, 'utf-8');
      if (content.length > MAX_PER_FILE) {
        content = content.slice(0, MAX_PER_FILE) + '\n... [truncated]';
      }
      results.push({ name: pattern, content });
      totalSize += content.length;
      if (totalSize >= MAX_TOTAL) break;
    } catch { /* file doesn't exist, skip */ }
  }

  return results;
}

function buildAnalysisPrompt(
  projectName: string,
  fileStats: FileStats,
  dirTree: string,
  keyFiles: Array<{ name: string; content: string }>,
  gitHistory: GitHistory | null,
): string {
  const statsStr = Object.entries(fileStats.byExtension)
    .sort((a, b) => b[1].lines - a[1].lines)
    .slice(0, 10)
    .map(([ext, s]) => `  ${ext}: ${s.files} files, ${s.lines} lines`)
    .join('\n');

  const filesStr = keyFiles
    .map((f) => `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  const gitHistoryStr = gitHistory
    ? `\n## Git 提交历史（贡献与时间线证据）\n${formatGitHistoryForPrompt(gitHistory)}\n`
    : '';

  const gitHistoryInstruction = gitHistory
    ? `\n- 利用上面的 Git 提交历史：根据作者贡献判断候选人（${gitHistory.authors.length > 0 ? `提交最活跃的作者是 ${gitHistory.authors[0].name}` : '主要作者'}）在项目中的真实角色和贡献占比；根据时间跨度填写 period（格式如 2024.03 - 2025.01）；提交消息可帮助理解开发重点和演进阶段
- 若有多位作者，如实说明候选人的贡献占比，不要把整个项目都归到候选人名下；若候选人就是唯一/主要作者，可强调独立完成度`
    : `
- 无法获取 Git 历史：period 如无法推断则留空或写"时间不详"，不要编造时间线`;

  return `你是一个资深软件架构师。分析以下项目 "${projectName}" 的结构和关键文件，生成项目理解文档和简历条目。

## 项目规模
- 总文件数: ${fileStats.totalFiles}
- 总代码行数: ${fileStats.totalLines}
- 语言分布:
${statsStr}

## 目录结构
\`\`\`
${dirTree}
\`\`\`

## 关键文件
${filesStr}
${gitHistoryStr}
---

请输出两个部分，用 "===SEPARATOR===" 分隔：

**第一部分：项目理解文档（Markdown格式）**
格式要求:
# ${projectName}
## 项目规模
（文件数、代码行数、主要语言）
## 目录结构
（简要描述主要目录的用途）
## 关键文件摘录
（重要的配置、入口文件的说明）
## 架构与亮点
（技术架构、设计模式、创新点、技术难点）${gitHistory ? `
## 贡献与时间线
（基于 Git 历史推断：项目起止时间、开发节奏、候选人贡献占比与角色、主要开发阶段）` : ''}

**第二部分：简历条目（JSON格式）**
格式要求:
{
  "name": "项目名称",
  "role": "担任角色",
  "period": "时间段(如能推断)",
  "content": ["项目描述要点1", "项目描述要点2", "项目描述要点3"],
  "highlights": ["技术亮点1", "技术亮点2", "技术亮点3"],
  "recruiter_questions": [
    {"question": "猎头可能追问的问题1（中文）", "needs_input": false},
    {"question": "猎头可能追问的问题2（中文）", "needs_input": true}
  ],
  "repo_link": null,
  "open_source": false
}

注意：
- 简历条目要突出技术亮点和业务价值，不要泛泛而谈${gitHistoryInstruction}
- repo_link 和 open_source 无需你判断（系统会根据仓库实际可见性自动填写），保持 null/false 即可
- recruiter_questions：站在猎头/招聘方视角，预测他们看完这个项目介绍后最想追问的 3-5 个问题。
  - needs_input=false：仅凭简历和源码就能直接回答的问题（如「这个项目的 QPS 峰值是多少」「为什么选 X 而不是 Y」）——猎头端可以一键直接向 AI 助手发送。
  - needs_input=true：需要候选人补充材料才能回答的问题（如「能提供压测报告吗」「有客户证言吗」）——猎头端只会把问题填入输入框，由猎头自行补充后发送。
  - 问题用中文书写（猎头端 AI 助手会镜像提问语言）。
- content 3-5条，highlights 2-4条`;
}

interface LlmResult {
  text?: string;
  error?: string;
}

async function callLlm(prompt: string): Promise<LlmResult> {
  try {
    const { llm } = config;
    if (!llm.apiKey) {
      return { error: 'LLM_API_KEY not configured' };
    }

    // OpenAI-compatible providers differ in whether the base URL already
    // carries the API version (zhipu .../v4, deepseek bare domain).
    const chatUrl = /\/v\d+$/.test(llm.baseUrl)
      ? `${llm.baseUrl}/chat/completions`
      : `${llm.baseUrl}/v1/chat/completions`;
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [
          { role: 'system', content: '你是一个资深软件架构师，擅长分析代码仓库并生成清晰的技术文档。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(120_000), // 2 minute timeout for analysis
    });

    if (!response.ok) {
      const errText = await response.text();
      return { error: `LLM API error ${response.status}: ${errText.slice(0, 200)}` };
    }

    const json = await response.json() as any;
    const text = json.choices?.[0]?.message?.content;
    if (!text) {
      return { error: 'Empty LLM response' };
    }
    return { text };
  } catch (err: any) {
    return { error: err.message };
  }
}

function parseAnalysisResult(llmText: string, projectName: string): { doc: string; resumeContent: any } {
  const parts = llmText.split('===SEPARATOR===');
  const doc = (parts[0] || '').trim();

  let resumeContent: any = {
    name: projectName,
    role: '核心开发者',
    period: '',
    content: [],
    highlights: [],
    repo_link: null,
    open_source: false,
  };

  if (parts[1]) {
    try {
      // Try to extract JSON from the second part
      const jsonMatch = parts[1].match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        resumeContent = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If JSON parse fails, use defaults
      resumeContent.content = [parts[1].trim().slice(0, 500)];
    }
  }

  return { doc: doc || `# ${projectName}\n\n(Analysis pending)`, resumeContent };
}
