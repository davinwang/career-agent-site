"""Agent tools. Read tools = both sides; write tools = admin only."""
import os

from pydantic import BaseModel, Field
from agents import function_tool

from . import kb, memory


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
def get_resume_page() -> str:
    """Read the current resume-data.json shown on the public landing page (empty means placeholders are shown)."""
    return kb.read_resume_page()


class ExperienceItem(BaseModel):
    title: str = Field("", description="公司 · 职位")
    meta: str = Field("", description="时间段")
    points: list[str] = Field(default_factory=list, description="亮点列表")


class ProjectItem(BaseModel):
    title: str = Field("", description="项目名称")
    meta: str = Field("", description="技术栈")
    points: list[str] = Field(default_factory=list, description="亮点列表")


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
def update_resume_page(page: ResumePage) -> str:
    """Publish the public landing resume page. Call whenever the resume is uploaded or updated.

    Fill in every field you know from the resume; unknown fields stay as placeholders.
    Provide ALL known fields to do a full refresh.
    """
    d = page.model_dump(exclude_none=True)
    cleaned = {k: v for k, v in d.items() if v not in ("", [], None)}
    return kb.write_resume_page(cleaned)


PUBLIC_TOOLS = [search_knowledge, list_knowledge_files, get_full_resume, recall_facts]
ADMIN_TOOLS = PUBLIC_TOOLS + [remember_fact, forget_fact, delete_knowledge_file,
                              get_resume_page, update_resume_page]
