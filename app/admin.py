"""Admin Chainlit app: owner-only. Password auth + write tools + file upload ingestion."""
import json
import os

import chainlit as cl
from agents import Runner

from common import agent, config, kb, memory
from common.threadstore import SQLiteDataLayer


@cl.data_layer
def data_layer():
    dl = SQLiteDataLayer()

    # On the admin side, serve the "admin view" of threads: userIdentifier is
    # rewritten to 'owner' so Chainlit's resume ACL (which requires
    # thread.userIdentifier == session.user.identifier) lets the owner resume
    # VISITOR threads too — previously they failed with "Thread not found." and
    # the history pane stayed empty. Original author is preserved in
    # metadata['_orig_author'] for the read-only guard in on_chat_resume.
    if os.environ.get("SIDE") == "admin":
        dl.get_thread = dl.get_thread_admin_view  # type: ignore[method-assign]
    return dl


@cl.password_auth_callback
def auth(username: str, password: str):
    if username == config.ADMIN_USER and password == config.ADMIN_PASSWORD:
        return cl.User(identifier=username, metadata={"role": "owner"})
    return None


@cl.on_chat_start
async def start():
    # Fresh admin session: owned by owner → follow-ups allowed.
    cl.user_session.set("resume_author", "owner")
    agent.init()
    await cl.Message(
        content=(
            "🛠 管理端已就绪。你可以：\n"
            "1. 直接拖入/上传文件(简历 PDF、项目文档、代码)——自动摄取进知识库\n"
            "2. 让我记住求职要点：如“记住：期望上海技术经理，薪资面议”\n"
            "3. 提问预演：测试公开侧会如何回答猎头的问题\n"
            "4. 历史列表中 👤 = 猎头发起的会话(只读观察)，🛠 = 管理端发起(可追问)"
        )
    ).send()


@cl.on_chat_resume
async def on_resume(thread):
    # Remember whose thread this is: 'owner' threads are follow-up-able,
    # visitor threads are recruiter conversations — read-only here, and any
    # message typed into them must NOT be persisted into the recruiter's thread.
    author = thread.get("userIdentifier") or ""
    # Admin view: userIdentifier was rewritten to 'owner' so the resume ACL
    # passes; recover the real author from metadata for the read-only guard.
    orig = (thread.get("metadata") or {}).get("_orig_author")
    cl.user_session.set("resume_author", orig or author)
    # Replay stored steps into the UI so resumed history is visible.
    # (Chainlit does NOT render past steps by itself on resume — without this
    # the chat pane stays empty even though get_thread returns full content.)
    # Mark each replayed message as already-persisted so send() displays it
    # WITHOUT writing to the data layer — resuming a recruiter conversation
    # must not add any steps to the recruiter's thread.
    hist = []
    for s in thread.get("steps", []):
        stype = str(s.get("type", ""))
        if stype not in ("user_message", "assistant_message"):
            continue
        if stype == "user_message":
            content = s.get("output") or s.get("input") or ""
            if isinstance(content, (dict, list)):
                content = json.dumps(content, ensure_ascii=False)
            if not str(content).strip():
                continue
            m = cl.Message(content=str(content), author=s.get("name") or "user", type="user_message")
            m.persisted = True
            await m.send()
            hist.append({"role": "user", "content": str(content)})
        else:
            content = s.get("output") or ""
            if isinstance(content, (dict, list)):
                content = json.dumps(content, ensure_ascii=False)
            if not str(content).strip():
                continue
            m = cl.Message(content=str(content), author=s.get("name") or "assistant")
            m.persisted = True
            await m.send()
            hist.append({"role": "assistant", "content": str(content)})
    if (orig or author) == "owner":
        # Owner thread: rebuild in-memory history so follow-ups carry context.
        cl.user_session.set("history", hist[-30:])
    else:
        notice = cl.Message(
            content="👤 以上为猎头会话内容（管理端只读，不能追问，避免打扰/污染猎头侧对话）。"
                    "如需预演问题，请新建会话。"
        )
        notice.persisted = True
        await notice.send()


async def _run_streamed(ag, run_input, msg: cl.Message, prefix: str = ""):
    """Run the agent with token streaming into msg; returns the RunResult."""
    streamed = Runner.run_streamed(ag, run_input)
    async for ev in streamed.stream_events():
        if ev.type == "raw_response_event":
            d = ev.data
            if getattr(d, "type", "") == "response.output_text.delta":
                await msg.stream_token((prefix + d.delta) if prefix else d.delta)
                prefix = ""
    return streamed


