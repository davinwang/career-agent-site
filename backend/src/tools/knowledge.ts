import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { get, all, run } from '../db/client.js';

interface KnowledgeRow {
  id: string;
  filename: string;
  source_type: string;
  content: string;
  chunks: string;
  metadata: string | null;
  created_at: string;
}

/**
 * Search knowledge base chunks using simple token-frequency scoring.
 * Available to both agents.
 */
export const searchKnowledge = createTool({
  id: 'search-knowledge',
  description:
    'Search the knowledge base for content relevant to a query. Returns top matching chunks with source filenames.',
  inputSchema: z.object({
    query: z.string().describe('Search query text'),
    topK: z.number().default(5).describe('Number of results to return (default 5)'),
  }),
  execute: async (context) => {
    try {
      const { query, topK = 5 } = context;
      const rows = await all<KnowledgeRow>(
        'SELECT id, filename, source_type, chunks FROM knowledge',
      );

      if (rows.length === 0) {
        return { results: [], message: 'Knowledge base is empty' };
      }

      // Tokenize query: split on whitespace and punctuation, lowercase
      const tokens = query
        .toLowerCase()
        .split(/[\s,;.!?，。；、]+/)
        .filter((t) => t.length > 1);

      if (tokens.length === 0) {
        return { results: [], message: 'Query too short to search' };
      }

      // Score each chunk across all knowledge entries
      const scored: Array<{ text: string; filename: string; score: number }> = [];

      for (const row of rows) {
        let chunks: string[];
        try {
          chunks = JSON.parse(row.chunks);
        } catch {
          chunks = [row.chunks];
        }

        for (const chunk of chunks) {
          const lower = chunk.toLowerCase();
          let score = 0;
          for (const token of tokens) {
            // Count occurrences of each token
            const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            const matches = lower.match(regex);
            if (matches) score += matches.length;
          }
          if (score > 0) {
            scored.push({ text: chunk, filename: row.filename, score });
          }
        }
      }

      // Sort by score descending, take top K
      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, topK).map((s) => ({
        filename: s.filename,
        score: s.score,
        excerpt: excerptAround(s.text, tokens),
      }));

      return { results, total_matches: scored.length };
    } catch (err: any) {
      return { error: `Knowledge search failed: ${err.message}` };
    }
  },
});

/**
 * List all files in the knowledge base. Available to both agents.
 */
export const listKnowledgeFiles = createTool({
  id: 'list-knowledge-files',
  description: 'List all files indexed in the knowledge base with their metadata.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const rows = await all<{ id: string; filename: string; source_type: string; created_at: string }>(
        'SELECT id, filename, source_type, created_at FROM knowledge ORDER BY created_at DESC',
      );
      return { files: rows, count: rows.length };
    } catch (err: any) {
      return { error: `Failed to list knowledge files: ${err.message}` };
    }
  },
});

/**
 * Ingest a file into the knowledge base. Admin only.
 * Supports: PDF, DOCX, TXT, MD, JSON, and code files.
 */
export const ingestFile = createTool({
  id: 'ingest-file',
  description:
    'Ingest a file into the knowledge base. Supports PDF, DOCX/DOC, TXT, MD, JSON, and code files (.ts, .js, .py, etc). Extracts text, chunks it, and stores it.',
  inputSchema: z.object({
    filePath: z.string().describe('Absolute path to the file to ingest'),
    filename: z.string().describe('Display filename for the knowledge entry'),
    sourceType: z
      .enum(['upload', 'repo', 'manual'])
      .default('upload')
      .describe('Source type: upload, repo, or manual'),
  }),
  execute: async (context) => {
    try {
      const { filePath, filename, sourceType = 'upload' } = context;

      // Verify file exists
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        return { error: `Path is not a file: ${filePath}` };
      }

      const ext = path.extname(filePath).toLowerCase();
      let text: string;

      if (ext === '.pdf') {
        text = await extractPdf(filePath);
      } else if (ext === '.docx' || ext === '.doc') {
        text = await extractDocx(filePath);
      } else if (['.txt', '.md', '.json'].includes(ext)) {
        text = await fs.readFile(filePath, 'utf-8');
      } else if (isCodeFile(ext)) {
        text = await extractCodeHeuristic(filePath);
      } else {
        // Try reading as text
        text = await fs.readFile(filePath, 'utf-8');
      }

      if (!text || text.trim().length === 0) {
        return { error: 'No text could be extracted from the file' };
      }

      // Chunk the text: 1200-char segments with 150-char overlap
      const chunks = chunkText(text, 1200, 150);

      // Store in knowledge table
      const id = uuidv4();
      const now = new Date().toISOString();
      // Keep the stored original's name so the UI can link/download it.
      const storedName = path.basename(filePath);

      // Check if file already exists (by filename), update if so
      const existing = await get<{ id: string }>(
        'SELECT id FROM knowledge WHERE filename = ?',
        [filename],
      );

      if (existing) {
        await run(
          'UPDATE knowledge SET content = ?, chunks = ?, source_type = ?, metadata = ?, created_at = ? WHERE id = ?',
          [text.slice(0, 50000), JSON.stringify(chunks), sourceType, JSON.stringify({ ext, size: stat.size, stored_name: storedName }), now, existing.id],
        );
        return { ok: true, id: existing.id, filename, chunks: chunks.length, updated: true };
      }

      await run(
        'INSERT INTO knowledge (id, filename, source_type, content, chunks, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, filename, sourceType, text.slice(0, 50000), JSON.stringify(chunks), JSON.stringify({ ext, size: stat.size, stored_name: storedName }), now],
      );

      return { ok: true, id, filename, chunks: chunks.length };
    } catch (err: any) {
      return { error: `Failed to ingest file: ${err.message}` };
    }
  },
});

