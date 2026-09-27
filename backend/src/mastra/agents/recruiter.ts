import { Agent } from '@mastra/core/agent';
import { RECRUITER_SYSTEM_PROMPT } from '../../prompts/system.js';
import { composeInstructions } from '../../prompts/skills.js';
import { recruiterTools } from '../../tools/index.js';
import { llmModelConfig } from '../model.js';

/**
 * Recruiter-facing agent.
 *
 * Hard read-only contract: it only ever receives READ tools and its system
 * prompt forbids mutation, source-code disclosure, PII leaks and social
 * engineering. Skills enabled in the DB are appended to the base prompt so the
 * candidate can tune recruiter behaviour without a redeploy.
 */
export async function createRecruiterAgent() {
  const instructions = await composeInstructions(RECRUITER_SYSTEM_PROMPT);

  return new Agent({
    id: 'recruiter-agent',
    name: 'recruiter-agent',
    instructions,
    model: llmModelConfig(),
    tools: recruiterTools,
  });
}

export type RecruiterAgent = Awaited<ReturnType<typeof createRecruiterAgent>>;
