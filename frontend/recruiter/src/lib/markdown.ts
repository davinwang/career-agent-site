/**
 * A tiny, dependency-free Markdown renderer for assistant chat messages.
 *
 * Security model: the source string is HTML-escaped *before* any markup is
 * generated, so model output can never inject elements. Only the tags this
 * module emits exist in the result, and link hrefs pass through a protocol
 * allow-list.
 *
 * Supported: ATX headings, fenced + inline code, unordered/ordered lists,
 * blockquotes, horizontal rules, GFM tables, bold/italic/strikethrough,
 * links and bare-URL autolinking, hard line breaks.
 */

const CODE_BLOCK_TOKEN = '\u0000CB';
const CODE_SPAN_TOKEN = '\u0000CS';
const ATOM_TOKEN = '\u0000AT';
const TOKEN_END = '\u0000';

const SAFE_URL = /^(?:https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url: string): string {
  const decoded = url.replace(/&amp;/g, '&').trim();
  if (!decoded) return '#';
  if (SAFE_URL.test(decoded)) return escapeHtml(decoded);
  return '#';
}

/* -------------------------------------------------------------------------- */
/* inline                                                                      */
/* -------------------------------------------------------------------------- */

function inline(text: string): string {
  let out = text;

  // Inline code spans — captured first so their contents stay untouched.
  const spans: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    spans.push(code);
    return `${CODE_SPAN_TOKEN}${spans.length - 1}${TOKEN_END}`;
  });

  // Generated tags are parked behind placeholders so the later passes cannot
  // see their markup. Without this, a link whose *label* is itself a URL
  // (`[https://x](https://x)`) would be autolinked a second time and emit
  // nested <a> elements, which browsers tear apart.
  const atoms: string[] = [];
  const atom = (html: string): string => {
    atoms.push(html);
    return `${ATOM_TOKEN}${atoms.length - 1}${TOKEN_END}`;
  };

  // Images: ![alt](src)
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
    (_m, alt: string, src: string) => {
      const safe = sanitizeUrl(src);
      if (safe === '#') return alt;
      return atom(`<img src="${safe}" alt="${alt}" loading="lazy" />`);
    },
  );

  // Links: [label](href) — only the tags are protected, so the label still
  // receives emphasis/strong processing.
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
    (_m, label: string, href: string) =>
      `${atom(`<a href="${sanitizeUrl(href)}" target="_blank" rel="noopener noreferrer">`)}${label}${atom('</a>')}`,
  );

  // Bare-URL autolinking.
  out = out.replace(
    /(^|[\s(]|&gt;)(https?:\/\/[^\s<>)\]]+[^\s<>)\].,;:!?])/g,
    (_match, lead: string, url: string) =>
      `${lead}${atom(`<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer">`)}${url}${atom('</a>')}`,
  );

  // Strong / emphasis / strike / highlight.
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  // Restore generated tags, then code spans.
  out = out.replace(
    new RegExp(`${ATOM_TOKEN}(\\d+)${TOKEN_END}`, 'g'),
    (_m, idx: string) => atoms[Number(idx)] ?? '',
  );
  out = out.replace(
    new RegExp(`${CODE_SPAN_TOKEN}(\\d+)${TOKEN_END}`, 'g'),
    (_m, idx: string) => `<code>${spans[Number(idx)] ?? ''}</code>`,
  );

  return out;
}

/* -------------------------------------------------------------------------- */
/* tables                                                                      */
/* -------------------------------------------------------------------------- */

