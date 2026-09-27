# AGENTS.md — job-agent-site

Personal resume site + AI chat agents for 王栋 (Davin Wang), served at https://aboutme.davin.wang (host port 8090).

## Architecture (v2 — commit a6db879)

Monorepo, four containers behind nginx (`deploy/docker-compose.yml`):

| Component | Path | Stack | Container |
|---|---|---|---|
| Backend API + agents | `backend/` | Node 22, Hono, Mastra (@mastra/core), libSQL (SQLite), AG-UI SSE | `jas-backend` (:4111, internal) |
| Recruiter portal (public) | `frontend/recruiter/` | React 19, Vite 6, Tailwind 4, served at `/` | `jas-recruiter` |
| Admin portal | `frontend/admin/` | React 19 + react-router 7 + zustand, Vite base `/admin/` | `jas-admin` |
| Reverse proxy | `deploy/nginx/` | nginx:alpine, Docker DNS resolver 127.0.0.11 | `jas-nginx` (:8090 → 80) |

Legacy v1 (Chainlit) kept read-only under `legacy/`; its `legacy/app/public-static/` is mounted read-only into the backend at `/legacy/app/public-static` because `src/db/seed.ts` reads the original resume JSON from there (path resolved via ROOT_DIR, which is `/` inside the image).

## Routes (nginx, `deploy/nginx/default.conf`)

- `/` → recruiter portal
- `/admin/` → admin portal (prefix stripped on proxy)
- `/api/*` → backend REST
- `/ag-ui/*` → backend SSE chat (streaming: `proxy_buffering off`)
- `/health` → backend `/api/health`

⚠ After recreating app containers, `jas-nginx` caches stale Docker DNS → 404 on `/chat/`-style proxied paths. Fix: `sudo docker exec jas-nginx nginx -s reload`.

## Backend layout (`backend/src/`)

- `server.ts` — Hono app: routes `/api/{auth,resume,sessions,upload,skills,knowledge,projects}`, SSE chat via AG-UI, global CORS (`config.frontendOrigins`), centralized onError (never leak stacks in prod).
- `db/` — `schema.ts` (idempotent DDL: resume, sessions, messages, knowledge, projects), `client.ts` (libSQL), `seed.ts` (first-run seeding from legacy JSON + admin creds from env).
- `mastra/` — two agents: `recruiterAgent` (read-only tools) and `adminAgent` (read+write). LibSQLStore shares the app DB file.
- `tools/index.ts` — tool registry. **Key invariant: recruiter gets only `READ_TOOLS`; `WRITE_TOOLS` (updateResumeSection, ingestFile, addGithubRepo, analyzeProject, rememberFact, forgetFact…) are admin-only. Never give the recruiter agent write tools.**
- `guardrails/` — input check + output redaction (source-dump redaction).
- `services/pdf.ts` — PDF generation via pdfkit using fonts in `/fonts` (Alibaba PuHuiTi).

## Config / env

All runtime config from env. Dev template: `backend/.env.example`; prod: **`deploy/.env`** (git-ignored; must exist there — compose reads it via `env_file` and `EXPOSE_PORT`). Key vars: `LLM_PROVIDER/LLM_MODEL/LLM_API_KEY/LLM_BASE_URL`, `PORT=4111`, `ADMIN_USERNAME/ADMIN_PASSWORD` (used by seed on first run), `JWT_SECRET`, `DATABASE_PATH`, `FRONTEND_ORIGINS`, `EXPOSE_PORT=8090`, `UPLOAD_DIR`, `REPO_DIR`, `FONT_DIR`.

## Common commands

```bash
# Deploy / rebuild (from deploy/)
cd deploy && sudo docker compose up --build -d

# First boot seeding (after fresh volume):
sudo docker exec jas-backend node dist/db/seed.js

# Health check
curl http://localhost:8090/api/health   # or /health

# Dev
cd backend && npm run dev            # tsx watch, :4111
cd frontend/recruiter && npm run dev # :5173
cd frontend/admin && npm run dev     # :5174

# Build / typecheck
npm run build; npm run typecheck   # in each frontend; backend: npm run build (tsc)
```

## Conventions & invariants

- Admin portal writes go through the admin agent (MCP-style tools) with JWT auth; recruiter portal is read-only. Do not weaken this boundary.
- Resume data is bilingual (zh/en) — keep both languages in sync when editing data.
- Data lives in `data/` (mounted volume): SQLite at `data/db/job-agent.db`. "One-off data fix" = edit DB/data on the volume only, no code change/restart. Code changes should be committed and pushed.
- Frontend control order in recruiter UI (resume panel top bar): language → download (PDF) → theme toggle (rightmost). Keep short Chinese/Eng labels (≤4 chars).
- Recruiter portal is a single session (no sidebar); admin portal keeps multi-session sidebar.
- No test suite in v2; verify via `/api/health` + browser checks.
- `_count.ps1`, `deploy/up.ps1` are Windows leftovers; use `deploy/up.sh` / docker compose directly.
