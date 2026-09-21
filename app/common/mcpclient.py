"""Admin-side MCP client: the admin agent performs all write operations through
the owner MCP server (jas-mcp) authenticated with a short-lived Bearer JWT.

Token lifecycle: fetched from {MCP_URL}/token with ADMIN_USER/ADMIN_PASSWORD,
cached, and transparently re-issued on 401 (token expired).
"""
import asyncio
import os
import threading
import time

MCP_URL = os.environ.get("MCP_INTERNAL_URL", "http://mcp:8000/mcp")
TOKEN_URL = os.environ.get("MCP_INTERNAL_URL", "http://mcp:8000").rstrip("/").removesuffix("/mcp") + "/token"

_lock = threading.Lock()
_state = {"token": None, "exp": 0}


async def _fetch_token() -> str:
    import httpx
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(TOKEN_URL, json={
            "username": os.environ.get("ADMIN_USER", "owner"),
            "password": os.environ.get("ADMIN_PASSWORD", ""),
        })
        if r.status_code != 200:
            raise RuntimeError(f"MCP token issue failed ({r.status_code}): {r.text[:200]}")
        d = r.json()
        _state["token"] = d["token"]
        _state["exp"] = time.time() + int(d.get("expiresIn", 3600)) - 120  # 2min skew
        return _state["token"]


async def get_token() -> str:
    with _lock:
        if _state["token"] and time.time() < _state["exp"]:
            return _state["token"]
    return await _fetch_token()


async def call_tool(name: str, args: dict) -> str:
    """Open an MCP session, call a tool, return its text result. Retries once on auth failure."""
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    for attempt in (1, 2):
        token = await get_token()
        try:
            async with streamablehttp_client(
                MCP_URL, headers={"Authorization": f"Bearer {token}"}
            ) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(name, args)
                    parts = []
                    for block in result.content:
                        if getattr(block, "text", None) is not None:
                            parts.append(block.text)
                    return "\n".join(parts) or "(empty result)"
        except Exception as e:
            msg = str(e)
            if attempt == 1 and ("401" in msg or "expired" in msg.lower() or "unauthorized" in msg.lower()):
                _state["token"], _state["exp"] = None, 0  # force re-issue
                continue
            raise
    raise RuntimeError(f"MCP call {name} failed after retry")
