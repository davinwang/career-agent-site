"""Start chainlit for the configured SIDE.
Public chat runs under /chat subpath; admin runs under /admin subpath.
The resume static page (served by nginx) is the site's landing page.
"""
import os

side = os.environ.get("SIDE", "public")
module = "admin" if side == "admin" else "public"

cmd = [
    "chainlit", "run", f"{module}.py",
    "--host", "0.0.0.0",
    "--port", os.environ.get("PORT", "8000"),
    "--headless",
]
# Both sides run under a subpath so nginx can route them cleanly.
cmd += ["--root-path", "/admin" if side == "admin" else "/chat"]

os.execvp("chainlit", cmd)
