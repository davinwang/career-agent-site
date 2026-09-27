import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { get, all } from '../db/client.js';
import { cloneRepo, runProjectAnalysis, type ProjectRow } from '../services/projects.js';

/**
 * Clone a GitHub repo into the repos directory. Admin only.
 */
export const addGithubRepo = createTool({
  id: 'add-github-repo',
  description:
    'Clone a git repository (GitHub or any git URL) into the project directory and register it for analysis.',
  inputSchema: z.object({
    url: z.string().describe('Git repository URL'),
    name: z.string().optional().describe('Optional project name (derived from URL if omitted)'),
  }),
  execute: async (context) => {
    const result = await cloneRepo(context.url, context.name);
    if (!result.ok) {
      return { error: result.error };
    }
    return { ok: true, id: result.id, name: result.name, status: result.status, updated: result.updated ?? false };
  },
});

/**
 * Analyze a cloned project: compute stats, read key files, generate understanding doc
 * and resume content using the LLM. Admin only.
 */
export const analyzeProject = createTool({
  id: 'analyze-project',
  description:
    'Analyze a cloned project repository. Generates a project understanding document and resume content using the LLM. The project must already be cloned via addGithubRepo.',
  inputSchema: z.object({
    projectId: z.string().describe('The project ID returned by addGithubRepo'),
  }),
  execute: async (context) => {
    const result = await runProjectAnalysis(context.projectId);
    if (!result.ok) {
      return { error: result.error };
    }
    return result;
  },
});

/**
 * Get a project's understanding doc and resume content. Admin only.
 */
export const getProjectDoc = createTool({
  id: 'get-project-doc',
  description: 'Retrieve the project understanding document and generated resume content for a project.',
  inputSchema: z.object({
    projectId: z.string().describe('The project ID'),
  }),
  execute: async (context) => {
    try {
      const { projectId } = context;
      const project = await get<ProjectRow>(
        'SELECT id, name, repo_url, doc, resume_content, status, created_at FROM projects WHERE id = ?',
        [projectId],
      );
      if (!project) {
        return { error: `Project not found: ${projectId}` };
      }

      let resumeContent = null;
      if (project.resume_content) {
        try {
          resumeContent = JSON.parse(project.resume_content);
        } catch {
          resumeContent = project.resume_content;
        }
      }

      return {
        id: project.id,
        name: project.name,
        repo_url: project.repo_url,
        status: project.status,
        doc: project.doc,
        resume_content: resumeContent,
        created_at: project.created_at,
      };
    } catch (err: any) {
      return { error: `Failed to get project doc: ${err.message}` };
    }
  },
});

/**
 * List all projects. Available to both agents.
 */
export const listProjects = createTool({
  id: 'list-projects',
  description: 'List all registered projects with their name, status, and repository URL.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const rows = await all<{ id: string; name: string; repo_url: string | null; status: string; created_at: string }>(
        'SELECT id, name, repo_url, status, created_at FROM projects ORDER BY created_at DESC',
      );
      return { projects: rows, count: rows.length };
    } catch (err: any) {
      return { error: `Failed to list projects: ${err.message}` };
    }
  },
});