@cl.on_message
async def main(message: cl.Message):
    # Visitor-origin threads resumed on the admin side are read-only observation:
    # reply with a notice and return BEFORE creating any steps, so nothing
    # (neither the recruiter-visible content nor this notice) is persisted.
    if cl.user_session.get("resume_author") != "owner":
        await cl.Message(
            content="👤 猎头会话在管理端为只读。请新建会话进行预演或管理操作。"
        ).send()
        return
    # 1) auto-ingest attachments
    ingested = []
    ingested_names = []
    repo_zips = []
    avatar_upload = None
    for f in message.elements or []:
        path = getattr(f, "path", None)
        name = getattr(f, "name", os.path.basename(path or "file"))
        if not path:
            continue
        # --- image uploads (profile photo) → base64 for the agent's set_avatar tool ---
        if name.lower().rsplit(".", 1)[-1] in ("jpg", "jpeg", "png", "webp"):
            if os.path.getsize(path) > 15 * 1024 * 1024:
                ingested.append(f"✗ {name}: 图片超过 15MB")
                continue
            import base64 as _b64
            avatar_b64 = _b64.b64encode(open(path, "rb").read()).decode()
            avatar_upload = {
                "name": name,
                "b64": avatar_b64,
                "note": "这是用户上传的形象照。你必须立即调用 set_avatar 工具（image_b64=该 base64），成功后才能告诉用户已设置。",
            }
            ingested.append(f"✓ {name}: 形象照已读取，交给 set_avatar 处理")
            continue
        if name.lower().endswith(".zip"):
            repo_zips.append((name, path))
            continue
        if not kb.allowed_file(name):
            ingested.append(f"✗ {name}: 类型不允许(仅 md/txt/pdf/docx/代码)")
            continue
        if os.path.getsize(path) > kb.MAX_UPLOAD_MB * 1024 * 1024:
            ingested.append(f"✗ {name}: 超过 {kb.MAX_UPLOAD_MB}MB")
            continue
        dest = kb.save_upload(name, open(path, "rb").read())
        info = kb.ingest_file(dest, title=name)
        ingested_names.append(name)
        ingested.append(f"✓ {info['title']}: {info['chars']} 字符 → {info['chunks']} 块已入索引")

    repo_note = ""
    if repo_zips:
        from common import repos as _repos
        for zname, zpath in repo_zips:
            try:
                with open(zpath, "rb") as fz:
                    kb.save_upload(zname, fz.read())  # raw backup (never cleaned)
            except Exception:
                pass
            pname = os.path.splitext(zname)[0]
            r = _repos.extract_zip(zpath, pname)
            if "error" in r:
                repo_note += f"✗ {zname}: {r['error']}\n"
                continue
            doc = _repos.generate_doc(r["name"])
            if doc.startswith("error"):
                repo_note += f"✗ {zname}: {doc}\n"
                continue
            info = _repos.ingest_repo_doc(r["name"])
            repo_note += (
                f"✓ 项目 {r['name']}: CLAUDE.md/AGENT.md 已生成 "
                f"({info.get('chunks', '?')} chunks 入库)。让我阅读源码后补充“架构与亮点”。\n"
            )
        repo_note = "**项目包处理结果**\n" + repo_note + "\n---\n\n"

    ingest_note = repo_note
    if ingested:
        ingest_note = "**文件摄取结果**\n" + "\n".join(ingested) + "\n\n---\n\n"

    history = cl.user_session.get("history", [])
    user_text = message.content or "(files uploaded - please digest and summarize them)"
    if ingested and not message.content.strip():
        user_text = (
            "我刚上传了文件并已自动入索引，请读取知识库，总结你了解到我的新信息，"
            "并指出简历/项目描述可以改进的地方。"
        )
    history.append({"role": "user", "content": user_text})
    cl.user_session.set("history", history)

    ag = agent.get_agent("admin")
    msg = cl.Message(content="")
    await msg.send()
    run_input = list(history)
    if avatar_upload:
        # full image is too big for chat history; inject as one-shot system message
        run_input = run_input + [{
            "role": "system",
            "content": f"用户上传了形象照 {avatar_upload['name']}。base64 如下。\n{avatar_upload['note']}\n\nBASE64:\n{avatar_upload['b64']}",
        }]
    result = await _run_streamed(ag, run_input, msg)
    answer = result.final_output or "(no answer)"
    history.append({"role": "assistant", "content": answer})

    # 2) If a resume-like file was ingested, force a structured landing-page refresh.
    #    Relying on the model to "remember" update_resume_page is unreliable (deepseek skipped it).
    resume_like = [n for n in ingested_names if any(k in n.lower() for k in ("resume", "简历", "cv"))]
    if resume_like:
        follow = history + [{
            "role": "user",
            "content": (
                f"刚摄取了简历文件：{', '.join(resume_like)}。"
                "你现在必须调用 update_resume_page 工具(lang='zh')，从知识库简历中提取全部结构化字段"
                "（name/status/tags/summary/experience/projects/skills）并发布公开首页，"
                "随后必须调用 save_starters(lang='zh') 根据简历生成4-6个猎头预制问题。"
                "不要只回复文字，必须实际调用工具。"
                "完成后：如果知识库中存在其他语言的简历版本（用 list_knowledge_files 检查文件名），"
                "请为每种语言也调用 update_resume_page(lang=<对应语言>) 和 save_starters(lang=<语言>)，"
                "全部字段用该语言完整翻译（保留公司/产品名），使语言切换器可选。"
            ),
        }]
        try:
            r2 = await _run_streamed(ag, follow, msg, prefix="---\n\n")
            answer += "\n\n---\n\n📄 首页更新：" + (r2.final_output or "(无输出)")
            history.append({"role": "assistant", "content": r2.final_output or ""})
        except Exception as e:  # don't break chat on follow-up failure
            answer += f"\n\n---\n\n⚠️ 首页自动更新失败：{e}"

    cl.user_session.set("history", history[-30:])
    msg.content = ingest_note + answer
    await msg.update()
