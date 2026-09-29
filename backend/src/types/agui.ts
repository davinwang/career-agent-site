/** Narrow AG-UI event subset the frontends consume. */
export type AGUIEvent =
  | { type: 'TEXT_MESSAGE_START'; messageId: string }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'TOOL_CALL_START'; toolCallId: string; toolName: string }
  | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string; toolResult?: string }
  | { type: 'RUN_ERROR'; delta: string }
  | { type: 'RUN_FINISHED'; threadId: string };