// --- Helper functions ---

async function extractPdf(filePath: string): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);
    return normalizePdfText(result.text || '');
  } catch (err: any) {
    throw new Error(`PDF extraction failed: ${err.message}`);
  }
}

/**
 * Build an excerpt centered on term matches instead of the chunk start.
 * Concatenates windows around up to 3 distinct match positions so hits late
 * in a chunk (e.g. an education section at the end of a resume chunk) are
 * actually visible to the caller. Falls back to the chunk head.
 */
function excerptAround(text: string, tokens: string[], windowSize = 600, maxWindows = 3): string {
  const lower = text.toLowerCase();
  const positions: number[] = [];
  for (const token of tokens) {
    const idx = lower.indexOf(token.toLowerCase());
    if (idx >= 0) positions.push(idx);
  }
  if (positions.length === 0) {
    return text.slice(0, windowSize);
  }
  positions.sort((a, b) => a - b);
  const windows: string[] = [];
  let lastEnd = -1;
  for (const pos of positions) {
    if (pos < lastEnd) continue; // already covered by the previous window
    if (windows.length >= maxWindows) break;
    const from = Math.max(0, pos - 120);
    const to = Math.min(text.length, pos + windowSize - 120);
    windows.push((from > 0 ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : ''));
    lastEnd = to;
  }
  return windows.join('\n……\n');
}

/**
 * Clean up pdf-parse output. PDF text layers (especially resumes exported
 * from design tools) produce lines with missing spaces and stray breaks
 * inside CJK text; collapse those so search/chunking sees sane sentences.
 * Preserves existing newlines — only joins lines that were split mid-word.
 */
function normalizePdfText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/([\u4e00-\u9fff])\n([\u4e00-\u9fff])/g, '$1$2') // CJK line joins
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocx(filePath: string): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (err: any) {
    throw new Error(`DOCX extraction failed: ${err.message}`);
  }
}

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.sh', '.bash', '.sql',
  '.yaml', '.yml', '.toml', '.ini', '.cfg',
]);

function isCodeFile(ext: string): boolean {
  return CODE_EXTENSIONS.has(ext);
}

/**
 * Heuristic code extraction: keep lines with structural keywords, cap at 20KB.
 */
async function extractCodeHeuristic(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const keywordPattern = /^\s*(def |class |function |import |from \S+ import|export |const |let |var |interface |type |enum |struct |impl |pub |async |await |TODO|FIXME|\/\*\*|\/\/\/|#\[)/;

  const kept: string[] = [];
  let size = 0;
  const MAX_SIZE = 20 * 1024; // 20KB cap

  for (const line of lines) {
    if (keywordPattern.test(line) || line.trim().startsWith('*/')) {
      kept.push(line);
      size += line.length + 1;
      if (size >= MAX_SIZE) break;
    }
  }

  // If heuristic yields too little, include the first 20KB raw
  if (kept.length < 3) {
    return content.slice(0, MAX_SIZE);
  }

  return kept.join('\n');
}

/**
 * Chunk text into segments with overlap.
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    if (end < text.length) {
      // Prefer breaking at a blank line (section boundary), then any newline.
      const sectionBreak = text.lastIndexOf('\n\n', end);
      const lastNewline = text.lastIndexOf('\n', end);
      if (sectionBreak > start + chunkSize * 0.3) {
        end = sectionBreak + 1;
      } else if (lastNewline > start + chunkSize * 0.5) {
        end = lastNewline + 1;
      }
    }

    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    const next = end - overlap;
    if (next <= start) break; // guard against a zero/negative step
    start = next;
  }

  return chunks.filter((c) => c.length > 0);
}
