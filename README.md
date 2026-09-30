# Job Agent Site

**AI-powered career portfolio & recruiting portal** — a personal resume site where an AI agent represents the candidate to recruiters, and a second agent coaches the candidate behind the scenes.

[![Live](https://img.shields.io/badge/live-aboutme.davin.wang-2f6f4f)](https://aboutme.davin.wang)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-22-339933)](https://nodejs.org)
[![React 19](https://img.shields.io/badge/react-19-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5-3178c6)](https://www.typescriptlang.org)

> English | [中文](#中文说明)

---

## Why: a candidate-side answer to AI recruiting

AI in recruiting today mostly serves the **buyer side**: sourcing bots, ATS keyword filters, interviewer copilots. The candidate gets a static PDF and prays. This project is built **from the candidate's seat**:

- **Your story, told by your own agent.** The recruiter-facing agent is the candidate's representative, not a company bot. It answers accurately from published data, never oversells, and knows when to say "let me confirm and get back to you."
- **The resume becomes a living service.** Instead of exporting a PDF every job change, the candidate maintains one structured source of truth; every recruiter interaction reads the current version.
- **Data stays with the candidate.** Self-hosted, single SQLite file, no third-party ATS in the middle. The candidate decides what is published and in which language.

And because job hunting is a career problem, not a document problem, the admin side is deliberately built as a **career mentor, not a resume editor**:

- It diagnoses a stale résumé and tells you what's missing — then coaches you through fixing it.
- It asks what kind of work you actually want, evaluates transition options (e.g., 20-year fintech architect → AI architecture roles), and suggests positioning.
- It prepares you for interviews, and proactively raises things a good mentor would: "targeting foreign firms? let's prepare an English résumé."

The résumé, the repo analysis, the language versions — those are **byproducts of the coaching conversation**, which is why the admin interface has no forms.

## What it is

Most PDF resumes are static, one-shot, and go stale the moment they're exported. This project replaces the static resume with **two AI agents sharing one living resume database**:

- **Recruiter-facing agent (public)** — visitors at [aboutme.davin.wang](https://aboutme.davin.wang) chat with an agent that answers questions about the candidate's experience, projects and skills. It reads the live resume data, so every answer is current. It is **hard-wired read-only** and guarded against prompt injection, source-code exfiltration and privacy fishing.
- **Career-mentor agent (admin)** — the candidate manages everything through conversation: uploading a rough résumé PDF for gap analysis, feeding project git URLs for automated source-code analysis, attaching photos and documents, editing any resume section, and configuring the recruiter agent's behaviour — all in chat, no forms. The mentor also advises on career direction, transition planning, and preparing résumés in additional languages.

## Key features

| Area | Details |
|---|---|
| Conversational workbench | No CRUD forms in the admin portal — resume edits, document ingestion, repo analysis and skill tuning all happen via agent chat |
| Multi-language résumé | Independent résumé blobs per language (zh/en/…), PDF export with embedded CJK fonts |
| Repo intelligence | Clones GitHub repos (PAT or OAuth, AES-256-GCM encrypted at rest) and distills them into project docs + résumé entries |
| Knowledge base | PDF/DOCX/MD/code ingestion with chunked retrieval, available to both agents |
| Guardrails | Input classification (prompt-injection, privacy-fishing, defamation), output redaction of source dumps, read-only tool contract for the public agent |
| Streaming chat | AG-UI protocol over SSE, with tool-call visualization in both portals |
| Theming | Three editorial skins for the recruiter portal, persisted server-side |

## Architecture

```
                        ┌────────────────────────────────────────────┐
                        │                  jas-nginx                 │
   Visitors ───────────►│  /  ·  /admin/  ·  /api/*  ·  /ag-ui/*     │◄── Candidate (JWT)
                        └───────┬──────────────┬──────────────┬──────┘
                                │              │              │
                        ┌───────▼─────┐ ┌──────▼─────┐ ┌─────▼──────────────┐
                        │ recruiter   │ │   admin    │ │    jas-backend     │
                        │ React 19    │ │ React 19   │ │ Hono · Mastra      │
                        │ (public)    │ │ (JWT)      │ │ AG-UI SSE · libSQL │
                        └─────────────┘ └────────────┘ └─────┬────────────┘
                                                             │
                                     ┌───────────────────────┼──────────────────┐
                                     │                       │                  │
                              recruiterAgent          adminAgent          SQLite (libSQL)
                              read-only tools         read + write tools  resume · sessions
                              guardrails on           mentor prompt       messages · knowledge
                                                                          projects · skills
```

**Monorepo layout**

```
backend/            Node 22 · Hono · Mastra · libSQL — REST + AG-UI SSE, agents, tools, guardrails
frontend/recruiter/ Public portal — React 19 · Vite · Tailwind 4
frontend/admin/     Candidate portal (chat workbench) — React 19 · react-router · zustand
deploy/             docker-compose (4 containers) · nginx · env templates
legacy/             v1 (Chainlit) reference only — not part of the running system
fonts/              Alibaba PuHuiTi for PDF generation
```

### Security model

- The recruiter agent receives **only read tools**; write tools (resume mutation, ingestion, repo analysis, memory, skill config) are registered exclusively for the admin agent — enforced in the tool registry, not by prompt.
- Public recruiter chat passes an input guardrail before the LLM and an output redactor after it; blocked exchanges receive a canned safe reply.
- GitHub credentials: fine-grained PAT stored AES-256-GCM-encrypted (key derived from `JWT_SECRET`), or OAuth App flow. The agent never sees raw tokens.
- Non-image uploads require admin JWT; images under `/uploads/` are served publicly (résumé photos/logos) with long-lived cache headers.

## Quick start

Requirements: Docker (+ Compose v2). For development: Node 22, npm.

```bash
git clone https://github.com/davinwang/career-agent-site.git
cd career-agent-site/deploy
cp .env.example .env          # then edit: LLM key, admin creds, JWT_SECRET
docker compose up --build -d
docker compose exec backend node dist/db/seed.js   # first boot only
curl localhost:8090/health                         # → {"ok":true}
```

Open `http://localhost:8090` (recruiter portal) and `http://localhost:8090/admin/` (mentor workbench).

### Environment variables (see `deploy/.env.example`)

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` / `LLM_MODEL` / `LLM_API_KEY` / `LLM_BASE_URL` | OpenAI-compatible LLM endpoint |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Seeded on first boot |
| `JWT_SECRET` | Session tokens + credential-encryption key |
| `EXPOSE_PORT` | Host port (default 8090) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional OAuth App for repo cloning |

### Development

```bash
cd backend && npm run dev              # API on :4111
cd frontend/recruiter && npm run dev   # :5173 (proxies /api, /ag-ui)
cd frontend/admin && npm run dev       # :5174
```

## Design decisions

- **Conversation as the only admin interface.** Forms drift out of sync with agent capabilities; the chat interface cannot. Every admin capability is an agent tool, and the UI is a view over the same artifacts.
- **One database, two agents.** The recruiter always answers from published data — there is no separate "answer store" to fall out of sync.
- **SQLite/libSQL over a DB server.** Single-writer workload, effortless backup (one file), no operational surface. libSQL keeps the door open for hosted replication.
- **AG-UI protocol** for chat transport so tool calls stream visibly instead of disappearing into a server-side void.

## License

[MIT](LICENSE) © 2026 Davin Wang (王栋)

---

## 中文说明

**为什么做这个项目**：当下 AI 在招聘中的应用几乎都站在买方（企业侧）——Sourcing 机器人、ATS 关键词筛选、面试官副驾。候选人手里只有一份静态 PDF。本项目站在**候选人的立场**：让候选人拥有自己的 Agent 去讲述自己的故事，让简历成为可维护、可多语言发布的在线服务，数据完全自持（单文件 SQLite），不经过任何第三方 ATS。

管理端刻意做成**职业导师而非简历编辑器**：求职本质是职业问题而非文档问题。导师会诊断旧简历的差距并引导补强，会追问你到底想做什么工作、评估转型路径（如 20 年金融科技架构师 → AI 架构方向），会做面试辅导，也会像好导师一样主动提醒——"要投外企？那我们准备一份英文简历"。简历、项目分析、多语言版本，都只是这场辅导对话的副产品——这就是管理端没有表单的原因。

把静态 PDF 简历换成**两个共享同一份在线简历数据的 AI Agent**：

- **猎头端（公开）** — 访问者与"候选人代表 Agent"对话，了解经历、项目与技能。答案实时来自线上简历数据，永不过期。该 Agent 被强制只读，并配有防提示注入、防源码泄露、防隐私套取的多层护栏。
- **管理端（求职导师）** — 候选人通过对话完成一切：上传粗糙的旧简历做差距诊断、提供 git 仓库地址自动分析源码提炼简历条目、上传照片与文档、修改任意简历章节、调配猎头端行为提示词，乃至职业转型规划与多语言简历准备。没有表单，对话即工作台。

技术要点：Node 22 + Hono + Mastra 后端，React 19 双前端，libSQL 存储，AG-UI SSE 流式对话，PDFKit 中文字体导出，GitHub 凭证 AES-256-GCM 加密落库。安全模型上，写工具仅注册给管理端 Agent，猎头端 Agent 在工具注册层面即无法改动任何数据。

快速开始、环境变量与架构说明见上方英文部分。部署实例：[aboutme.davin.wang](https://aboutme.davin.wang)
