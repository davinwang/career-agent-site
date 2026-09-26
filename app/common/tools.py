"""Agent tools. Read tools = both sides; write tools = admin only."""
import os

from pydantic import BaseModel, Field
from agents import function_tool

from . import kb, memory, repos, starters


# ---------- shared (read-only) ----------

@function_tool
def search_knowledge(query: str) -> str:
    """Search the owner's knowledge base (resume, project docs, code summaries) for content relevant to the query. Read-only."""
    return kb.search(query)


@function_tool
def list_knowledge_files() -> str:
    """List files in the owner's knowledge base. Read-only."""
    return kb.list_files()


@function_tool
def get_full_resume() -> str:
    """Get the owner's full resume text. Read-only. Use for overview / experience questions."""
    return kb.get_resume()


@function_tool
def recall_facts() -> str:
    """Recall the owner's long-term facts (job preferences, talking points, boundaries). Read-only."""
    return memory.list_facts()


# ---------- admin-only (write) ----------

@function_tool
def remember_fact(fact: str) -> str:
    """Save a durable fact about the owner (job goals, salary policy, red lines) to long-term memory."""
    return memory.add_fact(fact)


@function_tool
def forget_fact(substring: str) -> str:
    """Remove long-term facts containing the given substring."""
    return memory.remove_fact(substring)


@function_tool
def delete_knowledge_file(title_substring: str) -> str:
    """Delete an indexed knowledge-base file whose title contains the substring."""
    return kb.delete_file(title_substring)


@function_tool
def get_resume_page(lang: str = "zh") -> str:
    """Read the currently published landing page data for the given language (default 'zh')."""
    return kb.read_resume_page(lang)


class ExperienceItem(BaseModel):
    title: str = Field("", description="公司 · 职位")
    meta: str = Field("", description="时间段")
    points: list[str] = Field(default_factory=list, description="亮点列表")


class ProjectItem(BaseModel):
    title: str = Field("", description="项目名称")
    meta: str = Field("", description="技术栈")
    points: list[str] = Field(default_factory=list, description="亮点列表")
    demo_link: str = Field("", description="项目展示链接（在线演示/官网）。为空则不显示")
    repo_link: str = Field("", description="源代码链接——仅当项目开源时提供；闭源项目必须留空")
    attachment_link: str = Field("", description="附件链接（文档/报告/截图等），可为空")
    open_source: bool = Field(False, description="项目是否开源。False(闭源)时 repo_link 必须为空")


class ResumePage(BaseModel):
    """Public landing resume page content."""
    name: str = Field("", description="候选人姓名")
    status: str = Field("", description="一句话状态，如: 在职看机会 · 期望后端/全栈 · 上海")
    tags: list[str] = Field(default_factory=list, description="技能标签")
    summary: str = Field("", description="个人简介段落(纯文本)")
    experience: list[ExperienceItem] = Field(default_factory=list, description="工作经历")
    projects: list[ProjectItem] = Field(default_factory=list, description="项目经验")
    skills: list[str] = Field(default_factory=list, description="技能描述行")


@function_tool
def update_resume_page(page: ResumePage, lang: str = "zh") -> str:
    """Publish the public landing resume page in the given language.

    lang: language code, e.g. 'zh' (default), 'en', 'ja'... Each language is stored
    separately; publishing a new language makes it selectable on the site.
    Translate ALL fields fully into the target language (keep company/product names).
    MERGE semantics: only fields you provide are updated; omitted sections KEEP their
    current content. If you include a section (experience/education/projects), you MUST
    include ALL its items - a write that would shrink a section is rejected.
    To add a single item: read_resume_page first, then return every existing item plus
    the new one. Set _force=true ONLY to deliberately delete items (rare).
    """
    d = page.model_dump(exclude_none=True)
    # open/closed-source consistency: repo link only for open-source projects
    for p in d.get("projects", []):
        if not p.get("open_source") and p.get("repo_link"):
            return (f"error: 项目 '{p.get('title','')}' 标记为闭源但提供了 repo_link。"
                    f"闭源项目不得提供源代码链接；如确为开源，请设 open_source=true")
        if p.get("open_source") and not p.get("repo_link") and p.get("title"):
            # tolerated: user may declare open-source but not publish the repo yet
            pass
    cleaned = {k: v for k, v in d.items() if v not in ("", [], None)}
    r = kb.write_resume_page(cleaned, lang)
    if not r.startswith("error"):
        r += " | langs: " + kb.write_lang_manifest()
    return r


@function_tool
def list_resume_langs() -> str:
    """List the languages currently published on the public landing page. Read-only."""
    langs = kb.list_resume_langs()
    return ", ".join(f"{l['code']}({l['label']})" for l in langs)


