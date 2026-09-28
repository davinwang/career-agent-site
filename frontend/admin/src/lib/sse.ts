/**
 * Minimal Server-Sent Events parser for `fetch` streams.
 *
 * The AG-UI protocol emits newline-delimited `data: {json}` frames. This
 * generator reads the response body incrementally, buffers partial lines
 * across chunks, and yields parsed events as they arrive.
 */

export interface SSEEvent {
  type:
    | "TEXT_MESSAGE_START"
    | "TEXT_MESSAGE_CONTENT"
    | "TEXT_MESSAGE_END"
    | "TOOL_CALL_START"
    | "TOOL_CALL_ARGS"
    | "TOOL_CALL_END"
    | "RUN_STARTED"
    | "RUN_FINISHED"
    | "RUN_ERROR"
    | string;
  messageId?: string;
  toolCallId?: string;
  delta?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  raw?: Record<string, unknown>;
}

/** Strip an optional `event:`/`data:` prefix and parse the JSON payload. */
function parseFrame(line: string): SSEEvent | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return null; // comment / heartbeat
  // SSE `event:` lines name the frame type; the backend always puts the real
  // type inside the JSON `data:` payload, so the line itself is not content.
  if (trimmed.startsWith("event:")) return null;

  let payload = trimmed;
  if (payload.startsWith("data:")) {
    payload = payload.slice(5).trim();
  }
  if (!payload || payload === "[DONE]") return null;

  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    return { ...(obj as object), raw: obj } as SSEEvent;
  } catch {
    // Non-JSON data frame — surface the raw text as a content delta.
    // Guard: only *data* lines may become deltas, never bare protocol lines,
    // otherwise raw SSE framing ("event: message") leaks into the bubble.
    return trimmed.startsWith("data:")
      ? { type: "TEXT_MESSAGE_CONTENT", delta: payload }
      : null;
  }
}

export async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Emit every complete frame; keep the trailing partial in the buffer.
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const evt = parseFrame(line.replace(/\r$/, ""));
        if (evt) yield evt;
      }
    }
    // Flush any residual frame.
    buffer += decoder.decode();
    const evt = parseFrame(buffer);
    if (evt) yield evt;
  } finally {
    reader.releaseLock();
  }
}
