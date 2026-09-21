"""Auth: MCP JWT issue/verify + admin chainlit ACL owner bypass (white-screen /
Unauthorized class of bugs).

The MCP server module lives in the container image only when FastMCP isn't
importable on the host — these tests import it lazily and fall back to testing
the pure-JWT logic directly.
"""
import asyncio
import json
import time

import jwt as pyjwt
import pytest

try:
    import common.mcp_server as mcp_server  # noqa: F401
    HAVE_MCP_SERVER = True
except Exception:  # fastmcp missing on host
    mcp_server = None
    HAVE_MCP_SERVER = False

SECRET = "unit-test-secret"

pytestmark = pytest.mark.usefixtures()


# ---------- pure JWT logic (always runs) ----------

def test_jwt_roundtrip_valid():
    token = pyjwt.encode({"sub": "owner", "role": "owner", "exp": int(time.time()) + 60},
                         SECRET, algorithm="HS256")
    payload = pyjwt.decode(token, SECRET, algorithms=["HS256"])
    assert payload["role"] == "owner"


def test_expired_token_rejected():
    expired = pyjwt.encode({"sub": "owner", "role": "owner", "exp": 1},
                           SECRET, algorithm="HS256")
    with pytest.raises(pyjwt.ExpiredSignatureError):
        pyjwt.decode(expired, SECRET, algorithms=["HS256"])


def test_tampered_token_rejected():
    token = pyjwt.encode({"sub": "owner", "role": "owner", "exp": int(time.time()) + 60},
                         SECRET, algorithm="HS256")
    with pytest.raises(Exception):
        pyjwt.decode(token + "x", SECRET, algorithms=["HS256"])


# ---------- token endpoint (needs the server module) ----------

@pytest.mark.skipif(not HAVE_MCP_SERVER, reason="fastmcp not installed on host")
def test_token_endpoint_rejects_bad_credentials(monkeypatch):
    monkeypatch.setenv("ADMIN_USER", "owner")
    monkeypatch.setenv("ADMIN_PASSWORD", "right-password")
    monkeypatch.setattr(mcp_server, "MCP_JWT_SECRET", SECRET)
    body = {"username": "owner", "password": "wrong"}
    scope = {"type": "http", "method": "POST", "path": "/token",
             "headers": [(b"content-type", b"application/json")], "query_string": b""}

    async def receive():
        return {"type": "http.request", "body": json.dumps(body).encode()}

    from starlette.requests import Request
    request = Request(scope, receive)
    resp = asyncio.run(mcp_server.issue_token(request))
    assert resp.status_code == 401


@pytest.mark.skipif(not HAVE_MCP_SERVER, reason="fastmcp not installed on host")
def test_token_endpoint_issues_valid_jwt(monkeypatch):
    monkeypatch.setenv("ADMIN_USER", "owner")
    monkeypatch.setenv("ADMIN_PASSWORD", "right-password")
    monkeypatch.setenv("MCP_JWT_SECRET", SECRET)
    monkeypatch.setattr(mcp_server, "MCP_JWT_SECRET", SECRET)
    body = {"username": "owner", "password": "right-password"}
    scope = {"type": "http", "method": "POST", "path": "/token",
             "headers": [(b"content-type", b"application/json")], "query_string": b""}

    async def receive():
        return {"type": "http.request", "body": json.dumps(body).encode()}

    from starlette.requests import Request
    request = Request(scope, receive)
    resp = asyncio.run(mcp_server.issue_token(request))
    assert resp.status_code == 200
    token = json.loads(resp.body)["token"]
    payload = pyjwt.decode(token, SECRET, algorithms=["HS256"])
    assert payload["role"] == "owner"
    assert payload["exp"] > time.time()


# ---------- chainlit data-layer ACL ----------

def _store(tmp_path):
    from common.threadstore import SQLiteDataLayer
    return SQLiteDataLayer(path=str(tmp_path / "threads.db"))


@pytest.mark.asyncio
async def test_owner_can_open_any_thread(tmp_path):
    """Regression: 'Failed to load thread: Unauthorized' when the admin opened a
    visitor thread. get_thread_author must report 'owner' for any existing thread
    so Chainlit's ACL lets the admin through."""
    store = _store(tmp_path)
    await store.update_thread("t-regression-1", name="visitor chat",
                              user_id="u1", user_identifier="visitor-abc")
    author = await store.get_thread_author("t-regression-1")
    assert author == "owner", "owner bypass missing — admin ACL regression"


@pytest.mark.asyncio
async def test_get_thread_author_empty_for_missing_thread(tmp_path):
    store = _store(tmp_path)
    assert await store.get_thread_author("nope") == ""


@pytest.mark.asyncio
async def test_visitors_cannot_see_others_threads_in_list(tmp_path):
    """list_threads with a visitor filter must not leak other users' threads."""
    store = _store(tmp_path)
    await store.update_thread("t1", name="a", user_id="uA", user_identifier="visitor-aaa")
    await store.update_thread("t2", name="b", user_id="uB", user_identifier="visitor-bbb")
    from chainlit.types import Pagination, ThreadFilter
    res = await store.list_threads(Pagination(first=10), ThreadFilter(userId="uA", search=None))
    ids = [t.id for t in res.data]
    assert "t1" in ids and "t2" not in ids
