"""Pre-made recruiter questions ("starters") shown under the public chat welcome.

Generated on the admin side from the resume/knowledge base, stored in
/data/memory/starters.json. Public side reads them via @cl.set_starters.
"""
import json
import os
import re
import threading
from datetime import datetime

from . import config

_lock = threading.Lock()
MAX_QUESTIONS = 6
DEFAULTS = {
    "zh": [
        {"label": "候选人的核心技能栈？", "message": "候选人的核心技能栈是什么？"},
        {"label": "最亮眼的项目经历？", "message": "介绍一下候选人最亮眼的项目经历和技术亮点"},
        {"label": "团队管理经验？", "message": "候选人的团队管理和梯队建设经验如何？"},
        {"label": "求职意向与到岗时间", "message": "候选人的求职意向、期望城市薪资和到岗时间？"},
    ],
    "en": [
        {"label": "Core tech stack?", "message": "What is the candidate's core technology stack?"},
        {"label": "Most impressive projects?", "message": "Introduce the candidate's most impressive projects and technical highlights"},
        {"label": "Team management?", "message": "How is the candidate's team management and mentoring experience?"},
        {"label": "Job preferences & availability", "message": "What are the candidate's job preferences, target city/salary, and availability?"},
    ],
}
DEFAULT_LANG = "zh"


def _path(lang: str = DEFAULT_LANG) -> str:
    code = (lang or DEFAULT_LANG).strip().lower().split("-")[0]
    if code == DEFAULT_LANG:
        return os.path.join(config.MEMORY_DIR, "starters.json")
    return os.path.join(config.MEMORY_DIR, f"starters.{code}.json")


def list_langs() -> list[str]:
    """Languages that have saved starters (or defaults): ['zh', 'en', ...]."""
    codes = set()
    try:
        for f in os.listdir(config.MEMORY_DIR):
            m = re.fullmatch(r"starters(?:\.([a-z]{2}))?\.json", f)
            if m:
                codes.add(m.group(1) or DEFAULT_LANG)
    except OSError:
        pass
    codes.add(DEFAULT_LANG)
    return sorted(codes, key=lambda c: (c != DEFAULT_LANG, c))


def load(lang: str = DEFAULT_LANG) -> list[dict]:
    try:
        with open(_path(lang), "r", encoding="utf-8") as f:
            data = json.load(f)
        return [q for q in data.get("questions", []) if q.get("label") and q.get("message")]
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save(questions: list[dict], lang: str = DEFAULT_LANG) -> str:
    """questions: [{label, message, icon?}] — replaces the whole set for the given lang."""
    clean = []
    for q in questions[:MAX_QUESTIONS]:
        label = str(q.get("label", "")).strip()[:60]
        message = str(q.get("message", "")).strip()[:300]
        icon = str(q.get("icon", "💬")).strip()[:4]
        if label and message:
            clean.append({"label": label, "message": message, "icon": icon})
    if not clean:
        return "error: no valid questions (need label+message)"
    os.makedirs(config.MEMORY_DIR, exist_ok=True)
    with _lock:
        tmp = _path(lang) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({
                "lang": (lang or DEFAULT_LANG).strip().lower().split("-")[0],
                "updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "questions": clean,
            }, f, ensure_ascii=False, indent=2)
        os.replace(tmp, _path(lang))
    return f"saved {len(clean)} starter questions [{(lang or DEFAULT_LANG).strip().lower().split('-')[0]}]: " + "；".join(q["label"] for q in clean)


def list_for_admin() -> str:
    out = []
    for code in list_langs():
        qs = load(code)
        out.append(f"## {code}")
        if qs:
            out += [f"- [{q.get('icon','💬')}] {q['label']} -> {q['message']}" for q in qs]
        else:
            out.append("(no custom starters saved — public side uses defaults)")
    return "\n".join(out)


def starters_or_default(lang: str = DEFAULT_LANG) -> list:
    from chainlit.types import Starter
    code = (lang or DEFAULT_LANG).strip().lower().split("-")[0]
    qs = load(code) or DEFAULTS.get(code) or DEFAULTS[DEFAULT_LANG]
    # NOTE: chainlit renders Starter.icon as <img src> — emoji values show as
    # broken-image placeholders. Only pass icons that are real URLs/paths.
    return [
        Starter(label=q["label"], message=q["message"],
                icon=q.get("icon") if str(q.get("icon", "")).startswith(("http", "/")) else None)
        for q in qs[:MAX_QUESTIONS]
    ]
