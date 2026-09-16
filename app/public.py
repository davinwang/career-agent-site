"""Public Chainlit app: recruiters/HR Q&A. Read-only agent."""
import chainlit as cl
from agents import Runner

from common import agent, config, kb, memory


@cl.on_chat_start
async def start():
    agent.init()
    await cl.Message(
        content=(
            "👋 欢迎咨询候选人(软件开发)。我是候选人的代表 Agent，"
            "可以介绍 TA 的经历、技能与项目细节。直接提问即可。\n\n"
            "Welcome! I represent the candidate (software development). "
            "Ask me anything about their background, skills and projects."
        )
    ).send()


@cl.on_message
async def main(message: cl.Message):
    elements = []
    for f in message.elements or []:
        if getattr(f, "path", None):
            elements.append(f.path)
    # Public side: attachments are ignored (read-only), only text is processed.
    history = cl.user_session.get("history", [])
    history.append({"role": "user", "content": message.content})
    cl.user_session.set("history", history)

    ag = agent.get_agent("public")

    # inject fresh context (facts may have changed via admin)
    sys_extra = (
        f"\n\n[OWNER LONG-TERM FACTS]\n{memory.list_facts()}\n\n"
        f"[KNOWLEDGE BASE FILES]\n{kb.list_files()}"
    )
    msg = cl.Message(content="")
    await msg.send()
    result = await Runner.run(
        ag,
        history,
        context=None,
    )
    answer = result.final_output or "(no answer)"
    history.append({"role": "assistant", "content": answer})
    cl.user_session.set("history", history[-30:])
    msg.content = answer
    await msg.update()
