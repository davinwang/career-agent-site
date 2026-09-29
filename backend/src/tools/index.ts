/**
 * Tool registry.
 *
 * Exports two tool sets:
 * - `recruiterTools`: read-only tools for the recruiter agent
 * - `adminTools`: full read + write tools for the admin agent
 *
 * The recruiter agent can ONLY ever receive read-only tools. The admin agent
 * receives all tools including write operations.
 */

import { getFullResume, updateResumeSection } from './resume.js';
import { searchKnowledge, listKnowledgeFiles, ingestFile } from './knowledge.js';
import { addGithubRepo, analyzeProject, getProjectDoc, listProjects, listGithubRepos } from './projects.js';
import { rememberFact, recallFacts, forgetFact } from './memory.js';
import { listSkills, createSkill, updateSkill, deleteSkill } from './skills.js';

// Re-export individual tools for direct use if needed
export { getFullResume, updateResumeSection } from './resume.js';
export { searchKnowledge, listKnowledgeFiles, ingestFile } from './knowledge.js';
export { addGithubRepo, analyzeProject, getProjectDoc, listProjects, listGithubRepos } from './projects.js';
export { rememberFact, recallFacts, forgetFact } from './memory.js';
export { listSkills, createSkill, updateSkill, deleteSkill } from './skills.js';

/** Read-only tools available to BOTH agents. */
export const READ_TOOLS = {
  getFullResume,
  searchKnowledge,
  listKnowledgeFiles,
  recallFacts,
  listProjects,
};

/** Write tools available ONLY to the admin agent. */
export const WRITE_TOOLS = {
  updateResumeSection,
  ingestFile,
  addGithubRepo,
  analyzeProject,
  getProjectDoc,
  rememberFact,
  forgetFact,
  createSkill,
  updateSkill,
  deleteSkill,
  listGithubRepos,
};

/** Tool set assembled for the recruiter (read-only) agent. */
export const recruiterTools = { ...READ_TOOLS };

/** Tool set assembled for the admin (full-access) agent. */
export const adminTools = { ...READ_TOOLS, ...WRITE_TOOLS, listSkills };
