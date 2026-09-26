"""Knowledge base: ingest uploaded docs into data/docs/, build a chunked index.

Index format (index.json):
{
  "files": [
    {"path": "uploads/resume.pdf", "title": "resume.pdf", "added": "...",
     "chunks": [{"id": 0, "text": "..."}]}
  ]
}
Public side searches chunks via keyword scoring (simple, zero-dependency).
"""
import json
import os
import re
import threading
from datetime import datetime

from . import config

_lock = threading.Lock()

CODE_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rs", ".c", ".h",
    ".cpp", ".hpp", ".cs", ".rb", ".php", ".sh", ".sql", ".vue", ".svelte",
}
TEXT_EXTS = {".md", ".txt", ".rst", ".log", ".csv", ".json", ".yaml", ".yml", ".toml", ".ini"}
ALLOWED_EXTS = CODE_EXTS | TEXT_EXTS | {".pdf", ".docx"}
MAX_UPLOAD_MB = 10
CHUNK_CHARS = 1200
CHUNK_OVERLAP = 150


def allowed_file(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTS


def save_upload(filename: str, content: bytes) -> str:
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    safe = re.sub(r"[^\w.\-]+", "_", filename)[-80:]
    dest = os.path.join(config.UPLOAD_DIR, safe)
    base, ext = os.path.splitext(dest)
    i = 1
    while os.path.exists(dest):
        dest = f"{base}_{i}{ext}"
        i += 1
    with open(dest, "wb") as f:
        f.write(content)
    return dest


# ---------- extraction ----------

def _extract_pdf(path: str) -> str:
    from pypdf import PdfReader
    reader = PdfReader(path)
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx(path: str) -> str:
    from docx import Document
    doc = Document(path)
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for t in doc.tables:
        for row in t.rows:
            parts.append(" | ".join(c.text for c in row.cells))
    return "\n".join(parts)


def _extract_code(path: str) -> str:
    """For source files keep structure + key lines, not the whole file."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    keep = []
    for ln in lines:
        s = ln.rstrip()
        if (re.match(r"^\s*(def |class |function |export |import |from |#include|public |private |async |const |let |var |func |package |type |interface )", s)
                or re.search(r"\b(TODO|FIXME)\b", s)):
            keep.append(s)
    if not keep:  # tiny file, keep all
        keep = [l.rstrip() for l in lines]
    text = "\n".join(keep)
    return text[:20000]  # hard cap


def _extract_text(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()[:100000]


def extract_text(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        return _extract_pdf(path)
    if ext == ".docx":
        return _extract_docx(path)
    if ext in CODE_EXTS:
        return _extract_code(path)
    return _extract_text(path)


# ---------- index ----------

def _load_index() -> dict:
    try:
        with open(config.INDEX_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"files": []}


def _save_index(idx: dict) -> None:
    os.makedirs(config.DOCS_DIR, exist_ok=True)
    tmp = config.INDEX_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False)
    os.replace(tmp, config.INDEX_PATH)


def _chunk(text: str) -> list[str]:
    text = re.sub(r"\n{3,}", "\n\n", text.strip())
    if not text:
        return []
    chunks, start = [], 0
    while start < len(text):
        end = min(start + CHUNK_CHARS, len(text))
        if end < len(text):
            cut = text.rfind("\n", start + CHUNK_CHARS - CHUNK_OVERLAP, end)
            if cut > start:
                end = cut
        chunks.append(text[start:end].strip())
        start = end - CHUNK_OVERLAP if end < len(text) else end
        if start < 0:
            start = 0
    return [c for c in chunks if c]


def ingest_file(path: str, title: str | None = None) -> dict:
    """Extract + index one file. Returns summary dict."""
    with _lock:
        text = extract_text(path)
        chunks = _chunk(text)
        rel = os.path.relpath(path, config.DATA_DIR)
        idx = _load_index()
        idx["files"] = [f for f in idx["files"] if f["path"] != rel]  # re-ingest replaces
        idx["files"].append({
            "path": rel,
            "title": title or os.path.basename(path),
            "added": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "chars": len(text),
            "chunks": [{"id": i, "text": c} for i, c in enumerate(chunks)],
        })
        _save_index(idx)
    return {"title": title or os.path.basename(path), "chars": len(text), "chunks": len(chunks)}


def list_files() -> str:
    idx = _load_index()
    if not idx["files"]:
        return "(knowledge base empty - owner has not uploaded anything yet)"
    lines = []
    for f in idx["files"]:
        lines.append(f"- {f['title']} ({f['chars']} chars, {len(f['chunks'])} chunks, added {f['added']})")
    return "\n".join(lines)


def _score(query: str, text: str) -> int:
    q = query.lower()
    t = text.lower()
    return sum(t.count(w) for w in re.findall(r"[\w\u4e00-\u9fff]+", q) if len(w) > 1)


def search(query: str, top_k: int = 6) -> str:
    idx = _load_index()
    scored = []
    for f in idx["files"]:
        for ch in f["chunks"]:
            s = _score(query, ch["text"])
            if s > 0:
                scored.append((s, f["title"], ch["text"]))
    if not scored:
        return "(no matching content found in knowledge base)"
    scored.sort(key=lambda x: -x[0])
    out = []
    for s, title, text in scored[:top_k]:
        out.append(f"[{title}]\n{text[:900]}")
    return "\n\n---\n\n".join(out)


def get_resume() -> str:
    """Full concatenated text of resume-like files for the public side."""
    idx = _load_index()
    parts = []
    for f in idx["files"]:
        tl = f["title"].lower()
        if "resume" in tl or "简历" in f["title"] or "cv" in tl.split(".")[0]:
            parts.append(f"### {f['title']}\n" + "\n".join(c["text"] for c in f["chunks"]))
    if not parts:  # fallback: everything marked as docs
        for f in idx["files"]:
            parts.append(f"### {f['title']}\n" + "\n".join(c["text"] for c in f["chunks"][:5]))
    return "\n\n".join(parts)[:24000] if parts else "(resume not uploaded yet)"


def delete_file(title_sub: str) -> str:
    with _lock:
        idx = _load_index()
        before = len(idx["files"])
        matches = [f for f in idx["files"] if title_sub.lower() in f["title"].lower()]
        idx["files"] = [f for f in idx["files"] if title_sub.lower() not in f["title"].lower()]
        _save_index(idx)
        removed = before - len(idx["files"])
        for f in matches:
            p = os.path.join(config.DATA_DIR, f["path"])
            try:
                os.remove(p)
            except OSError:
                pass
    return f"deleted {removed} file(s) matching '{title_sub}'"


# ---------- resume landing page ----------

RESUME_DATA_NAME = "resume-data.json"


def _resume_page_path(lang: str = "") -> str:
    # inside containers the static dir is bind-mounted read-write for admin
    suffix = "" if lang in ("", "zh", "zh-cn", "zh-CN") else "." + lang.lower()
    return os.environ.get("RESUME_STATIC_DIR", "/static") + "/resume-data" + suffix + ".json"


def normalize_lang(lang: str) -> str:
    """'en-US' -> 'en', 'zh-CN' -> 'zh' (default). Unknown/empty -> 'zh'."""
    l = (lang or "").strip().lower().split("-")[0]
    return l if l and l != "zh" else "zh"


def list_resume_langs() -> list[dict]:
    """Languages that have a published resume page: [{code,label}], default first."""
    base = os.environ.get("RESUME_STATIC_DIR", "/static")
    labels = {"zh": "中文", "en": "English", "ja": "日本語", "fr": "Français",
              "de": "Deutsch", "es": "Español", "ko": "한국어", "ru": "Русский"}
    langs = []
    for f in os.listdir(base):
        m = re.fullmatch(r"resume-data(?:\.([a-z]{2}))?\.json", f)
        if m:
            code = m.group(1) or "zh"
            if code not in langs:
                langs.append(code)
    if "zh" not in langs:
        langs.insert(0, "zh")
    return [{"code": c, "label": labels.get(c, c)} for c in sorted(langs, key=lambda x: (x != "zh", x))]


def write_lang_manifest() -> str:
    dest = os.path.join(os.environ.get("RESUME_STATIC_DIR", "/static"), "resume-langs.json")
    try:
        tmp = dest + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"langs": list_resume_langs()}, f, ensure_ascii=False)
        os.replace(tmp, dest)
        return ", ".join(l["code"] for l in list_resume_langs())
    except OSError as e:
        return f"error writing lang manifest: {e}"


RESUME_BACKUP_KEEP = 20


def _backup_resume_page(dest: str) -> str:
    """Timestamped backup of the current file before overwrite. Returns backup path or ''."""
    import shutil
    try:
        base = os.path.join(os.path.dirname(dest), "backups")
        os.makedirs(base, exist_ok=True)
        stem = os.path.basename(dest).replace(".json", "")
        b = os.path.join(base, f"{stem}.{__import__('datetime').datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
        shutil.copy2(dest, b)
        # prune old backups (keep newest N)
        siblings = sorted(f for f in os.listdir(base) if f.startswith(stem + "."))
        for f in siblings[:-RESUME_BACKUP_KEEP]:
            try:
                os.remove(os.path.join(base, f))
            except OSError:
                pass
        return b
    except OSError:
        return ""


def write_resume_page(data: dict, lang: str = "zh") -> str:
    """Write resume-data[.lang].json consumed by the nginx-served landing page.

    Safety hardening (after a 2026-09-26 incident where an interrupted admin
    session wiped experience/education/projects):
    - MERGE semantics: only keys present (non-empty) in `data` overwrite the
      existing file; omitted sections keep their current content. A full-file
      replacement therefore can no longer silently drop sections.
    - Section-count guard: if a provided section would shrink to fewer items
      than currently live (e.g. 6 experiences -> 0), the write is REJECTED
      unless data["_force"] is explicitly true. This catches partial model
      extraction before it destroys data.
    - Timestamped backups: every successful write first copies the previous
      file to <static>/backups/ (last 20 kept).
    """
    required = ["name"]
    for k in required:
        if not data.get(k):
            return f"error: field '{k}' is required"
    allowed = ["name", "status", "tags", "summary", "experience", "projects", "skills", "education"]
    # per-project link granularity lives inside project dicts; no top-level change needed
    dest = _resume_page_path(lang)

    # start from the current live content (merge base)
    clean: dict = {}
    if os.path.exists(dest):
        try:
            with open(dest, "r", encoding="utf-8") as f:
                clean = json.load(f)
        except (OSError, ValueError):
            clean = {}

    force = bool(data.get("_force"))
    incoming = {k: data[k] for k in allowed if k in data and data[k] not in (None, "", [])}

    # section-shrink guard
    for section in ("experience", "education", "projects"):
        if section in incoming and not force:
            have = len(clean.get(section) or [])
            want = len(incoming[section])
            if want < have:
                return (f"error: refusing to shrink '{section}' from {have} to {want} item(s). "
                        f"If this is intentional, retry with _force=true. "
                        f"Current content is preserved; nothing was written.")
    clean.update(incoming)

    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.exists(dest):
            _backup_resume_page(dest)
        tmp = dest + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(clean, f, ensure_ascii=False, indent=2)
        os.replace(tmp, dest)
    except OSError as e:
        return f"error writing resume page: {e}"
    return (f"resume page [{normalize_lang(lang)}] updated "
            f"({len(json.dumps(clean))} bytes): {', '.join(clean.keys())}")


def read_resume_page(lang: str = "zh") -> str:
    try:
        with open(_resume_page_path(lang), "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return f"(resume page [{normalize_lang(lang)}] not published yet)"
