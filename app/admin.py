"""Admin Chainlit app: owner-only. Password auth + write tools + file upload ingestion."""
import os

import chainlit as cl
from agents import Runner

from common import agent, config, kb, memory


@cl.password_auth_callback
def auth(username: str, password: str):
    if username == config.ADMIN_USER and password == config.ADMIN_PASSWORD:
        return cl.User(identifier=username, metadata={"role": "owner"})
    return None


@cl.on_chat_start
async def start():
    agent.init()
    await cl.Message(
        content=(
            "🛠 管理端已就绪。你可以：\n"
            "1. 直接拖入/上传文件(简历 PDF、项目文档、代码)——自动摄取进知识库\n"
            "2. 让我记住求职要点：如“记住：期望上海技术经理，薪资面议”\n"
            "3. 提问预演：测试公开侧会如何回答猎头的问题"
        )
    ).send()


@cl.on_message
async def main(message: cl.Message):
    # 1) auto-ingest attachments
    ingested = []
    for f in message.elements or []:
        path = getattr(f, "path", None)
        name = getattr(f, "name", os.path.basename(path or "file"))
        if not path:
            continue
        if not kb.allowed_file(name):
            ingested.append(f"✗ {name}: 类型不允许(仅 md/txt/pdf/docx/代码)")
            continue
        if os.path.getsize(path) > kb.MAX_UPLOAD_MB * 1024 * 1024:
            ingested.append(f"✗ {name}: 超过 {kb.MAX_UPLOAD_MB}MB")
            continue
        dest = kb.save_upload(name, open(path, "rb").read())
        info = kb.ingest_file(dest, title=name)
        ingested.append(f"✓ {info['title']}: {info['chars']} 字符 → {info['chunks']} 块已入索引")

    ingest_note = ""
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
    result = await Runner.run(ag, history)
    answer = result.final_output or "(no answer)"
    history.append({"role": "assistant", "content": answer})
    cl.user_session.set("history", history[-30:])
    msg.content = ingest_note + answer
    await msg.update()