PUBLIC_TOOLS = [search_knowledge, list_knowledge_files, get_full_resume, recall_facts]
# ---------- admin: project repo ingestion ----------

@function_tool
def add_github_repo(url: str, name: str = "") -> str:
    """Clone a git repository (GitHub or any git URL) and build the project understanding doc.

    Shallow-clones into /data/repos/<name>/src, generates CLAUDE.md + AGENT.md
    (project scale, language stats, directory tree, key files like README/package manifests),
    and indexes them into the knowledge base so the public agent can answer project questions.
    """
    r = repos.clone_repo(url, name or None)
    if "error" in r:
        return f"error: {r['error']}"
    doc = repos.generate_doc(r["name"])
    if doc.startswith("error"):
        return doc
    info = repos.ingest_repo_doc(r["name"])
    return (
        f"仓库已克隆并生成理解文档: {r['name']}\n"
        f"- CLAUDE.md: {len(doc)} chars\n"
        f"- 已入知识库: {info.get('chunks', '?')} chunks\n"
        "建议：让我阅读源码后用 update_project_doc 补充“架构与亮点”部分。"
    )


@function_tool
def ingest_local_zip(project_name: str) -> str:
    """Ingest an already-uploaded zip into a project (the app auto-saves zips as uploads/<file>.zip)."""
    import os
    from . import config
    # find the most recent zip in uploads matching the name
    cands = [f for f in os.listdir(config.UPLOAD_DIR) if f.lower().endswith(".zip")]
    if not cands:
        return "error: uploads 目录中没有 zip 文件"
    path = os.path.join(config.UPLOAD_DIR, sorted(cands)[-1])
    r = repos.extract_zip(path, project_name or None)
    if "error" in r:
        return f"error: {r['error']}"
    doc = repos.generate_doc(r["name"])
    if doc.startswith("error"):
        return doc
    info = repos.ingest_repo_doc(r["name"])
    return f"zip 已解压并生成理解文档: {r['name']} ({info.get('chunks', '?')} chunks 入库)"


@function_tool
def list_projects() -> str:
    """List ingested project repos (name, file count, whether CLAUDE.md exists)."""
    ps = repos.list_projects()
    if not ps:
        return "(no projects ingested yet)"
    return "\n".join(
        f"- {p['name']}: {p['files']} files, CLAUDE.md {'✓' if p['has_doc'] else '✗'}"
        for p in ps
    )


@function_tool
def get_project_doc(name: str) -> str:
    """Read a project's CLAUDE.md understanding doc. Read-only."""
    return repos.read_doc(name)


@function_tool
def update_project_doc(name: str, section: str, content: str) -> str:
    """Update/replace a '## <section>' body in a project's CLAUDE.md (e.g. section='架构与亮点')
    after analyzing the source code, then re-index it for the public agent."""
    return repos.update_doc_section(name, section, content)


class StarterItem(BaseModel):
    label: str = Field("", description="按钮上显示的短问题(≤30字)")
    message: str = Field("", description="点击后实际发送的完整问题")
    icon: str = Field("💬", description="emoji 图标")


class StarterSet(BaseModel):
    questions: list[StarterItem] = Field(default_factory=list, description="4-6个预制问题")


@function_tool
def save_starters(questions: StarterSet, lang: str = "zh") -> str:
    """Save the pre-made recruiter questions shown under the public chat welcome message.

    lang: language of the questions, e.g. 'zh' (default), 'en', 'ja'... — questions
    should be written IN that language so recruiters browsing in it see native text.
    Generate 4-6 questions a recruiter would realistically ask THIS owner based on their
    resume (core stack, standout projects, management experience, job preferences...).
    Call after update_resume_page whenever the resume changes materially.
    """
    return starters.save([q.model_dump(exclude_none=True) for q in questions.questions], lang)


@function_tool
def get_starters() -> str:
    """Read the currently saved recruiter starter questions."""
    return starters.list_for_admin()


# ---------- admin write tools (routed through the owner MCP server, JWT-authenticated) ----------

def _mcp_tool(name: str, description: str, args_model: type[BaseModel]):
    """Wrap a remote MCP tool as an openai-agents function_tool.
    Uses a generic string-args signature; the args_model documents the parameters
    for the LLM via the description, and validation/deserialization happens here."""
    from . import mcpclient

    @function_tool(name_override=name, description_override=description + "\nParameters JSON keys: "
                   + ", ".join(args_model.model_fields.keys()))
    async def _call(args_json: str) -> str:
        """JSON object of the tool arguments."""
        import json
        try:
            raw = json.loads(args_json) if args_json.strip() else {}
        except json.JSONDecodeError as e:
            return f"error: args_json invalid: {e}"
        try:
            args = args_model(**raw)
        except Exception as e:
            return f"error: invalid arguments: {e}"
        payload = {k: v for k, v in args.model_dump().items() if v not in (None,)}
        if hasattr(args_model, "model_fields") and name != "save_starters":
            payload = {k: v for k, v in payload.items() if v != ""}
        return await mcpclient.call_tool(name, payload)

    return _call


