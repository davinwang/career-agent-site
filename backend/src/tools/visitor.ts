import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getVisitorAttachments } from '../api/attachment.js';

/**
 * Read attachments uploaded by the current visitor (JD, role description…).
 * Recruiter-facing READ tool: exposes only the extracted text of the visitor's
 * own session uploads — never admin uploads, never binaries.
 */
export const listVisitorAttachments = createTool({
  id: 'list-visitor-attachments',
  description:
    'List files uploaded by the current visitor in this chat session (e.g. a job description they want matched against the candidate). Returns metadata plus the FULL extracted text of each attachment. Call this when the visitor references an uploaded file or asks for a fit/match assessment.',
  inputSchema: z.object({
    sessionId: z.string().describe('The visitor chat session ID (provided in the conversation context)'),
  }),
  execute: async ({ sessionId }) => {
    const files = await getVisitorAttachments(sessionId);
    if (!files.length) {
      return {
        count: 0,
        note: 'No attachments in this session. The visitor can upload a JD via the paperclip button in the chat composer.',
      };
    }
    return {
      count: files.length,
      files: files.map((f) => ({
        original_name: f.original_name,
        ext: f.ext,
        chars: f.chars,
        uploaded_at: f.created_at,
        text: f.text,
      })),
    };
  },
});
