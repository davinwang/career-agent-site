"""Shared SQLite data layer for chainlit (both public & admin containers mount /data).

- users:  persisted users (owner + one row per visitor uuid)
- threads: chainlit threads, author_identifier = visitor uuid or 'owner'
- steps:  chat steps/messages

Admin (identifier 'owner') sees ALL threads in list_threads.
Visitors see only their own (filtered by their persisted user id).
"""
import asyncio
import json
import os
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

from chainlit.data import BaseDataLayer
from chainlit.types import PaginatedResponse, PageInfo, Pagination, ThreadDict, ThreadFilter


def _db(path: str = "/data/threads.db") -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init(path: str = "/data/threads.db") -> None:
    conn = _db(path)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            identifier TEXT UNIQUE NOT NULL,
            createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            createdAt TEXT NOT NULL,
            name TEXT,
            user_id TEXT,
            user_identifier TEXT,
            tags TEXT,
            metadata TEXT
        );
        CREATE TABLE IF NOT EXISTS steps (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            name TEXT,
            type TEXT,
            is_error INTEGER DEFAULT 0,
            input TEXT,
            output TEXT,
            createdAt TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            metadata TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_steps_thread ON steps(thread_id);
        CREATE INDEX IF NOT EXISTS idx_threads_user ON threads(user_id);
        """
    )
    conn.commit()
    conn.close()


class SQLiteDataLayer(BaseDataLayer):
    def __init__(self, path: str = "/data/threads.db"):
        _init(path)
        self.path = path

    # -- helpers ------------------------------------------------------------
    def _run(self, fn, *args):
        return asyncio.get_event_loop().run_in_executor(None, fn, *args)

    # -- users ---------------------------------------------------------------
    async def get_user(self, identifier: str):
        def q():
            conn = _db(self.path)
            row = conn.execute(
                "SELECT * FROM users WHERE identifier=?", (identifier,)
            ).fetchone()
            conn.close()
            return row
        row = await self._run(q)
        if not row:
            return None
        from chainlit.user import PersistedUser
        return PersistedUser(
            id=row["id"], identifier=row["identifier"],
            createdAt=row["createdAt"],
        )

    async def create_user(self, user):
        def q():
            conn = _db(self.path)
            row = conn.execute(
                "SELECT * FROM users WHERE identifier=?", (user.identifier,)
            ).fetchone()
            if row:
                conn.close()
                return row
            uid = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO users (id, identifier, createdAt) VALUES (?,?,?)",
                (uid, user.identifier, time.strftime("%Y-%m-%dT%H:%M:%S")),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM users WHERE identifier=?", (user.identifier,)
            ).fetchone()
            conn.close()
            return row
        row = await self._run(q)
        from chainlit.user import PersistedUser
        return PersistedUser(
            id=row["id"], identifier=row["identifier"], createdAt=row["createdAt"]
        )

    async def delete_feedback(self, feedback_id: str):
        return True

    async def upsert_feedback(self, feedback):
        return feedback.id

    async def create_element(self, element: Any):
        pass

    async def get_element(self, element_id: str, thread_id: Optional[str] = None):
        return None

    async def delete_element(self, element_id: str, thread_id: Optional[str] = None):
        pass

    # -- steps ----------------------------------------------------------------
    async def create_step(self, step_dict: Dict):
        def q():
            conn = _db(self.path)
            conn.execute(
                """INSERT OR REPLACE INTO steps
                   (id, thread_id, name, type, is_error, input, output, createdAt,
                    start_time, end_time, metadata)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    step_dict.get("id"), step_dict.get("threadId"),
                    step_dict.get("name"), step_dict.get("type"),
                    1 if step_dict.get("isError") else 0,
                    json.dumps(step_dict.get("input")) if step_dict.get("input") is not None else None,
                    json.dumps(step_dict.get("output")) if step_dict.get("output") is not None else None,
                    step_dict.get("createdAt"),
                    step_dict.get("startTime"), step_dict.get("endTime"),
                    json.dumps(step_dict.get("metadata")) if step_dict.get("metadata") else None,
                ),
            )
            conn.commit()
            conn.close()
        await self._run(q)

    async def update_step(self, step_dict: Dict):
        await self.create_step(step_dict)

    async def delete_step(self, step_id: str):
        def q():
            conn = _db(self.path)
            conn.execute("DELETE FROM steps WHERE id=?", (step_id,))
            conn.commit()
            conn.close()
        await self._run(q)

    # -- threads ----------------------------------------------------------------
    async def get_thread_author(self, thread_id: str) -> str:
        """Return the thread's author identifier. Chainlit's ACL (data/acl.py)
        rejects get_thread unless this equals the current user's identifier.
        Owner is the admin superuser → return 'owner' for ANY thread so the
        admin can open every visitor session (fixes 'Failed to load thread:
        Unauthorized' on /admin). Visitors are still filtered in list_threads
        (owner-only bypass), so this does not leak threads to them."""
        def q():
            conn = _db(self.path)
            row = conn.execute(
                "SELECT user_identifier FROM threads WHERE id=?", (thread_id,)
            ).fetchone()
            conn.close()
            return row["user_identifier"] if row else ""
        author = await self._run(q)
        return "owner" if author else author

    async def delete_thread(self, thread_id: str):
        def q():
            conn = _db(self.path)
            conn.execute("DELETE FROM steps WHERE thread_id=?", (thread_id,))
            conn.execute("DELETE FROM threads WHERE id=?", (thread_id,))
            conn.commit()
            conn.close()
        await self._run(q)

    async def list_threads(self, pagination: Pagination, filters: ThreadFilter):
        def q():
            conn = _db(self.path)
            where, params = [], []
            # Admin bypass: resolve the filter's userId; if that user is 'owner',
            # ignore the filter entirely so the owner sees every visitor session.
            eff_user = filters.userId
            if eff_user:
                def _ident(uid):
                    conn2 = _db(self.path)
                    row2 = conn2.execute(
                        "SELECT identifier FROM users WHERE id=?", (uid,)
                    ).fetchone()
                    conn2.close()
                    return row2["identifier"] if row2 else None
                if _ident(eff_user) == "owner":
                    eff_user = None
            if eff_user:
                where.append("user_id=?")
                params.append(eff_user)
            if filters.search:
                where.append("(name LIKE ? OR id IN (SELECT thread_id FROM steps WHERE output LIKE ?))")
                like = f"%{filters.search}%"
                params += [like, like]
            sql = "SELECT * FROM threads"
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY createdAt DESC LIMIT ? OFFSET ?"
            first = int(pagination.first)
            cursor = int(pagination.cursor) if pagination.cursor else 0
            rows = conn.execute(sql, params + [first, cursor]).fetchall()
            total = conn.execute(
                "SELECT COUNT(*) c FROM threads" + (" WHERE " + " AND ".join(where) if where else ""),
                params,
            ).fetchone()["c"]
            conn.close()
            return rows, total
        rows, total = await self._run(q)
        from chainlit.types import ThreadDict as TD
        # Admin sidebar: tag thread names with origin so the owner can tell
        # recruiter-initiated (👤 visitor-*) from admin-initiated (🛠 owner).
        # Public side stays unprefixed.
        admin_side = os.environ.get("SIDE") == "admin"
        threads = []
        for r in rows:
            name = r["name"] or ""
            if admin_side:
                ident = r["user_identifier"] or ""
                name = ("🛠 " if ident == "owner" else "👤 ") + name
            threads.append({
                "id": r["id"], "createdAt": r["createdAt"], "name": name,
                "userId": r["user_id"], "userIdentifier": r["user_identifier"],
                "tags": json.loads(r["tags"]) if r["tags"] else None,
                "metadata": json.loads(r["metadata"]) if r["metadata"] else None,
                "steps": [], "elements": None,
            })
        end_cursor = None
        threads_page = threads[: pagination.first]
        if len(threads_page) == pagination.first:
            end_cursor = str((int(pagination.cursor) if pagination.cursor else 0) + pagination.first)
        page_info = PageInfo(
            hasNextPage=bool(end_cursor),
            startCursor=str(pagination.cursor) if pagination.cursor else "",
            endCursor=end_cursor or "",
        )
        return PaginatedResponse(pageInfo=page_info, data=threads_page)

    async def get_thread(self, thread_id: str) -> Optional[ThreadDict]:
        def q():
            conn = _db(self.path)
            t = conn.execute("SELECT * FROM threads WHERE id=?", (thread_id,)).fetchone()
            if not t:
                conn.close()
                return None
            steps = conn.execute(
                "SELECT * FROM steps WHERE thread_id=? ORDER BY createdAt ASC", (thread_id,)
            ).fetchall()
            conn.close()
            return t, steps
        res = await self._run(q)
        if not res:
            return None
        t, steps = res

        def parse(v):
            if v is None:
                return None
            try:
                return json.loads(v)
            except Exception:
                return v

        step_dicts = [
            {
                "id": s["id"], "threadId": s["thread_id"], "name": s["name"],
                "type": s["type"], "isError": bool(s["is_error"]),
                "input": parse(s["input"]), "output": parse(s["output"]),
                "createdAt": s["createdAt"], "startTime": s["start_time"],
                "endTime": s["end_time"], "metadata": parse(s["metadata"]),
            }
            for s in steps
        ]
        return ThreadDict(
            id=t["id"], createdAt=t["createdAt"], name=t["name"],
            userId=t["user_id"], userIdentifier=t["user_identifier"],
            tags=json.loads(t["tags"]) if t["tags"] else None,
            metadata=json.loads(t["metadata"]) if t["metadata"] else None,
            steps=step_dicts, elements=None,
        )

    async def update_thread(
        self,
        thread_id: str,
        name: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict] = None,
        tags: Optional[List[str]] = None,
    ):
        def q():
            conn = _db(self.path)
            row = conn.execute(
                "SELECT user_identifier FROM threads WHERE id=?", (thread_id,)
            ).fetchone()
            if row:
                if user_id is not None and not row["user_id"]:
                    # backfill owner (e.g. set after row creation by a race)
                    ident = user_id
                    u = conn.execute(
                        "SELECT identifier FROM users WHERE id=?", (user_id,)
                    ).fetchone()
                    ident = u["identifier"] if u else ident
                    conn.execute(
                        "UPDATE threads SET user_id=?, user_identifier=? WHERE id=?",
                        (user_id, ident, thread_id),
                    )
                if name is not None:
                    conn.execute("UPDATE threads SET name=? WHERE id=?", (name, thread_id))
                if metadata is not None:
                    conn.execute(
                        "UPDATE threads SET metadata=? WHERE id=?",
                        (json.dumps(metadata), thread_id),
                    )
                if tags is not None:
                    conn.execute(
                        "UPDATE threads SET tags=? WHERE id=?",
                        (json.dumps(tags), thread_id),
                    )
            else:
                ident = user_id
                if ident:
                    u = conn.execute(
                        "SELECT identifier FROM users WHERE id=?", (ident,)
                    ).fetchone()
                    ident = u["identifier"] if u else ident
                conn.execute(
                    """INSERT INTO threads (id, createdAt, name, user_id, user_identifier, tags, metadata)
                       VALUES (?,?,?,?,?,?,?)""",
                    (
                        thread_id, time.strftime("%Y-%m-%dT%H:%M:%S"),
                        name or "新会话", user_id, ident,
                        json.dumps(tags) if tags else None,
                        json.dumps(metadata) if metadata else None,
                    ),
                )
            conn.commit()
            conn.close()
        await self._run(q)

    async def build_debug_url(self) -> str:
        return ""
