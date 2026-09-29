import { Agent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
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
export async function createAdminAgent(memory?: MastraMemory) {
  return new Agent({
    id: 'admin-agent',
    name: 'admin-agent',
    instructions: ADMIN_SYSTEM_PROMPT,
    model: llmModelConfig(),
    tools: adminTools,
    memory,
    defaultOptions: {
      maxSteps: 25,
    },
  });
}

export type AdminAgent = Awaited<ReturnType<typeof createAdminAgent>>;
