import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { MastraAgent, getLocalAgent } from '@ag-ui/mastra';
import type { BaseEvent } from '@ag-ui/client';
import type { Mastra } from '@mastra/core';
import type { Context as AgUiContext, Message as AgUiMessage, Tool as AgUiTool } from '@ag-ui/core';
import { getMastra } from '../mastra/index.js';
import { checkInput } from '../guardrails/input.js';
import { ensureSession, persistMessages } from './session.js';
import type { AGUIEvent } from '../types/agui.js';

export interface RunAgentOptions {
  /** 'admin' or 'recruiter' — picks the Mastra agent + session kind. */
  kind: 'admin' | 'recruiter';
  sessionId: string;
  /** Authenticated username; becomes the Mastra resourceId so memory is per-user. */
  resourceId: string;
  /** Full conversation history sent by the frontend (oldest first). */
  messages: Array<{ role: string; content: string }>;
  /** Abort signal wired to the client connection. */
  signal: AbortSignal;
}

/**
 * Translate AG-UI protocol events from the Mastra bridge into the subset the
 * admin/recruiter frontends understand:
 *
 *   TEXT_MESSAGE_CHUNK   -> TEXT_MESSAGE_START/CONTENT/END (per messageId)
 *   TOOL_CALL_START      -> TOOL_CALL_START   (toolCallName -> toolName)
 *   TOOL_CALL_ARGS       -> TOOL_CALL_ARGS    (delta passthrough)
 *   TOOL_CALL_END        -> TOOL_CALL_END
 *   TOOL_CALL_RESULT     -> TOOL_CALL_END     (result re-emitted on the same id)
 *   RUN_ERROR            -> RUN_ERROR
 *   RUN_FINISHED         -> RUN_FINISHED
 *
 * Everything else (state snapshots, reasoning, raw events...) is dropped.
 */
export function translateEvents(events: Observable<BaseEvent>): Observable<AGUIEvent> {
  return new Observable<AGUIEvent>((subscriber) => {
    const openText = new Map<string, string>(); // messageId -> START sent
    const closedTools = new Set<string>(); // toolCallId already ENDed

    // Bridge events share loose typings; assert the fields we consume.
    type LooseEvent = {
      type: string;
      messageId?: string;
      delta?: string;
      toolCallId?: string;
      toolCallName?: string;
      content?: unknown;
      message?: string;
      threadId?: string;
    };

    const sub = events.subscribe({
      next: (raw) => {
        const event = raw as unknown as LooseEvent;
        const emit = (e: AGUIEvent) => subscriber.next(e);
        switch (event.type) {
          case 'TEXT_MESSAGE_CHUNK': {
            const messageId = event.messageId ?? 'msg';
            if (!openText.has(messageId)) {
              openText.set(messageId, '1');
              emit({ type: 'TEXT_MESSAGE_START', messageId });
            }
            if (event.delta) {
              emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: event.delta });
            }
            break;
          }
          case 'TEXT_MESSAGE_START': {
            const id = event.messageId ?? 'msg';
            if (!openText.has(id)) {
              openText.set(id, '1');
              emit({ type: 'TEXT_MESSAGE_START', messageId: id });
            }
            break;
          }
          case 'TEXT_MESSAGE_CONTENT': {
            if (event.delta && event.messageId) {
              emit({ type: 'TEXT_MESSAGE_CONTENT', messageId: event.messageId, delta: event.delta });
            }
            break;
          }
          case 'TEXT_MESSAGE_END': {
            if (event.messageId && openText.delete(event.messageId)) {
              emit({ type: 'TEXT_MESSAGE_END', messageId: event.messageId });
            }
            break;
          }
          case 'TOOL_CALL_START': {
            if (event.toolCallId) {
              emit({
                type: 'TOOL_CALL_START',
                toolCallId: event.toolCallId,
                toolName: event.toolCallName ?? 'tool',
              });
            }
            break;
          }
          case 'TOOL_CALL_ARGS': {
            if (event.toolCallId) {
              emit({ type: 'TOOL_CALL_ARGS', toolCallId: event.toolCallId, delta: event.delta ?? '' });
            }
            break;
          }
          case 'TOOL_CALL_END': {
            if (event.toolCallId && !closedTools.has(event.toolCallId)) {
              closedTools.add(event.toolCallId);
              emit({ type: 'TOOL_CALL_END', toolCallId: event.toolCallId });
            }
            break;
          }
          case 'TOOL_CALL_RESULT': {
            // The frontend models results on TOOL_CALL_END; close (if needed)
            // then re-emit an END carrying the result payload.
            const toolCallId = event.toolCallId ?? '';
            if (!toolCallId) break;
            if (!closedTools.has(toolCallId)) {
              closedTools.add(toolCallId);
              emit({ type: 'TOOL_CALL_END', toolCallId });
            }
            const content =
              typeof event.content === 'string' ? event.content : JSON.stringify(event.content ?? '');
            emit({ type: 'TOOL_CALL_END', toolCallId, toolResult: content });
            break;
          }
          case 'RUN_ERROR': {
            emit({ type: 'RUN_ERROR', delta: (event as any).message ?? 'Agent 运行出错' });
            break;
          }
          case 'RUN_FINISHED': {
            // Close any dangling segments so the frontend renderers settle.
            for (const messageId of openText.keys()) {
              emit({ type: 'TEXT_MESSAGE_END', messageId });
            }
            openText.clear();
            emit({ type: 'RUN_FINISHED', threadId: (event as any).threadId ?? '' });
            break;
          }
          default:
            break;
        }
      },
      error: (err) => {
        subscriber.next({ type: 'RUN_ERROR', delta: err?.message ?? 'Agent 运行出错' });
        subscriber.complete();
      },
      complete: () => {
        subscriber.complete();
      },
    });

    return () => sub.unsubscribe();
  });
}

