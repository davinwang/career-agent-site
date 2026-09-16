"""File-backed long-term memory: facts.json (list of strings).

Written only by admin side; injected read-only into public side prompts.
"""
import json
import os
import threading
from datetime import datetime

from . import config

_lock = threading.Lock()


def _read_all() -> list[str]:
    try:
        with open(config.FACTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _write_all(facts: list[str]) -> None:
    os.makedirs(config.MEMORY_DIR, exist_ok=True)
    tmp = config.FACTS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(facts, f, ensure_ascii=False, indent=2)
    os.replace(tmp, config.FACTS_PATH)


def list_facts() -> str:
    facts = _read_all()
    if not facts:
        return "(no long-term facts yet)"
    return "\n".join(f"- {f}" for f in facts)


def add_fact(fact: str) -> str:
    fact = fact.strip()
    if not fact:
        return "empty fact ignored"
    with _lock:
        facts = _read_all()
        if any(fact == f for f in facts):
            return f"already known: {fact}"
        facts.append(f"{fact}  [added {datetime.now():%Y-%m-%d}]")
        _write_all(facts)
    return f"remembered: {fact}"


def remove_fact(substring: str) -> str:
    with _lock:
        facts = _read_all()
        kept = [f for f in facts if substring.lower() not in f.lower()]
        removed = len(facts) - len(kept)
        if removed:
            _write_all(kept)
    return f"removed {removed} fact(s) matching '{substring}'"
