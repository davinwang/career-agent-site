# 发布文案（按平台使用）

## 掘金 / V2EX / 即刻（中文稿）

标题：**我把求职这件事反过来做了：候选人也有自己的 AI Agent（开源自托管）**

正文：

现在招聘市场的 AI 几乎全站在企业侧：Sourcing 机器人、ATS 关键词过滤、面试官 Copilot。候选人手里只有一份投出去就过时的静态 PDF。

我把自己的求职系统开源了：**career-agent-site** —— 两个共享同一份在线简历数据的 AI Agent。

**猎头端（公开）**：访问者直接和"候选人代表 Agent"对话，问经历、问项目、问匹配度。答案实时来自线上简历库，永不过时。这个 Agent 被强制只读（工具注册层面限制，不是靠 prompt），配了防提示注入、防源码套取、防隐私打探三层护栏。

**管理端（求职导师）**：没有表单，对话即工作台。上传粗糙旧简历→差距诊断；丢 git 仓库地址→自动分析源码提炼简历条目；中英双语自动同步；乃至转型路径规划（我本人 21 年金融 IT 架构师转 AI 架构）和"要不要准备英文简历"这种导师该主动提的事。

技术栈：Node22 + Hono + Mastra + libSQL，React 19 双前端，AG-UI SSE 流式（工具调用可视化），PDFKit 中文字体导出，GitHub 凭证 AES-256-GCM 加密。四个容器 docker compose 一键起。

GitHub：https://github.com/davinwang/career-agent-site
Live 演示（猎头端）：https://aboutme.davin.wang

求 star，更求 issue 里聊"候选人主权"这个方向还能怎么长。Roadmap 里已经排了面试模拟器和候选人可携带职业数据。

---

## Show HN（英文稿）

**Title**: Show HN: Career-agent-site – a self-hosted AI mentor and recruiter-facing agent sharing one live résumé

**Body**:

AI in recruiting mostly serves the buyer side — sourcing bots, ATS filters, interviewer copilots. Candidates still have a static PDF. I built the other side of that table and open-sourced it.

It's two agents over one living résumé database:

- A **public recruiter-facing agent**: visitors chat with "the candidate's representative". It answers from live data, never oversells, and is read-only at the tool-registry level (not by prompt) with guardrails against prompt injection, source-code exfiltration, and privacy fishing.
- A **career-mentor agent** (admin): no forms — everything happens in conversation. Upload a rough résumé, it diagnoses gaps. Drop a git URL, it clones and distills the repo into résumé entries (PAT stored AES-256-GCM encrypted). It syncs zh/en versions, advises on career transitions, and asks the things a good mentor would ("targeting foreign firms? let's prep an English résumé").

Stack: Node/Hono + Mastra, React 19, libSQL (single-file SQLite), AG-UI SSE with visible tool calls. Four containers, docker compose up, fully self-hosted — your career data never touches a third-party ATS.

Demo (the live recruiter portal): https://aboutme.davin.wang
Code: https://github.com/davinwang/career-agent-site

Interesting failure modes I hit: keeping the recruiter agent honest without making it useless, and designing guardrails that don't leak their own rules. Happy to answer questions about the Mastra tool architecture or the read-only enforcement.

---

## 发布节奏建议

1. 先发 V2EX（分享创造节点）+ 即刻，看初始反馈，修掉低级问题
2. 24h 后发掘金（带截图），同天或次日发 Show HN（工作日上午美东时间发，即北京晚上 21:00-24:00，周中最佳）
3. 每个帖子都放 GitHub 链接第一位，Live demo 第二位
4. 有评论 1 小时内回复——HN 首页算法极度看重发帖后第一小时的互动密度
