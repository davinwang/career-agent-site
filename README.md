# job-agent-site (jas)

个人求职 Agent 网站：一个只为网站主人(一人)服务的简历+项目问答系统，专注软件开发行业。

## 架构

| 组件 | 技术 | 说明 |
|------|------|------|
| 聊天前端 | Chainlit 2.x | 两个入口，同一镜像 |
| Agent | OpenAI Agents SDK | 单 agent + 工具调用 |
| 记忆 | 文件式 (`/data/memory/`) | 会话记忆(Chainlit SQLite) + 长期事实(JSON) |
| 知识库 | `/data/docs/` + 自动生成索引 | 简历/项目文档/代码摘要 |
| 反向代理 | nginx | 路径路由 + 静态简历页 |
| 部署 | docker compose | 三个容器 |

## 入口

- `/` — 公开侧(猎头/HR)：Chainlit 问答 + 静态简历页
- `/admin/` — 管理侧(仅主人)：密码登录，上传简历/代码/文档，喂 Agent 消化

权限模型：公开侧 agent **只读**（无写工具，prompt 层再声明一次）；管理侧才有写工具（上传、重建索引、写记忆）。

## 目录

```
job-agent-site/
├── docker-compose.yml     # public / admin / nginx 三服务
├── .env.example           # LLM key + admin 密码
├── nginx/default.conf     # / -> public, /admin/ -> admin
├── data/                  # 持久化: docs/ memory/ chainlit db
├── app/
│   ├── Dockerfile
│   ├── entrypoint.py      # 按 SIDE 启动 chainlit public.py|admin.py
│   ├── common/
│   │   ├── config.py      # env 读取
│   │   ├── kb.py          # 文档摄取(README/MD/代码摘要/PDF/DOCX)+索引
│   │   ├── memory.py      # 文件式长期记忆
│   │   ├── tools.py       # agent 工具(读=公开+管理, 写=仅管理)
│   │   └── agent.py       # Agents SDK Runner 封装
│   ├── public.py          # 公开侧 Chainlit app
│   └── admin.py           # 管理侧 Chainlit app (password auth)
└── app/public-static/     # 静态简历页(nginx 直接 serve)
```

## 快速开始

```bash
cp .env.example .env      # 填 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL / ADMIN_PASSWORD
docker compose up -d --build
# 公开侧: http://<host>:8090/
# 管理侧: http://<host>:8090/admin/
```

## 记忆系统设计

1. **会话记忆** — Chainlit 自带 per-thread 历史（SQLite, `data/chainlit/`），agent 每轮带入最近对话。
2. **长期记忆** — `data/memory/facts.json`：管理侧 agent 可提炼事实（求职方向、目标公司、口径红线如“薪资面议”），公开侧只读注入 system prompt。
3. **知识库索引** — `data/docs/index.json`：上传文档摄取后生成分块摘要，公开侧通过 `search_knowledge` 检索。

## 安全说明

- 公开侧无写工具、无文件系统工具、prompt 明确“只介绍、不修改、不透露主人隐私外的内部文档原文”。
- 管理侧用 Chainlit `password_auth_callback`，密码在 `.env`。
- 上传文件白名单：md/txt/pdf/docx/代码常见后缀，≤10MB。
