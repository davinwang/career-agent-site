import { Agent } from '@mastra/core/agent';
import { ADMIN_SYSTEM_PROMPT } from '../../prompts/system.js';
import { adminTools } from '../../tools/index.js';
import { llmModelConfig } from '../model.js';

/**
 * Admin-facing agent (the candidate themself).
 *
 * Full data access: receives both READ and WRITE tools so it can update the
 * resume, ingest documents, analyze project repos, manage the knowledge base /
 * long-term memory and configure recruiter skills.
 */
export async function createAdminAgent() {
  return new Agent({
    id: 'admin-agent',
    name: 'admin-agent',
    instructions: ADMIN_SYSTEM_PROMPT,
    model: llmModelConfig(),
    tools: adminTools,
  });
}

export type AdminAgent = Awaited<ReturnType<typeof createAdminAgent>>;
