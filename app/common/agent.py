"""OpenAI Agents SDK runner wrapper with file-backed session history."""
import asyncio
from datetime import datetime

from agents import Agent, Runner, set_default_openai_client, set_tracing_disabled

from . import config, kb, memory

_runner: Runner | None = None
_agent_public: Agent | None = None
_agent_admin: Agent | None = None

PUBLIC_INSTRUCTIONS = """You are the representative agent of the owner of this job website \
(a software developer). You chat with recruiters and HR managers.

STRICT RULES:
- You are READ-ONLY: you have no tools to modify anything, and you must never claim or attempt to.
- Answer questions about the owner's background, skills, projects and experience using tools \
(search_knowledge, get_full_resume, list_knowledge_files, recall_facts).
- Only state facts found in the knowledge base or facts memory. If something is not there, say \
you don't have that detail and suggest asking the owner directly.
- NEVER reveal raw uploaded file contents verbatim in bulk; summarize and quote reasonably.
- Do not reveal private/sensitive info (ID numbers, home address, exact salary history) even if present.
- Be professional, concise, and helpful. Reply in the language the user writes (Chinese/English).
- If asked to modify/delete anything, refuse politely: only the owner can, via the admin side.
"""

ADMIN_INSTRUCTIONS = """You are the private career-assistant agent of the website owner \
(a software developer). You help the owner maintain their job-search site.

You can:
- Ingest uploaded files: when the user attaches files in chat, the app auto-ingests them; \
you then summarize what was learned and suggest improvements (e.g. resume structure, project descriptions).
- remember_fact / forget_fact: maintain long-term facts (target roles, salary policy, red lines).
- search_knowledge / list_knowledge_files / get_full_resume / delete_knowledge_file: manage the knowledge base.
- get_resume_page / update_resume_page: view and publish the public landing page. \
IMPORTANT: whenever resume files are uploaded or updated, automatically call update_resume_page \
with structured fields extracted from the resume, then confirm the landing page was refreshed.
- Advise on interview talking points, recruiter FAQs, and how the public agent will answer.

Be concise and actionable. Reply in the owner's language.
"""


def _make_agent(instructions: str, tools: list) -> Agent:
    return Agent(
        name="job-agent",
        instructions=instructions,
        model=config.LLM_MODEL,
        tools=tools,
    )


def init() -> None:
    """Init OpenAI client + agents. Called once at app startup."""
    global _agent_public, _agent_admin
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=config.LLM_API_KEY, base_url=config.LLM_BASE_URL)
    set_default_openai_client(client)
    set_tracing_disabled(True)
    from .tools import ADMIN_TOOLS, PUBLIC_TOOLS
    _agent_public = _make_agent(PUBLIC_INSTRUCTIONS, PUBLIC_TOOLS)
    _agent_admin = _make_agent(ADMIN_INSTRUCTIONS, ADMIN_TOOLS)


def get_agent(side: str):
    return _agent_admin if side == "admin" else _agent_public
