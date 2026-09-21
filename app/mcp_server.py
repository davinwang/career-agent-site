"""MCP server for the owner: manage resume/knowledge/projects/recruiter-threads via any MCP client.

Mount: aboutme.davin.wang/mcp  (nginx -> jas-admin:8000 -> streamable HTTP MCP app)
Auth:  Bearer JWT (HS256). Claims: sub (user), exp. Secret: MCP_JWT_SECRET env.
Tools (all admin-level, operate on the same /data knowledge base):
  - upload_document(name_b64|text, title)     ingest text/base64 docs
  - generate_resume_page()                    LLM-free: re-publish from indexed resume is owner's
                                              agent job, so this returns current page + guidance
  - get_resume_page / update_resume_page      read & publish structured landing page
  - list_knowledge / search_knowledge / delete_knowledge
  - add_github_repo(url, name) / list_projects / get_project_doc
  - list_recruiter_threads()                  all visitor sessions (thread list)
  - get_recruiter_thread(thread_id)           full transcript of one session
Run as SIDE=mcp in its own container sharing /data.
"""
import base64
import os
from typing import Optional

import jwt
from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

from common import avatar, kb, memory, repos, starters

MCP_JWT_SECRET = os.environ.get("MCP_JWT_SECRET", "")
if not MCP_JWT_SECRET:
    raise SystemExit("MCP_JWT_SECRET is required for the MCP server")

from mcp.server.transport_security import TransportSecuritySettings