interface TableRow {
  cells: string[];
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isDelimiterRow(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function readAligns(line: string): string[] {
  return splitRow(line).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

function renderTable(rows: TableRow[], aligns: string[]): string {
  const [head, ...body] = rows;
  if (!head) return '';
  const style = (i: number) => ` style="text-align:${aligns[i] ?? 'left'}"`;
  const thead = `<thead><tr>${head.cells
    .map((c, i) => `<th${style(i)}>${inline(c)}</th>`)
    .join('')}</tr></thead>`;
  const tbody = body.length
    ? `<tbody>${body
        .map(
          (r) =>
            `<tr>${head.cells
              .map((_h, i) => `<td${style(i)}>${inline(r.cells[i] ?? '')}</td>`)
              .join('')}</tr>`,
        )
        .join('')}</tbody>`
    : '';
  return `<div class="md-table-wrap"><table>${thead}${tbody}</table></div>`;
}

/* -------------------------------------------------------------------------- */
/* block parser                                                                */
/* -------------------------------------------------------------------------- */

export function renderMarkdown(source: string): string {
  if (!source) return '';
  const text = source.replace(/\r\n?/g, '\n');

  // 1. Lift fenced code blocks out of the way.
  const blocks: Array<{ lang: string; code: string }> = [];
  const withoutFences = text.replace(
    /```([a-zA-Z0-9+#_-]*)\n?([\s\S]*?)(?:```|$)/g,
    (_m, lang: string, code: string) => {
      blocks.push({ lang, code: code.replace(/\n$/, '') });
      return `${CODE_BLOCK_TOKEN}${blocks.length - 1}${TOKEN_END}`;
    },
  );

  // 2. Escape everything that remains.
  const lines = escapeHtml(withoutFences).split('\n');

  const out: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let quote: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inline(paragraph.join('\n')).replace(/\n/g, '<br />')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType) return;
    out.push(`</${listType}>`);
    listType = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push(`<blockquote>${inline(quote.join('\n')).replace(/\n/g, '<br />')}</blockquote>`);
    quote = [];
  };
  const openList = (type: 'ul' | 'ol') => {
    if (listType === type) return;
    flushParagraph();
    flushQuote();
    if (listType) out.push(`</${listType}>`);
    listType = type;
    out.push(`<${type}>`);
  };

  const blockRe = new RegExp(`^\\s*${CODE_BLOCK_TOKEN}(\\d+)${TOKEN_END}\\s*$`);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    // fenced code block on its own line
    const codeMatch = blockRe.exec(line);
    if (codeMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      const block = blocks[Number(codeMatch[1])];
      if (block) {
        const langAttr = block.lang ? ` data-lang="${block.lang}"` : '';
        const label = block.lang ? `<span class="md-lang">${block.lang}</span>` : '';
        out.push(
          `<div class="md-pre"${langAttr}>${label}<pre><code>${escapeHtml(block.code)}</code></pre></div>`,
        );
      }
      continue;
    }

    // blank line closes the current block
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    // horizontal rule
    if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushQuote();
      out.push('<hr />');
      continue;
    }

    // heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      const level = Math.min(heading[1].length + 2, 6); // h3..h6 inside chat
      out.push(`<h${level}>${inline(heading[2].replace(/\s+#+\s*$/, ''))}</h${level}>`);
      continue;
    }

    // blockquote
    if (trimmed.startsWith('&gt;')) {
      flushParagraph();
      flushList();
      quote.push(trimmed.replace(/^&gt;\s?/, ''));
      continue;
    }
    flushQuote();

    // table (header row followed by a delimiter row)
    if (trimmed.includes('|') && isDelimiterRow(lines[i + 1] ?? '')) {
      flushParagraph();
      flushList();
      const aligns = readAligns(lines[i + 1]);
      const rows: TableRow[] = [{ cells: splitRow(trimmed) }];
      let cursor = i + 2;
      while (cursor < lines.length && lines[cursor].trim().includes('|')) {
        rows.push({ cells: splitRow(lines[cursor].trim()) });
        cursor += 1;
      }
      out.push(renderTable(rows, aligns));
      i = cursor - 1;
      continue;
    }

    // unordered list
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (ul) {
      openList('ul');
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    // ordered list
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ol) {
      openList('ol');
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // continuation of an open list (indented wrapped line)
    if (listType && /^\s{2,}\S/.test(line)) {
      const last = out.length ? out[out.length - 1] : '';
      if (last.endsWith('</li>')) {
        out[out.length - 1] = last.replace(/<\/li>$/, `<br />${inline(trimmed)}</li>`);
      } else {
        out.push(`<li>${inline(trimmed)}</li>`);
      }
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushQuote();

  return out.join('');
}
