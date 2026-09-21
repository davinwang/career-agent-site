"""Project repo ingestion: git clone / zip upload / folder -> structured understanding docs.

Understanding doc convention (like Claude Code's CLAUDE.md / OpenCode's AGENT.md):
  /data/repos/<name>/CLAUDE.md   — project overview for the agent (generated, editable by owner)
  /data/repos/<name>/AGENT.md    — short alias summary (generated from CLAUDE.md)

Raw sources are NEVER deleted: clones live in /data/repos/<name>/src, zips in /data/repos/<name>/.
All understanding docs are indexed into the knowledge base so the public agent can cite them.
"""
import json
import os
import re
import shutil
import subprocess
import threading
import zipfile
from datetime import datetime

from . import config, kb

_lock = threading.Lock()

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", "target", ".idea", ".vscode", "vendor", ".mvn", "gradle",
}
TEXT_EXT_ANALYZE = {".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rs", ".c", ".h",
                    ".cpp", ".hpp", ".cs", ".rb", ".php", ".sh", ".sql", ".vue", ".svelte",
                    ".md", ".txt", ".yaml", ".yml", ".toml", ".json"}
KEY_FILES = ["README.md", "readme.md", "README", "README.txt", "CLAUDE.md", "AGENT.md",
             "pyproject.toml", "requirements.txt", "package.json", "go.mod", "pom.xml",
             "Cargo.toml", "Dockerfile", "docker-compose.yml", "Makefile", ".env.example"]
MAX_FILE_READ = 60000
MAX_TREE_ENTRIES = 400


def repos_root() -> str:
    return os.path.join(config.DATA_DIR, "repos")


def _safe_name(name: str) -> str:
    n = re.sub(r"[^\w.\-]+", "_", (name or "project").strip())[:60].strip("._")
    return n or "project"


def list_projects() -> list[dict]:
    root = repos_root()
    if not os.path.isdir(root):
        return []
    out = []
    for name in sorted(os.listdir(root)):
        p = os.path.join(root, name)
        if not os.path.isdir(p):
            continue
        doc = os.path.join(p, "CLAUDE.md")
        has_doc = os.path.exists(doc)
        src = os.path.join(p, "src")
        nfiles = 0
        if os.path.isdir(src):
            for cur, dirs, files in os.walk(src):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                nfiles += len(files)
                if nfiles > 20000:
                    break
        out.append({"name": name, "has_doc": has_doc, "files": nfiles})
    return out


def clone_repo(url: str, name: str | None = None) -> dict:
    """Shallow-clone a git repo (github or any git URL) into /data/repos/<name>/src."""
    name = _safe_name(name or os.path.basename(url.rstrip("/").removesuffix(".git")))
    dest = os.path.join(repos_root(), name)
    src = os.path.join(dest, "src")
    if os.path.isdir(src):
        shutil.rmtree(src)
    os.makedirs(dest, exist_ok=True)
    r = subprocess.run(
        ["git", "clone", "--depth", "1", url, src],
        capture_output=True, text=True, timeout=300,
    )
    if r.returncode != 0:
        return {"error": f"git clone failed: {r.stderr.strip()[:300]}"}
    return {"name": name, "src": src, "url": url}


def extract_zip(zip_path: str, name: str | None = None) -> dict:
    """Extract an uploaded zip (e.g. exported repo) into /data/repos/<name>/src."""
    name = _safe_name(name or os.path.splitext(os.path.basename(zip_path))[0])
    dest = os.path.join(repos_root(), name)
    src = os.path.join(dest, "src")
    if os.path.isdir(src):
        shutil.rmtree(src)
    os.makedirs(dest, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path) as z:
            # strip a single top-level folder if present (github zip style)
            members = z.namelist()
            top = {m.split("/")[0] for m in members if m.strip("/")}
            prefix = ""
            if len(top) == 1:
                prefix = list(top)[0] + "/"
            for m in members:
                if m.startswith("__MACOSX"):
                    continue
                rel = m[len(prefix):] if prefix and m.startswith(prefix) else m
                if not rel or rel.endswith("/"):
                    continue
                if any(part in SKIP_DIRS for part in rel.split("/")):
                    continue
                target = os.path.join(src, rel)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with z.open(m) as fsrc, open(target, "wb") as fdst:
                    shutil.copyfileobj(fsrc, fdst)
    except zipfile.BadZipFile as e:
        return {"error": f"bad zip: {e}"}
    return {"name": name, "src": src}


def _tree_stats(src: str) -> tuple[list[str], dict, int, int]:
    """Walk src -> (tree lines, lang stats, n_files, total_bytes)."""
    tree, stats = [], {}
    n, total = 0, 0
    for cur, dirs, files in os.walk(src):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        rel_dir = os.path.relpath(cur, src)
        for f in sorted(files):
            if n >= MAX_TREE_ENTRIES * 3:
                return tree, stats, n, total
            ext = os.path.splitext(f)[1].lower()
            p = os.path.join(cur, f)
            try:
                sz = os.path.getsize(p)
            except OSError:
                continue
            n += 1
            total += sz
            if ext in TEXT_EXT_ANALYZE and sz < 500_000:
                stats[ext] = stats.get(ext, [0, 0])
                stats[ext][0] += 1
                stats[ext][1] += sz
            rel = os.path.relpath(p, src)
            if len(tree) < MAX_TREE_ENTRIES:
                tree.append(rel + ("/" if os.path.isdir(p) else ""))
    return tree, stats, n, total


