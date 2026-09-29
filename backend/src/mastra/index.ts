import path from 'node:path';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { config } from '../config.js';
import { initDb } from '../db/client.js';
import { createRecruiterAgent } from './agents/recruiter.js';
import { createAdminAgent } from './agents/admin.js';

/** Build a libSQL file: URL from the configured database path. */
function storageUrl(): string {
  const absolute = path.resolve(config.databasePath);
  return `file:${absolute.split(path.sep).join('/')}`;
}

let mastraPromise: Promise<Mastra> | null = null;

/**
 * Create (once) the Mastra instance:
 *  - two agents: `recruiterAgent` (read-only) and `adminAgent` (full access)
 *  - LibSQLStore backing agent memory / threads, sharing the app database
 *
 * The database schema is initialized before the store is constructed so both
 * Mastra-managed tables and our application tables coexist in one file.
 */
export function getMastra(): Promise<Mastra> {
  if (!mastraPromise) {
    mastraPromise = (async () => {
      // Ensure our own tables exist first (idempotent).
      await initDb();

      const memory = new Memory({ options: { lastMessages: 20 } });

      const [recruiterAgent, adminAgent] = await Promise.all([
        createRecruiterAgent(memory),
        createAdminAgent(memory),
      ]);

      const storage = new LibSQLStore({ id: 'job-agent', url: storageUrl() });

      return new Mastra({
        agents: { recruiterAgent, adminAgent },
        storage,
        memory: { default: memory },
      });
    })();
  }
  return mastraPromise;
}

/** Convenience accessor for the recruiter agent. */
export async function getRecruiterAgent() {
  const mastra = await getMastra();
  return mastra.getAgent('recruiterAgent');
}

/** Convenience accessor for the admin agent. */
export async function getAdminAgent() {
  const mastra = await getMastra();
  return mastra.getAgent('adminAgent');
}
