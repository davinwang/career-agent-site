import { createClient, type Client, type InValue, type Row } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { SCHEMA_STATEMENTS } from './schema.js';

let client: Client | null = null;
let initPromise: Promise<Client> | null = null;

/** Convert a filesystem DB path into a libSQL connection URL. */
function toFileUrl(dbPath: string): string {
  const absolute = path.resolve(dbPath);
  // Ensure the parent directory exists so libSQL can create the file.
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  // libSQL expects a file: URL; on Windows normalize backslashes.
  return `file:${absolute.split(path.sep).join('/')}`;
}

/**
 * Initialize (once) the database: create the client, enable foreign keys and
 * run all schema statements. Safe to call repeatedly / concurrently.
 */
export async function initDb(): Promise<Client> {
  if (client) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = createClient({ url: toFileUrl(config.databasePath) });
    // Enforce referential integrity (OFF by default in SQLite).
    await db.execute('PRAGMA foreign_keys = ON;');
    for (const statement of SCHEMA_STATEMENTS) {
      await db.execute(statement);
    }
    client = db;
    return db;
  })();

  return initPromise;
}

/** Get the initialized database client, initializing it on first call. */
export async function getDb(): Promise<Client> {
  return initDb();
}

/** Run a statement that does not return rows (INSERT/UPDATE/DELETE/DDL). */
export async function run(sql: string, params: InValue[] = []) {
  const db = await getDb();
  return db.execute({ sql, args: params });
}

/** Fetch a single row (or undefined when no match). */
export async function get<T = Row>(sql: string, params: InValue[] = []): Promise<T | undefined> {
  const db = await getDb();
  const result = await db.execute({ sql, args: params });
  return (result.rows[0] as T | undefined) ?? undefined;
}

/** Fetch all matching rows. */
export async function all<T = Row>(sql: string, params: InValue[] = []): Promise<T[]> {
  const db = await getDb();
  const result = await db.execute({ sql, args: params });
  return result.rows as unknown as T[];
}

/** Close the underlying client (used for graceful shutdown). */
export async function closeDb(): Promise<void> {
  if (client) {
    client.close();
    client = null;
    initPromise = null;
  }
}
