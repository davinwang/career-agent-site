"""Start chainlit for the configured SIDE.
Public chat runs under /chat subpath; admin runs under /admin subpath.
The resume static page (served by nginx) is the site's landing page.
"""
import os

side = os.environ.get("SIDE", "public")

if side == "mcp":
    os.environ.setdefault("PYTHONPATH", "/srv")
    import uvicorn
    from mcp_server import create_app
    uvicorn.run(create_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
    raise SystemExit(0)

module = "admin" if side == "admin" else "public"

# Welcome screen markdown (shown on the empty-chat state, above the starter chips).
# Written before launch so it lands in the app root as chainlit.md.
if side == "admin":
    welcome = (
        "# 🛠 候选人管理端\n\n"
        "上传简历/文档/项目包、维护知识库、生成猎头预制问题。\n\n"
        "左侧历史列表可查看所有猎头会话。"
    )
else:
    welcome = (
        "# 👋 欢迎咨询候选人（软件开发）\n\n"
        "我是候选人的代表 Agent，可以介绍 TA 的经历、技能与项目细节。\n\n"
        "点击下方问题快速开始，或直接输入你的问题。"
    )
try:
    with open(os.path.join(os.path.dirname(__file__), "chainlit.md"), "w", encoding="utf-8") as f:
        f.write(welcome)
except OSError:
    pass

cmd = [
    "chainlit", "run", f"{module}.py",
    "--host", "0.0.0.0",
    "--port", os.environ.get("PORT", "8000"),
    "--headless",
]
# Both sides run under a subpath so nginx can route them cleanly.
cmd += ["--root-path", "/admin" if side == "admin" else "/chat"]

os.execvp("chainlit", cmd)