def _read_key_files(src: str) -> dict[str, str]:
    found = {}
    for cur, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f in KEY_FILES:
                p = os.path.join(cur, f)
                rel = os.path.relpath(p, src)
                try:
                    with open(p, "r", encoding="utf-8", errors="replace") as fh:
                        found[rel] = fh.read(MAX_FILE_READ)
                except OSError:
                    pass
    return found


LANG_LABEL = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript/React",
    ".jsx": "JavaScript/React", ".java": "Java", ".go": "Go", ".rs": "Rust", ".c": "C",
    ".h": "C/C++ header", ".cpp": "C++", ".cs": "C#", ".rb": "Ruby", ".php": "PHP",
    ".sh": "Shell", ".sql": "SQL", ".vue": "Vue", ".svelte": "Svelte",
}


def generate_doc(name: str) -> str:
    """Generate CLAUDE.md (+AGENT.md) under /data/repos/<name>/ from repo analysis."""
    base = os.path.join(repos_root(), name)
    src = os.path.join(base, "src")
    if not os.path.isdir(src):
        return f"error: repo '{name}' has no src directory (clone or extract first)"

    tree, stats, n_files, total_bytes = _tree_stats(src)
    key_files = _read_key_files(src)

    lines = [f"# {name} — 项目理解文档 (CLAUDE.md)", ""]
    lines.append(f"> 自动生成于 {datetime.now().strftime('%Y-%m-%d %H:%M')}，供 Agent 回答猎头/HR 的项目问题使用。")
    lines.append("")

    # scale
    lines.append("## 项目规模")
    lines.append(f"- 文件数: {n_files}, 总大小: {total_bytes // 1024} KB")
    lang_lines = []
    for ext, (cnt, sz) in sorted(stats.items(), key=lambda kv: -kv[1][1])[:12]:
        label = LANG_LABEL.get(ext, ext)
        lang_lines.append(f"  - {label} ({ext}): {cnt} 个文件, {sz // 1024} KB")
    if lang_lines:
        lines.append("- 语言/类型分布:")
        lines.extend(lang_lines)
    lines.append("")

    # structure
    lines.append("## 目录结构 (节选)")
    lines.append("```")
    lines.extend(tree[:MAX_TREE_ENTRIES])
    lines.append("```")
    lines.append("")

    # key files content (trimmed)
    lines.append("## 关键文件摘录")
    for rel, content in key_files.items():
        lines.append(f"### {rel}")
        lines.append("```")
        text = content[:6000]
        lines.append(text)
        if len(content) > 6000:
            lines.append("...(truncated)")
        lines.append("```")
    lines.append("")

    # section for owner/agent to enrich
    lines.append("## 架构与亮点 (由管理端 Agent 分析补充)")
    lines.append("<!-- 管理端可让 agent 阅读源码后在此补充: 核心架构决策、技术难点、业务价值、个人贡献 -->")
    lines.append("")

    doc = "\n".join(lines)

    with open(os.path.join(base, "CLAUDE.md"), "w", encoding="utf-8") as f:
        f.write(doc)

    # AGENT.md short alias
    alias = [f"# {name} (AGENT.md)",
             "",
             f"项目规模: {n_files} files / {total_bytes // 1024} KB。",
             "详细分析见同目录 CLAUDE.md；原始源码在 src/。",
             ""]
    with open(os.path.join(base, "AGENT.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(alias))
    return doc


def ingest_repo_doc(name: str) -> dict:
    """Index the repo's CLAUDE.md (+ key files) into the knowledge base."""
    base = os.path.join(repos_root(), name)
    doc_path = os.path.join(base, "CLAUDE.md")
    if not os.path.exists(doc_path):
        return {"error": f"no CLAUDE.md in {name} — run generate first"}
    info = kb.ingest_file(doc_path, title=f"项目文档: {name}")
    # also index README if present
    for cur, dirs, files in os.walk(os.path.join(base, "src")):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.lower() in ("readme.md", "readme"):
                rp = os.path.join(cur, f)
                try:
                    info2 = kb.ingest_file(rp, title=f"项目README: {name}")
                    info["chunks"] += info2.get("chunks", 0)
                except Exception:
                    pass
                break
        break
    return info


def read_doc(name: str) -> str:
    p = os.path.join(repos_root(), _safe_name(name), "CLAUDE.md")
    try:
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return f"(project '{name}' has no CLAUDE.md yet)"


def update_doc_section(name: str, section: str, content: str) -> str:
    """Owner-driven enrichment: replace a '## <section>' body in CLAUDE.md."""
    base = os.path.join(repos_root(), _safe_name(name))
    p = os.path.join(base, "CLAUDE.md")
    if not os.path.exists(p):
        return f"error: no CLAUDE.md in {name}"
    with open(p, "r", encoding="utf-8") as f:
        doc = f.read()
    pattern = re.compile(rf"(##\s*{re.escape(section)}\s*\n)(.*?)(?=\n##\s|\Z)", re.S)
    if pattern.search(doc):
        doc = pattern.sub(lambda m: m.group(1) + content + "\n\n", doc)
    else:
        doc += f"\n## {section}\n{content}\n"
    with open(p, "w", encoding="utf-8") as f:
        f.write(doc)
    # re-index after edit
    ingest_repo_doc(_safe_name(name))
    return f"CLAUDE.md section '{section}' updated & re-indexed"