/**
 * Run a turn through the Mastra agent via the AG-UI bridge. Returns the raw
 * event stream; callers translate + forward over SSE. Conversation history is
 * persisted by Mastra's Memory (thread/resource keyed) — this function also
 * mirrors the user turn + final assistant text into our own sessions/messages
 * tables for the session sidebar / history endpoint.
 */
export async function runAgentTurn(opts: RunAgentOptions): Promise<Observable<AGUIEvent>> {
  const { kind, sessionId, resourceId, messages, signal } = opts;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const userMessage = lastUser?.content?.trim() ?? '';
  if (!userMessage) {
    throw new Error('没有用户消息');
  }
  // Input guardrail is a recruiter-portal concern (public visitors). The admin
  // IS the candidate — never intercept their own instructions.
  if (kind === 'recruiter') {
    const check = await checkInput(userMessage);
    if (!check.safe) {
      throw new Error(check.reason ?? '输入被安全策略拒绝');
    }
  }

  const mastra = await getMastra();
  const agentId = kind === 'admin' ? 'adminAgent' : 'recruiterAgent';

  const agent = getLocalAgent({
    mastra,
    agentId,
    resourceId,
  });

  // History: everything except the trailing user message (the bridge feeds it
  // to Mastra, which stores it into the thread memory).
  const history: AgUiMessage[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) =>
      m.role === 'user'
        ? { id: randomUUID(), role: 'user' as const, content: m.content }
        : { id: randomUUID(), role: 'assistant' as const, content: m.content },
    );

  const runId = randomUUID();
  const aguiAgent = MastraAgent.getLocalAgent({ mastra, agentId, resourceId });

  const events = aguiAgent.run({
    threadId: sessionId,
    runId,
    messages: history,
    tools: [] as AgUiTool[],
    context: [] as AgUiContext[],
    forwardedProps: {},
  });

  // Chain agent.run(...) abort with the client signal.
  signal.addEventListener('abort', () => {
    try {
      (aguiAgent as unknown as { abortRun: () => void }).abortRun();
    } catch {
      /* already torn down */
    }
  });

  void agent; // getLocalAgent validated the agent exists; actual runs use MastraAgent

  // Persist our side of the conversation after the run completes.
  let assistantText = '';
  return new Observable<AGUIEvent>((subscriber) => {
    const translated = translateEvents(events);
    const sub = translated.subscribe({
      next: (e) => {
        if (e.type === 'TEXT_MESSAGE_CONTENT') assistantText += e.delta;
        subscriber.next(e);
      },
      error: (err) => subscriber.error(err),
      complete: () => {
        void ensureSession(sessionId, kind)
          .then(() => persistMessages(sessionId, kind, userMessage, assistantText || '(工具执行完成)'))
          .catch((err) => console.error('[chat] persist failed:', err?.message))
          .finally(() => subscriber.complete());
      },
    });
    return () => sub.unsubscribe();
  });
}