class _UpdateResumePageArgs(BaseModel):
    name: str = Field(description="候选人姓名")
    lang: str = Field("zh", description="语言代码: zh(default)/en/ja...")
    status: str = Field("", description="一句话状态")
    tags: str = Field("", description="comma-separated tags")
    summary: str = Field("", description="个人简介段落")
    experience_json: str = Field("", description='JSON array of {title, meta, points:[...]}')
    projects_json: str = Field("", description='JSON array of {title, meta, points:[...]}')
    skills_json: str = Field("", description="JSON array of strings")


class _SaveStartersArgs(BaseModel):
    questions_json: str = Field(description='JSON array of {label, message, icon?} in the given language')
    lang: str = Field("zh", description="语言代码: zh(default)/en...")


class _RememberFactArgs(BaseModel):
    fact: str = Field(description="durable fact to remember")


class _ForgetFactArgs(BaseModel):
    substring: str = Field(description="remove facts containing this substring")


class _ListFactsArgs(BaseModel):
    pass


class _DeleteKnowledgeArgs(BaseModel):
    title_substring: str = Field(description="delete indexed files whose title contains this")


class _AddGithubRepoArgs(BaseModel):
    url: str = Field(description="git repository URL")
    name: str = Field("", description="optional project name")


class _IngestZipArgs(BaseModel):
    project_name: str = Field("", description="optional project name")


class _UpdateProjectDocArgs(BaseModel):
    name: str = Field(description="project name")
    section: str = Field(description="section heading without '##'")
    content: str = Field(description="new section body")


class _GetResumePageArgs(BaseModel):
    lang: str = Field("zh", description="语言代码, default zh")


class _GetStartersArgs(BaseModel):
    pass


class _GetProjectDocArgs(BaseModel):
    name: str = Field(description="project name")


class _SetAvatarArgs(BaseModel):
    image_b64: str = Field(description="base64 of the full image file (jpg/png/webp), no data: prefix")


class _GetAvatarArgs(BaseModel):
    pass


ADMIN_MCP_TOOLS = [
    _mcp_tool("update_resume_page",
              "Publish the public landing resume page in the given language (goes through the owner MCP server). "
              "Translate ALL fields fully into `lang`; keep company/product names.",
              _UpdateResumePageArgs),
    _mcp_tool("save_starters",
              "Save the pre-made recruiter questions for a language (goes through the owner MCP server). "
              "Questions must be written IN `lang`. Call after update_resume_page.",
              _SaveStartersArgs),
    _mcp_tool("get_resume_page", "Read the published landing page data for a language (default zh).", _GetResumePageArgs),
    _mcp_tool("get_starters", "Read saved recruiter starter questions, per language.", _GetStartersArgs),
    _mcp_tool("list_facts", "List owner's long-term facts.", _ListFactsArgs),
    _mcp_tool("add_fact", "Save a durable fact about the owner (job goals, salary policy, red lines). Agent-facing name: remember_fact.", _RememberFactArgs),
    _mcp_tool("delete_fact", "Remove long-term facts containing the substring. Agent-facing name: forget_fact.", _ForgetFactArgs),
    _mcp_tool("delete_knowledge", "Delete indexed knowledge-base files whose title contains the substring.", _DeleteKnowledgeArgs),
    _mcp_tool("add_github_repo",
              "Clone a git repository, generate CLAUDE.md/AGENT.md understanding docs and index them.",
              _AddGithubRepoArgs),
    _mcp_tool("ingest_local_zip", "Ingest an already-uploaded zip into a project.", _IngestZipArgs),
    _mcp_tool("list_projects", "List ingested project repos.", _GetStartersArgs),  # no required args
    _mcp_tool("get_project_doc", "Read a project's CLAUDE.md understanding doc.", _GetProjectDocArgs),
    _mcp_tool("update_project_doc",
              "Update/replace a '## <section>' body in a project's CLAUDE.md, then re-index it.",
              _UpdateProjectDocArgs),
    _mcp_tool("set_avatar",
              "Upload the owner's profile photo (形象照). `image_b64` = base64 of the FULL image file "
              "(jpg/png/webp, no data: prefix). Chainlit uploads arrive as cl.Message elements — "
              "read the file bytes and base64-encode them, then call this tool. Never claim the "
              "photo was saved without this tool succeeding.",
              _SetAvatarArgs),
    _mcp_tool("get_avatar", "Check whether a profile photo exists.", _GetAvatarArgs),
]

ADMIN_TOOLS = PUBLIC_TOOLS + ADMIN_MCP_TOOLS
