# Contributing

Thanks for your interest in improving **career-agent-site**! This project takes the candidate's side of recruiting, and every contribution should strengthen that stance.

## The one invariant

> **The recruiter-facing agent is read-only, always.** Write tools are registered exclusively for the admin (mentor) agent, enforced in `backend/src/tools/index.ts` — not by prompt. PRs that loosen this boundary will be declined.

## Areas that welcome contributions

- **Guardrails** — new attack patterns for `backend/src/guardrails/` (input classification, output redaction)
- **Document ingestion** — parsers beyond PDF/DOCX/code in `tools/knowledge.ts`
- **Repo intelligence** — better distillation of source code into résumé entries (`tools/projects.ts`, `services/github.ts`)
- **Mentorship prompts** — higher-quality coaching flows in `prompts/system.ts`
- **i18n** — new résumé languages and UI strings
- **PDF export** — layout quality in `services/pdf.ts`

## Development setup

```bash
git clone https://github.com/davinwang/career-agent-site.git
cd career-agent-site
cd backend && npm ci && npm run dev            # API :4111
cd ../frontend/recruiter && npm ci && npm run dev  # :5173
cd ../frontend/admin && npm ci && npm run dev      # :5174
```

See [README.md](README.md) for architecture and environment variables.

## Before opening a PR

- `npm run build` passes in all three packages
- No secrets in code or fixtures — test against `*.env.example` shapes
- Keep the recruiter agent read-only (see invariant above)
- One logical change per PR; describe the "why" in the body

## Reporting security issues

Please open a [security advisory](https://github.com/davinwang/career-agent-site/security/advisories/new) rather than a public issue — this project handles résumé PII and GitHub credentials.
