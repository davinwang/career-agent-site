"""Public Chainlit app: recruiters/HR Q&A. Read-only agent.

Visitor identity: cookie jas_vuid (uuid set by resume page JS, same origin).
Used as chainlit user identifier so each visitor's history persists without login.
"""
import os
import uuid

import chainlit as cl
from agents import Runner

from common import agent, config, kb, memory
from agents import RunConfig
from common import starters
from common.guardrails import recruiter_input_guardrail, redact_source_dumps
from common.threadstore import SQLiteDataLayer


@cl.data_layer
def data_layer():
    return SQLiteDataLayer()


@cl.header_auth_callback
def header_auth(headers):
    # The resume page sets jas_vuid cookie (same-origin iframe shares it).
    cookie = headers.get("Cookie", "") or headers.get("cookie", "")
    vuid = None
    lang = ""
    for part in cookie.split(";"):
        k, _, v = part.strip().partition("=")
        if k == "jas_vuid" and v:
            vuid = v.strip()
        elif k == "jas_lang" and v:
            lang = v.strip()
    if not vuid:
        vuid = str(uuid.uuid4())
    return cl.User(identifier=f"visitor-{vuid}",
                   metadata={"role": "visitor", "ui_lang": lang})


@cl.set_starters
async def set_starters(user=None):
    # /project/settings is called by the UI BEFORE the websocket exists, so
    # cl.user_session raises ChainlitContextException here → 500 → white chat.
    # Use the user argument (header_auth metadata) instead.
    lang = ""
    if user and getattr(user, "metadata", None):
        lang = user.metadata.get("ui_lang") or ""
    return starters.starters_or_default(lang or "zh")


async def _latest_visitor_thread_id(vuid: str):
    """Most recent thread id authored by this visitor uuid (or None)."""
    from common.threadstore import _db
    conn = _db()
    row = conn.execute(
        "SELECT id FROM threads WHERE user_identifier=? ORDER BY createdAt DESC LIMIT 1",
        (f"visitor-{vuid}",),
    ).fetchone()
    conn.close()
    return row[0] if row else None


@cl.on_chat_start
async def start():
    agent.init()
    # Language: jas_lang cookie (set by resume page language switcher, browser-default).
    from common.kb import normalize_lang
    user = cl.user_session.get("user")
    lang = ""
    try:
        meta = getattr(user, "metadata", None) or {}
        lang = meta.get("ui_lang", "")
    except Exception:
        pass
    cl.user_session.set("ui_lang", normalize_lang(lang))


@cl.on_chat_resume
async def on_resume(thread):
    # Restored thread: rebuild in-memory history so the agent keeps context.
    history = []
    for step in thread.get("steps") or []:
        if step.get("type") == "user_message":
            history.append({"role": "user", "content": step.get("output") or ""})
        elif step.get("type") == "assistant_message":
            history.append({"role": "assistant", "content": step.get("output") or ""})
    cl.user_session.set("history", history[-30:])


@cl.on_message
async def main(message: cl.Message):
    # Public side: attachments are ignored (read-only), only text is processed.
    history = cl.user_session.get("history", [])
    history.append({"role": "user", "content": message.content})
    cl.user_session.set("history", history)

    ag = agent.get_agent("public")

    # inject fresh context (facts may have changed via admin) + UI language
    ui_lang = cl.user_session.get("ui_lang") or "zh"
    lang_rule = ("" if ui_lang == "zh"
                 else f"\n[LANGUAGE] The recruiter is browsing in '{ui_lang}'. "
                      f"ALWAYS reply in {ui_lang}, regardless of the language of the question, "
                      "unless the recruiter explicitly asks for another language.\n")
    sys_extra = (
        f"\n\n[OWNER LONG-TERM FACTS]\n{memory.list_facts()}\n\n"
        f"[KNOWLEDGE BASE FILES]\n{kb.list_files()}"
        + lang_rule
    )
    # author "assistant" → chainlit serves /avatars/assistant.jpg (the owner's photo,
    # written by avatar.py). config.ui.name contains non-ASCII, which the avatar
    # route's regex rejects, so explicit ASCII author is required.
    msg = cl.Message(content="", author="assistant")
    await msg.send()
    run_input = [{"role": "system", "content": sys_extra}] + history
    streamed = Runner.run_streamed(
        ag,
        run_input,
        run_config=RunConfig(input_guardrails=[recruiter_input_guardrail()]),
    )
    guardrail_tripped = False
    async for ev in streamed.stream_events():
        # token-level streaming: append deltas as they arrive
        if ev.type == "raw_response_event":
            d = ev.data
            if getattr(d, "type", "") == "response.output_text.delta":
                await msg.stream_token(d.delta)
        elif ev.type == "run_item_stream_event":
            if getattr(ev, "name", "") == "run_item_completed":
                continue
    # Tripwire -> refusal answer instead of the agent output.
    guardrail_tripped = any(
        gr.output.tripwire_triggered
        for gr in (streamed.input_guardrail_results or [])
    )
    if guardrail_tripped:
        for gr in streamed.input_guardrail_results:
            if gr.output.tripwire_triggered:
                reason = (gr.output.output_info or {}).get("reason", "")
                answer = (
                    "🛡 抱歉，这个问题我无法处理。" + (f"（{reason}）" if reason else "") + "\n\n"
                    "本项目源码与文档由候选人托管，仅用于支撑技术问答，不对外提供原文。"
                    "我很乐意从技术方案、架构决策、业务价值的角度回答任何具体问题——请换个问法试试。"
                )
                msg.content = answer
                await msg.update()
                history.append({"role": "assistant", "content": answer})
                cl.user_session.set("history", history[-30:])
                return
    answer = redact_source_dumps(streamed.final_output or "(no answer)")
    history.append({"role": "assistant", "content": answer})
    cl.user_session.set("history", history[-30:])
    if msg.content != answer:
        msg.content = answer
        await msg.update()
