"""White-screen regression: Chainlit calls set_starters over REST
(/project/settings) BEFORE the websocket/session exists. Any use of
cl.user_session there raises ChainlitContextException → 500 → blank chat UI."""
import ast
import inspect
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"


def test_public_set_starters_does_not_touch_user_session():
    src = (APP / "public.py").read_text()
    tree = ast.parse(src)
    func = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "set_starters":
            func = node
            break
    assert func is not None, "set_starters must exist in public.py"
    # No attribute access chain starting with cl.user_session inside set_starters
    for node in ast.walk(func):
        if isinstance(node, ast.Attribute):
            cur = node
            while isinstance(cur, ast.Attribute):
                cur = cur.value
            if isinstance(cur, ast.Name) and cur.id == "cl":
                assert node.attr != "user_session", (
                    "set_starters uses cl.user_session — breaks /project/settings "
                    "before websocket connect (white screen). Use the `user` argument."
                )


def test_admin_app_keeps_its_own_surface():
    """Guard against accidental copy-paste: admin.py must not define set_starters
    referencing user_session either (same REST-before-ws constraint applies)."""
    src = (APP / "admin.py").read_text()
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "set_starters":
            assert "user_session" not in ast.dump(node)


def test_streaming_reply_uses_stream_events_method():
    """Regression: stream_events is a METHOD on RunResultStreaming. Writing
    `async for ev in streamed.stream_events:` silently breaks every reply."""
    for py in ("public.py", "admin.py"):
        src = (APP / py).read_text()
        if "run_streamed" in src or "stream_events" in src:
            assert "stream_events()" in src, f"{py}: stream_events must be called"
            assert "stream_events:" not in src.replace("stream_events():", ""), (
                f"{py}: stream_events used as property"
            )


def test_avatar_author_is_ascii_assistant():
    """Chainlit's avatar route regex rejects non-ASCII author names, so public
    replies must use author='assistant' (matches the bundled assistant.jpg)."""
    src = (APP / "public.py").read_text()
    assert 'author="assistant"' in src
