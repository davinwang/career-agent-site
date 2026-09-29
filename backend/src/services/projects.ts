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
 * Clone a git repository (shallow) into `<repoDir>/<name>/src` and register it
 * in the projects table with status 'pending'. If a project with the same
 * name already exists it is re-pointed at the new URL instead of duplicated.
 */
export async function cloneRepo(
  url: string,
  nameOpt?: string,
): Promise<{ ok: true; id: string; name: string; status: string; created_at: string; updated?: boolean } | { ok: false; error: string }> {
  const name = nameOpt?.trim() || deriveProjectName(url);
  const initialStatus = 'pending';

  try {
    // Ensure repos directory exists
    const repoBase = path.join(config.repoDir, name);
    const srcDir = path.join(repoBase, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    // Clone using simple-git
    const { simpleGit } = await import('simple-git');
    const git = simpleGit();
    await git.clone(url, srcDir, ['--depth', '1']);
  } catch (err: any) {
    return { ok: false, error: `Failed to clone repository: ${err.message}` };
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

/**
 * Analyze a cloned project: compute stats, read key files, then generate the
 * understanding doc and resume content via the LLM. Persists the results and
 * flips status to 'done'; on any failure the project is marked 'error'.
 */
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

    // Build the LLM prompt for analysis
    const analysisPrompt = buildAnalysisPrompt(project.name, fileStats, dirTree, keyFiles);

    // Call LLM for analysis
    const llmResult = await callLlm(analysisPrompt);

    if (llmResult.error) {
      await run('UPDATE projects SET status = ? WHERE id = ?', ['error', projectId]);
      return { ok: false, error: `LLM analysis failed: ${llmResult.error}` };
    }

    // Parse the LLM response into doc and resume_content
    const { doc, resumeContent } = parseAnalysisResult(llmResult.text!, project.name);

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
): string {
  const statsStr = Object.entries(fileStats.byExtension)
    .sort((a, b) => b[1].lines - a[1].lines)
    .slice(0, 10)
    .map(([ext, s]) => `  ${ext}: ${s.files} files, ${s.lines} lines`)
    .join('\n');

  const filesStr = keyFiles
    .map((f) => `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

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
（技术架构、设计模式、创新点、技术难点）

**第二部分：简历条目（JSON格式）**
格式要求:
{
  "name": "项目名称",
  "role": "担任角色",
  "period": "时间段(如能推断)",
  "content": ["项目描述要点1", "项目描述要点2", "项目描述要点3"],
  "highlights": ["技术亮点1", "技术亮点2", "技术亮点3"],
  "repo_link": null,
  "open_source": false
}

注意：
- 简历条目要突出技术亮点和业务价值，不要泛泛而谈
- 如果能判断是否开源(有LICENSE文件)，设置open_source和repo_link
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

    const response = await fetch(`${llm.baseUrl}/v1/chat/completions`, {
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