mcp = FastMCP(
    "job-agent-owner-mcp",
    stateless_http=True,
    # JWT auth is enforced by our middleware; behind trusted reverse proxy, so
    # disable host/origin rebinding checks (Host varies: aboutme.davin.wang, internal IPs).
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


class AuthError(Exception):
    pass


def _check_auth(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise AuthError("missing Bearer token")
    token = auth[7:].strip()
    try:
        payload = jwt.decode(token, MCP_JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise AuthError("token expired")
    except jwt.InvalidTokenError as e:
        raise AuthError(f"invalid token: {e}")
    if payload.get("role") not in (None, "owner"):
        raise AuthError("insufficient role")
    return payload.get("sub", "owner")


@mcp.custom_route("/healthz", methods=["GET"])
async def healthz(request: Request):
    return JSONResponse({"ok": True})


@mcp.custom_route("/token", methods=["POST"])
async def issue_token(request: Request):
    """Password -> JWT exchange for the admin side. Body: {username, password}.
    Same credentials as the chainlit admin login (ADMIN_USER/ADMIN_PASSWORD env)."""
    import time
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid json"}, status_code=400)
    if body.get("username") != os.environ.get("ADMIN_USER", "owner") or \
            body.get("password", "") != os.environ.get("ADMIN_PASSWORD", ""):
        return JSONResponse({"error": "invalid credentials"}, status_code=401)
    now = int(time.time())
    token = jwt.encode(
        {"sub": body["username"], "role": "owner", "iat": now, "exp": now + 3600},
        MCP_JWT_SECRET, algorithm="HS256",
    )
    return JSONResponse({"token": token, "expiresIn": 3600})


@mcp.custom_route("/resume-pdf", methods=["GET"])
async def resume_pdf(request: Request):
    """Public: generate a resume PDF from the published landing-page data.
    /resume-pdf?lang=en (default zh). No auth — data is the same public page content."""
    from fastapi.responses import Response  # starlette Response via fastapi pkg is fine
    from urllib.parse import quote
    lang = request.query_params.get("lang", "zh").strip().lower() or "zh"
    from common.kb import normalize_lang
    lang = normalize_lang(lang)
    from common import resumepdf
    pdf, err = resumepdf.generate(lang)
    if err:
        return JSONResponse({"error": err}, status_code=404)
    import json as _json
    try:
        name = _json.loads(resumepdf.kb.read_resume_page(lang)).get("name", "resume")
    except Exception:
        name = "resume"
    ascii_name = name.encode("ascii", "ignore").decode().strip() or "resume"
    filename = f"{ascii_name}-resume" + (f"-{lang}" if lang != "zh" else "") + ".pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=\"{filename}\"; filename*=UTF-8''{quote(name)}-resume{'' if lang == 'zh' else '-' + lang}.pdf",
            "Cache-Control": "no-cache",
        },
    )


@mcp.custom_route("/thread-api/latest", methods=["GET"])
async def latest_thread(request: Request):
    """Public-safe helper for the resume page: returns this browser's latest
    thread id (scoped by the jas_vuid cookie) so the iframe can resume it."""
    cookie = request.headers.get("cookie", "") or ""
    vuid = None
    for part in cookie.split(";"):
        k, _, v = part.strip().partition("=")
        if k == "jas_vuid" and v:
            vuid = v.strip()
            break
    if not vuid:
        return JSONResponse({"threadId": None})
    from common.threadstore import _db
    conn = _db()
    row = conn.execute(
        "SELECT id FROM threads WHERE user_identifier=? ORDER BY createdAt DESC LIMIT 1",
        (f"visitor-{vuid}",),
    ).fetchone()
    conn.close()
    return JSONResponse({"threadId": row[0] if row else None})


class JWTAuthMiddleware:
    """ASGI middleware: enforce Bearer JWT on the MCP protocol path."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].rstrip("/").endswith("/mcp"):
            request = Request(scope, receive)
            try:
                _check_auth(request)
            except AuthError as e:
                resp = JSONResponse({"error": str(e)}, status_code=401)
                await resp(scope, receive, send)
                return
        await self.app(scope, receive, send)


# ---------- knowledge / documents ----------

@mcp.tool()
def upload_document(title: str, text: str = "", content_b64: str = "") -> str:
    """Ingest a document into the knowledge base. Provide either plain `text`
    (markdown/txt/code) or `content_b64` (base64 of .pdf/.docx/any allowed file).
    The raw file is backed up under data/docs/uploads and never deleted."""
    os.makedirs(kb.config.UPLOAD_DIR, exist_ok=True)
    if content_b64:
        raw = base64.b64decode(content_b64)
        import re
        safe = re.sub(r"[^\w.\-]+", "_", title)[-80:]
        dest = os.path.join(kb.config.UPLOAD_DIR, safe)
        with open(dest, "wb") as f:
            f.write(raw)
        info = kb.ingest_file(dest, title=title)
        return f"ingested (binary): {info}"
    if not text.strip():
        return "error: provide text or content_b64"
    import re, tempfile
    ext = os.path.splitext(title)[1].lower() or ".md"
    if ext not in kb.ALLOWED_EXTS:
        ext = ".md"
    safe = re.sub(r"[^\w.\-]+", "_", os.path.splitext(title)[0])[-70:] + ext
    dest = os.path.join(kb.config.UPLOAD_DIR, safe)
    with open(dest, "w", encoding="utf-8") as f:
        f.write(text)
    info = kb.ingest_file(dest, title=title)
    return f"ingested: {info}"


@mcp.tool()
def list_knowledge() -> str:
    """List all indexed knowledge-base files."""
    return kb.list_files()


@mcp.tool()
def search_knowledge(query: str) -> str:
    """Search the knowledge base (resume, project docs, code summaries)."""
    return kb.search(query)


@mcp.tool()
def delete_knowledge(title_substring: str) -> str:
    """Delete indexed files whose title contains the substring (raw backups of
    documents are kept where possible; resume files are also removed from index)."""
    return kb.delete_file(title_substring)


# ---------- public landing resume page ----------

@mcp.tool()
def get_resume_page(lang: str = "zh") -> str:
    """Read the current public landing page data for a language (default 'zh')."""
    return kb.read_resume_page(lang)


@mcp.tool()
def list_resume_langs() -> str:
    """List languages currently published on the public landing page."""
    return ", ".join(f"{l['code']}({l['label']})" for l in kb.list_resume_langs())


@mcp.tool()
def update_resume_page(
    name: str,
    lang: str = "zh",
    status: str = "",
    tags: str = "",
    summary: str = "",
    experience_json: str = "",
    projects_json: str = "",
    skills_json: str = "",
) -> str:
    """Publish the public landing resume page in the given language (zh default, en, ja...).
    Translate ALL fields into `lang`. tags: comma-separated; experience_json/projects_json:
    JSON arrays of {title, meta, points:[...]}; projects items may include an optional
    "link": "https://..." field (shown as a Visit badge on the landing page and a clickable
    URL in the PDF — only add when the URL is publicly reachable); skills_json: JSON array of strings."""
    import json
    data = {"name": name}
    if status:
        data["status"] = status
    if tags:
        data["tags"] = [t.strip() for t in tags.split(",") if t.strip()]
    if summary:
        data["summary"] = summary
    for key, arg in (("experience", experience_json), ("projects", projects_json), ("skills", skills_json)):
        if arg:
            try:
                data[key] = json.loads(arg)
            except json.JSONDecodeError as e:
                return f"error: {key}_json invalid: {e}"
    r = kb.write_resume_page(data, lang)
    if not r.startswith("error"):
        r += " | langs: " + kb.write_lang_manifest()
    return r


# ---------- projects ----------

@mcp.tool()
def add_github_repo(url: str, name: str = "") -> str:
    """Shallow-clone a git repo, generate CLAUDE.md/AGENT.md understanding docs and index them."""
    r = repos.clone_repo(url, name or None)
    if "error" in r:
        return f"error: {r['error']}"
    doc = repos.generate_doc(r["name"])
    if doc.startswith("error"):
        return doc
    info = repos.ingest_repo_doc(r["name"])
    return f"repo {r['name']} cloned; doc {len(doc)} chars; indexed {info.get('chunks', '?')} chunks"


@mcp.tool()
def list_projects() -> str:
    """List ingested project repos."""
    ps = repos.list_projects()
    if not ps:
        return "(no projects)"
    return "\n".join(f"- {p['name']}: {p['files']} files, doc={'yes' if p['has_doc'] else 'no'}" for p in ps)


@mcp.tool()
def get_project_doc(name: str) -> str:
    """Read a project's CLAUDE.md understanding doc."""
    return repos.read_doc(name)


# ---------- recruiter threads ----------

def _thread_db():
    from common.threadstore import _db
    return _db()


@mcp.tool()
def list_recruiter_threads(limit: int = 50) -> str:
    """List all recruiter/visitor chat threads (newest first)."""
    conn = _thread_db()
    conn.row_factory = None
    rows = conn.execute(
        "SELECT id, createdAt, name, user_identifier FROM threads ORDER BY createdAt DESC LIMIT ?",
        (max(1, min(int(limit), 200)),),
    ).fetchall()
    conn.close()
    if not rows:
        return "(no threads)"
    return "\n".join(f"- {r[0]} | {r[1]} | {r[2]} | {r[3] or 'unknown'}" for r in rows)


@mcp.tool()
def get_recruiter_thread(thread_id: str) -> str:
    """Get the full transcript of a recruiter thread."""
    conn = _thread_db()
    t = conn.execute("SELECT * FROM threads WHERE id=?", (thread_id,)).fetchone()
    if not t:
        conn.close()
        return f"(thread {thread_id} not found)"
    import json
    steps = conn.execute(
        "SELECT type, name, output, createdAt FROM steps WHERE thread_id=? ORDER BY createdAt ASC",
        (thread_id,),
    ).fetchall()
    conn.close()
    lines = [f"# thread {thread_id}"]
    for s in steps:
        out = s[2]
        try:
            out = json.loads(out) if out else out
        except Exception:
            pass
        text = str(out) if out is not None else ""
        lines.append(f"[{s[0]}:{s[1]} {s[3]}]\n{text[:2000]}")
    return "\n\n".join(lines)[:30000]


# ---------- avatar ----------

@mcp.tool()
def set_avatar(image_b64: str) -> str:
    """Upload the owner's profile photo (base64 of jpg/png/webp).
    Auto-crops to a square with the face centered; used on the resume page
    and as the chat avatar."""
    r = avatar.make_avatar(base64.b64decode(image_b64))
    if "error" in r:
        return f"error: {r['error']}"
    return f"avatar saved: face_detected={r['face_detected']}, static_synced={r['static_synced']}"


@mcp.tool()
def get_avatar() -> str:
    """Check whether a profile photo exists."""
    return "avatar exists" if avatar.has_avatar() else "(no avatar uploaded yet)"


# ---------- starters / facts ----------

@mcp.tool()
def get_starters() -> str:
    """Read current recruiter starter questions."""
    return starters.list_for_admin()


@mcp.tool()
def save_starters(questions_json: str, lang: str = "zh") -> str:
    """Save recruiter starter questions for a language (zh default, en...).
    questions_json: JSON array of {label, message, icon?} written IN that language."""
    import json
    try:
        qs = json.loads(questions_json)
    except json.JSONDecodeError as e:
        return f"error: invalid JSON: {e}"
    return starters.save(qs, lang)


@mcp.tool()
def list_facts() -> str:
    """List owner's long-term facts."""
    return memory.list_facts()


@mcp.tool()
def add_fact(fact: str) -> str:
    """Add a long-term fact."""
    return memory.add_fact(fact)


@mcp.tool()
def delete_fact(substring: str) -> str:
    """Remove long-term facts containing the substring."""
    return memory.remove_fact(substring)


def create_app():
    app = mcp.streamable_http_app()
    return JWTAuthMiddleware(app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
