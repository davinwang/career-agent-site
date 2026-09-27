/**
 * Deterministic output filter for the recruiter agent.
 * Runs AFTER the agent generates a response.
 *
 * Ported from the legacy guardrails.py `redact_source_dumps` function.
 * Zero LLM cost — pure regex/string processing.
 */

/** Pattern matching fenced code blocks (``` ... ```) */
const CODE_FENCE_REGEX = /```[\s\S]*?```/g;

/** Lines that look like source code statements */
const CODEISH_LINE_REGEX =
  /^\s{0,12}(def |class |import |from \S+ import|function |const |let |var |return |#include|public |private |protected |export |async |await |if \(|else |for \(|while \(|switch |try |catch |throw |interface |type |enum |struct |impl |pub |fn |use |mod |package |require\(|module\.exports|@\w+|<\/?\w+[\s>])/;

/** Pattern matching file paths that look like repo structure dumps */
const FILE_PATH_LINE_REGEX =
  /^[\s│├└─┌┐┘┤┬┴┼]*((src|lib|app|pages|components|tests?|docs?|scripts?|backend|frontend|packages?)\/[\w\-./]+\.\w{1,5}|[\w\-]+\.(ts|tsx|js|jsx|py|rs|go|java|kt|swift|c|cpp|h|hpp|cs|rb|php|sh|sql|yaml|yml|toml|json|md|css|scss|html))\s*$/;

/** The replacement notice for redacted code blocks */
const REDACTION_NOTICE =
  '\n\n> [注：为保护候选人的源代码安全，具体代码内容已被省略。如需了解技术实现细节，建议安排技术面试。]\n\n';

/**
 * Redact large source code dumps from the agent's output.
 *
 * Criteria for redaction:
 * - Fenced code blocks (``` ... ```) that are >= 8 lines AND contain >= 3 "codeish" indicators
 * - Lines that look like file paths from repo directory structure
 *
 * Small illustrative snippets (< 8 lines or < 3 code indicators) are preserved.
 */
export function redactSourceDumps(text: string): string {
  if (!text) return text;

  // Step 1: Redact large code blocks
  let result = text.replace(CODE_FENCE_REGEX, (block) => {
    const lines = block.split('\n');
    // Remove the fence lines (``` markers)
    const inner = lines.slice(1, -1).filter((l) => l.trim().length > 0);

    if (inner.length < 8) {
      // Small snippet, keep it
      return block;
    }

    // Count codeish lines
    let codeishCount = 0;
    for (const line of inner) {
      if (CODEISH_LINE_REGEX.test(line)) {
        codeishCount++;
      }
    }

    if (codeishCount >= 3) {
      // Large code block with many code indicators — redact
      return REDACTION_NOTICE.trim();
    }

    // Not enough code indicators, might be configuration or text — keep
    return block;
  });

  // Step 2: Strip lines that look like repo directory paths (bulk file listings)
  const outputLines = result.split('\n');
  const filteredLines: string[] = [];
  let consecutivePaths = 0;

  for (const line of outputLines) {
    if (FILE_PATH_LINE_REGEX.test(line)) {
      consecutivePaths++;
      // Only strip if there are 4+ consecutive path lines (a directory listing)
      if (consecutivePaths >= 4) {
        if (consecutivePaths === 4) {
          // Replace the streak with a notice
          filteredLines.push('> [目录结构已省略]');
        }
        continue; // Skip this line
      }
    } else {
      consecutivePaths = 0;
    }
    filteredLines.push(line);
  }

  result = filteredLines.join('\n');

  return result;
}
