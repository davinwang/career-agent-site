import { Agent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import { RECRUITER_SYSTEM_PROMPT } from '../../prompts/system.js';
import { composeInstructions, loadSkillsPrompt } from '../../prompts/skills.js';
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
export async function createRecruiterAgent(memory?: MastraMemory) {
  // Skills are per-language: inject both language variants tagged with their
  // language, and instruct the agent to follow the one matching the visitor's
  // language. This keeps a single agent instance while respecting language.
  const [zhSkills, enSkills] = await Promise.all([
    loadSkillsPrompt('zh'),
    loadSkillsPrompt('en'),
  ]);
  const langNote =
    zhSkills || enSkills
      ? '\n\n## 行为技能（Skills）— 按访客语言生效\n仅应用与访客当前语言一致的一组技能；语言切换时随之切换，绝不混用两组。'
      : '';
  const blocks = [
    zhSkills ? `<!-- lang:zh -->${zhSkills}` : '',
    enSkills ? `<!-- lang:en -->${enSkills}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const instructions = `${await composeInstructions(RECRUITER_SYSTEM_PROMPT)}${langNote}${blocks}`;

  return new Agent({
    id: 'recruiter-agent',
    name: 'recruiter-agent',
    instructions,
    model: llmModelConfig(),
    tools: recruiterTools,
    memory,
    defaultOptions: {
      maxSteps: 15,
    },
  });
}

export type RecruiterAgent = Awaited<ReturnType<typeof createRecruiterAgent>>;
