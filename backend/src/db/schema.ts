/**
 * SQL DDL for the job-agent SQLite (libSQL) database.
 * Each statement is idempotent (CREATE TABLE IF NOT EXISTS) and is executed on
 * first database initialization. Exported individually for testability and as a
 * single ordered list for the client bootstrap.
 */

export const SQL_CREATE_RESUME = `
CREATE TABLE IF NOT EXISTS resume (
  lang TEXT PRIMARY KEY DEFAULT 'zh',
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const SQL_CREATE_SESSIONS = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  side TEXT NOT NULL CHECK(side IN ('recruiter', 'admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata TEXT
);
`;

export const SQL_CREATE_MESSAGES = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  tool_calls TEXT,
  created_at TEXT NOT NULL
);
`;

export const SQL_CREATE_KNOWLEDGE = `
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('upload', 'repo', 'manual')),
  content TEXT NOT NULL,
  chunks TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
`;

export const SQL_CREATE_PROJECTS = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_url TEXT,
  doc TEXT,
  resume_content TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'analyzing', 'done', 'error')),
  created_at TEXT NOT NULL
);
`;

export const SQL_CREATE_SKILLS = `
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`;

export const SQL_CREATE_UPLOADS = `
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  stored_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
`;

export const SQL_CREATE_FACTS = `
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export const SQL_CREATE_SETTINGS = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const SQL_CREATE_ADMIN_CREDENTIALS = `
CREATE TABLE IF NOT EXISTS admin_credentials (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL
);
`;

/** Indexes that speed up the most common query patterns. */
export const SQL_CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_side ON sessions(side);`,
  `CREATE INDEX IF NOT EXISTS idx_skills_enabled_priority ON skills(enabled, priority);`,
];

/** All table DDL statements, in dependency order (parents before children). */
export const SCHEMA_STATEMENTS: string[] = [
  SQL_CREATE_RESUME,
  SQL_CREATE_SESSIONS,
  SQL_CREATE_MESSAGES,
  SQL_CREATE_KNOWLEDGE,
  SQL_CREATE_PROJECTS,
  SQL_CREATE_SKILLS,
  SQL_CREATE_UPLOADS,
  SQL_CREATE_FACTS,
  SQL_CREATE_SETTINGS,
  SQL_CREATE_ADMIN_CREDENTIALS,
  ...SQL_CREATE_INDEXES,
];
