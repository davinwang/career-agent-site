"""Start chainlit for the configured SIDE.
Public side runs at site root (/); admin runs under /admin subpath."""
import os

side = os.environ.get("SIDE", "public")
module = "admin" if side == "admin" else "public"

cmd = [
    "chainlit", "run", f"{module}.py",
    "--host", "0.0.0.0",
    "--port", os.environ.get("PORT", "8000"),
    "--headless",
]
# Admin stays under a subpath so nginx can route it cleanly.
# Public chat is the whole site -> no root-path.
if side == "admin":
    cmd += ["--root-path", "/admin"]

os.execvp("chainlit", cmd)
