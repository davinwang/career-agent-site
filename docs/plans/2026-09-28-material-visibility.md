# 素材可视化与管理 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 让用户在管理端直观看到「AI 拿到了什么素材」并可直接管理：项目标注素材类型（源码/文档）、材料卡可下载/删除、上传的 PDF 原件可版本化管理、对话可精确引用已有附件。

**Architecture:** 复用现有 `/api/artifacts` 聚合接口（扩展字段），新增 `/api/upload`（原件列表/下载/删除）——上传文件已持久化在 UPLOAD_DIR（uuid 命名），只需把原始文件名记录进 DB 或 sidecar。前端只改 `ArtifactPanel.tsx` 和 `ChatInput.tsx`（附件选择器）。

**Tech Stack:** Hono + libSQL (better-sqlite3 via @libsql/client)、React 19 + Vite、docker compose 部署（`cd deploy && sudo docker compose up --build -d`）。

**Verification convention:** v2 无测试框架 — 每个任务后 `npm run typecheck`/`npm run build`，部署后 `curl http://localhost:8090/api/health` + 浏览器实测 `/admin/`。

---

### Task 1: 上传原件登记 — uploads 表 + 上传时记录原始文件名

**Objective:** 上传的 PDF/文档原件可被列出、下载、删除（目前 uuid 存盘后原始名丢失）。

**Files:**
- Modify: `backend/src/db/schema.ts`（新增 uploads 表，幂等 DDL）
- Modify: `backend/src/api/upload.ts`（写记录）

**Step 1: schema 加表**

```ts
// idempotent: CREATE TABLE IF NOT EXISTS
// uploads(id TEXT PK, stored_name TEXT UNIQUE, original_name TEXT, ext TEXT,
//         size INTEGER, created_at TEXT DEFAULT (datetime('now')))
```

**Step 2: upload.ts POST 里落库**

```ts
await run('INSERT OR IGNORE INTO uploads (id, stored_name, original_name, ext, size) VALUES (?,?,?,?,?)',
  [uuidv4(), storedName, file.name, ext, file.size]);
```

**Step 3: 部署 + 验证**

```bash
cd deploy && sudo docker compose up --build -d backend
curl -s http://localhost:8090/api/health
# 登录 JWT 后 POST 一个测试 pdf 到 /api/upload，再 sqlite 查 uploads 表
```

**Step 4: Commit** `feat: register uploaded originals in uploads table`

---

### Task 2: 原件管理 API — GET 列表 / GET 下载 / DELETE

**Objective:** 管理端可列出全部原件、下载原件、删除原件。

**Files:**
- Modify: `backend/src/api/upload.ts`

**Step 1: 三个路由（全部 authRequired）**

```ts
uploadRoutes.get('/', ...)      // SELECT * FROM uploads ORDER BY created_at DESC
uploadRoutes.get('/:storedName', ...)  // path.basename 防穿越, fs.readFile → c.body(, mime by ext)
uploadRoutes.delete('/:storedName', ...) // 删 DB 行 + unlink 文件（文件不存在也要删行）
```

**Step 2: 验证** curl 三接口（登录 JWT），下载文件 diff 原文件一致，DELETE 后列表减一。

**Step 3: Commit** `feat: list/download/delete uploaded originals`

---

### Task 3: /api/artifacts 扩展 — 项目素材类型标签 + 原件版本列表

**Objective:** artifacts 接口返回：projects 增加 `source_type`（`repo_url` 存在 → `源码`，否则 `文档`），并新增 `uploads` 数组（多版 PDF 简历可见）。

**Files:**
- Modify: `backend/src/server.ts`（/api/artifacts：projects SELECT 加 repo_url 已有，映射 source_type；新增 uploads 查询）

**Step 1:**

```ts
uploads: await all('SELECT id, stored_name, original_name, ext, size, created_at FROM uploads ORDER BY created_at DESC'),
```
projects 已返回 repo_url → 前端据其显示标签，后端可不改 projects。

**Step 2:** curl /api/artifacts 验证字段。

**Step 3: Commit** `feat: artifacts includes upload originals`

---

### Task 4: ArtifactPanel — 材料卡下载/删除按钮 + 项目类型标签 + 简历原件版本列表

**Objective:** 用户诉求的三处 UI 落地。

**Files:**
- Modify: `frontend/admin/src/lib/api.ts`（listUploads/downloadUpload/deleteUpload；deleteKnowledge 已有）
- Modify: `frontend/admin/src/components/chat/ArtifactPanel.tsx`

**Step 1:** knowledge 列表行加两个图标按钮：下载（GET /api/upload/:storedName blob 保存，需 artifacts 的 knowledge 行带 stored_name — metadata JSON 里已有或 Task 3 一并补）、删除（confirm 后 DELETE /api/knowledge/:id，删除后 bump refreshKey）。

**Step 2:** projects 列表行加 Badge：`repo_url ? 源码 : 文档`。

**Step 3:** 简历 Detail 顶部加「上传的原件」区：列出 uploads（文件名+日期），行内 下载 / 删除 按钮。删除带 confirm。

**Step 4:**

```bash
cd frontend/admin && npx tsc -b && npm run build
cd ../.. && cd deploy && sudo docker compose up --build -d admin
sudo docker exec jas-nginx nginx -s reload
```
浏览器 /admin/ → 对话 → 右侧面板实测三个改动。

**Step 5: Commit** `feat: artifact panel — upload versions, download/delete, source-type badges`

---

### Task 5: 对话附件引用 — ChatInput 附件选择器

**Objective:** 输入框旁「引用附件」按钮，弹出已有 uploads/knowledge 列表，选中后自动在输入框插入 `（引用附件：original_name）`，让导师对话能精确定位某个 PDF/材料。

**Files:**
- Modify: `frontend/admin/src/components/chat/ChatInput.tsx`
- Modify: `frontend/admin/src/lib/api.ts`（listUploads 已在 Task 4 加）

**Step 1:** ChatInput 加 📎 旁的「引用」按钮 → 下拉列出 uploads（原始名 + 日期）。

**Step 2:** 点选 → append 到 input：`请结合附件「xxx.pdf」回答：`（保留用户继续输入）。

**Step 3:** build + 部署同 Task 4，浏览器实测：引用 → 发送 → 导师回复中体现该附件。

**Step 4: Commit** `feat: attach-reference picker in admin chat input`

---

### Task 6: 收尾 — AGENTS.md 更新 + commit & push

**Files:**
- Modify: `AGENTS.md`（/api/upload 管理接口、artifacts 扩展、附件引用）

```bash
git pull --rebase && git add -A && git commit -m "feat: material visibility & management (uploads, badges, attachment picker)" && git push
```

---

## Risks / Notes
- knowledge 行缺 stored_name：若 knowledge.metadata JSON 没存 stored_name，ingestFile 工具（backend/src/tools/）需要顺带写入 metadata——在 Task 3 检查，缺则 Task 1 一起补（ingestFile 落库时 metadata 存 `{stored_name}`）。
- 删除原件不删 knowledge 条目（PDF 可能已解析入库）——删除按钮提示「仅删除原件文件，解析内容仍在知识库」。
- 并行会话冲突：改前端前 `git status --short` 检查 sibling 改动，`patch` 冲突时先 re-read。
