import type { ResumeData } from '../types/resume';

/**
 * Offline fallback dossier.
 *
 * Only used when `GET /api/resume/:lang` is unreachable (backend not running,
 * CORS blocked, no row for that language). It keeps the page reviewable and
 * never blank; the UI discloses that it is showing sample content.
 */

const zh: ResumeData = {
  name: '王栋',
  status: '在业看机会 · 上海 · 架构师',
  tags: [
    '架构师',
    '金融科技',
    '21年经验',
    'AI/Agent工程',
    'LLM应用架构',
    'Python/FastAPI',
    '数据工程与流水线',
    '时空数据可视化',
    'K8s/DevOps',
  ],
  summary:
    '21年软件研发与团队管理经验，兼具计算机、项目管理与金融会计背景的复合型技术负责人。现任国泰君安期货系统开发岗，主导投资管理系统、机构客户服务网站、自研App等多个核心系统的架构规划与重构，从0到1构建DevOps体系与K8s容器云平台，推动信创改造与LLM在金融场景的落地；近两年个人独立交付多个 AI/Agent 与数据工程实战项目，覆盖 Agent 系统设计、MCP 只读工具出口、研报事实核查与可信度闭环、知识库检索、大规模非结构化数据流水线与AI辅助研发范式。擅长高性能计算优化、金融业务建模、AI工程化落地与团队梯队建设。',
  experience: [
    {
      company: '国泰君安期货有限公司',
      role: '系统开发岗（技术架构）',
      period: '2020.04 - 至今',
      highlights: [
        '主导多项目系统架构统一与核心系统原型设计及技术转移，推动投资管理系统、资管网站、公司官网等项目架构升级与重构。',
        '优化基金分析计算性能：1000余只基金处理时间从4-8小时缩短至3-5分钟，整体效率提升超100倍。',
        '从0到1构建DevOps体系与K8s容器云平台，实现开发、测试、部署全流程自动化，CI/CD覆盖率接近100%。',
        '探索信创技术路线及大语言模型（LLM）在金融场景的应用，完成技术选型、验证与试点落地。',
      ],
    },
    {
      company: '珠海横琴极盛科技有限公司',
      role: '高级开发经理',
      period: '2018.03 - 2020.03',
      highlights: [
        '为国盛证券提供技术支撑，主导行情监控、交易App后端等核心系统的架构设计与团队管理。',
        '设计自研桥接组件替代供应商C++柜台交易接口，将复杂交易逻辑转化为轻量级Lua脚本。',
        '研发高可用高并发行情监控与股价预警系统，支持沪深两市超6000只股票实时行情监控。',
      ],
    },
    {
      company: '微软（中国）有限公司',
      role: '产品经理',
      period: '2013.01 - 2015.07',
      highlights: [
        '在微软Commerce部门支付团队，对接各业务部门支付需求，全程管理开发测试上线。',
        '参与Xbox One上市在线预售项目，推动信用卡预授信支付方式落地，将预售时间提前8天。',
      ],
    },
    {
      company: '思爱普（北京）软件系统有限公司（SAP中国研究院）',
      role: '开发团队负责人 / Scrum Master',
      period: '2007.12 - 2013.01',
      highlights: [
        '任职于EPM部门，熟悉FI/CO、HANA及BPC等模块，精通Scrum敏捷开发流程与规范。',
        '带领团队完成 HANA Based Analytics 与 Customer Analytics 产品的需求分析、架构设计到开发测试全流程。',
      ],
    },
  ],
  projects: [
    {
      name: '股票研报聚合与AI研判平台',
      role: '独立完成 · 架构设计与全栈实现',
      period: '2025 - 2026',
      content: [
        '覆盖 A股个股 + 指数 + 股指期货(IF/IH/IC/IM) + 股指期权(IO/MO/HO) 的投研数据聚合与 AI 辅助研判平台。',
        '18+ 数据源适配器统一封装重试/退避、限流、幂等 upsert 与新鲜度打标，单源失效可降级。',
        '零外部中间件：SQLite(WAL) 替代独立 DB、进程内 TTL 缓存替代 Redis、SSE 自建实时通道。',
        '同进程挂载只读 MCP（Streamable HTTP）：13 个只读工具开放给 Claude Code、Cursor 等 AI 客户端。',
      ],
      highlights: [
        '独立交付三阶段可上线可扩展平台，聚合行情、研报、财务、资金流、情绪与可执行信号于一处。',
        '每一项数据均标注来源与数据日期（新鲜度徽标），可追溯、可合规审计。',
      ],
      open_source: false,
    },
    {
      name: 'Wiki 时空地图（wiki-spatial-map）',
      role: '独立完成 · 数据工程与全栈可视化',
      period: '2024.09 - 2025.02',
      content: [
        '从 Wikipedia 全量 dump 抽取 100GB 级历史时空事件，构建可按时间轴回放的历史地理可视化系统。',
        '"规则 + 小模型 + LLM" 混合抽取管线，FastText 分类 + 多供应商 LLM 抽取，成本可控。',
        '断点续传与幂等：按语言/批次持久化 checkpoint，data_version + schema_version 双版本管理。',
      ],
      highlights: [
        '独立打通数据抽取、存储到前后端可视化全链路，配套 30+ 运维脚本。',
        '验证了 100GB 级公开语料低成本结构化的可行路径。',
      ],
      demo_link: 'https://wikimap.davin.wang',
      repo_link: 'https://github.com/davinwang/wiki-spatial-map',
      open_source: true,
    },
    {
      name: '个人求职 Agent 网站（job-agent-site）',
      role: '架构与全栈 · Agent 系统',
      period: '2026',
      content: [
        '面向单人的简历 + 项目 + 代码问答系统：公开端供招聘方自助问答，管理端向 Agent 投喂简历、代码与文档。',
        '权限模型下沉到工具层：公开端只装配只读工具，写工具仅存在于管理端，与提示词约束形成双重防御。',
        '全量可插拔 LLM：OpenAI Agents SDK + 任意 OpenAI 兼容端点，避免供应商锁定。',
      ],
      highlights: [
        '把"投递简历"升级为"可对话的个人能力接口"，招聘方自助问答减少重复沟通。',
        '项目本身大量使用 AI 辅助（Vibe）Coding —— "用 Agent 构建 Agent 系统"的活样板。',
      ],
      demo_link: 'https://aboutme.davin.wang',
      repo_link: 'https://github.com/davinwang/job-agent-site',
      open_source: true,
    },
    {
      name: '低代码 AI 辅助编程改造',
      role: 'VS Code 插件 · 独立交付',
      period: '2025.09 - 2026.04',
      content: [
        '将过时内部低代码平台改造为适配 AI 辅助编程的开发环境：语法高亮、Lint、代码补全、服务端通信、Agent Skill。',
        '项目自身 99% 代码通过 Vibe Coding 完成，半年内迭代 100+ 次。',
      ],
      highlights: ['直接提升低代码开发效率 20%–100%，覆盖不少于 50 人，年节约成本约 200 万元。'],
      open_source: false,
    },
  ],
  skills: {
    架构与性能: [
      '高可用/高并发系统架构',
      '分布式部署',
      '多项目架构统一与重构',
      '全链路性能规划',
      'numpy/pandas 向量化优化',
    ],
    'AI与Agent': [
      'LLM金融场景落地',
      'Agent系统架构与工具权限分层',
      'MCP(Streamable HTTP)只读工具出口',
      '知识库摄取与检索(RAG)',
      'LangChain',
      'Dify',
      'Vibe Coding',
    ],
    数据工程: [
      '大规模非结构化数据流水线',
      'FastText 文本分类',
      '断点续传与数据版本管理',
      'MongoDB / GeoJSON / 2dsphere',
    ],
    后端与数据: ['Python(FastAPI)', 'Java', 'C++', 'Lua', 'Redis', 'Kafka', 'SQLite(WAL)', 'ISO8583'],
    前端与可视化: ['React 18', 'TypeScript', 'Vite', 'Ant Design v5', 'ECharts 5', 'Leaflet', 'Zustand'],
    运维与平台: ['Docker/docker-compose', 'Kubernetes', 'Rancher', 'GitLab CI/CD', 'Nexus/Helm', 'EFK', 'nginx'],
    金融业务: ['期货/期权/基金投资管理', '股指期货基差与期限结构', '期权PCR', '绩效指标(Calmar/Sharpe/IR/Sortino)'],
    证书: ['软件设计师', 'CSM敏捷项目管理专家', '期货从业资格证', '大学英语六级'],
  },
  education: [
    { school: '上海交通大学', degree: '硕士', field: '会计学', period: '2010 - 2013' },
    { school: '上海交通大学', degree: '本科', field: '金融学', period: '2002 - 2005' },
    { school: '上海交通大学', degree: '本科', field: '计算机科学与技术（试点班）', period: '2001 - 2005' },
  ],
};

const en: ResumeData = {
  name: 'Wang Dong (Davin)',
  status: '21 years of experience · Targeting Architect roles · Shanghai · Open to opportunities',
  tags: [
    'System Architecture',
    'FinTech',
    'DevOps / CI-CD',
    'K8s Container Cloud',
    'LLM / Agent',
    'Futures & Securities',
    'Payment & Clearing',
    'Team Management',
  ],
  summary:
    'A hybrid technical professional combining software engineering, project management and finance/accounting. 21 years of experience spanning ICBC Head Office, SAP China Research Institute, Microsoft China, and the payment-clearing and securities/futures industries. Skilled at building high-availability systems and DevOps/K8s container-cloud platforms from scratch; compressed metric computation for 1,000+ funds from 4–8 hours to 3–5 minutes (100x+ gain). Recently focused on domestic-tech transformation and applying LLM/Agent to financial scenarios, independently delivering several AI/Agent and data-engineering projects.',
  experience: [
    {
      company: 'Guotai Junan Futures Co., Ltd.',
      role: 'System Development (Architect)',
      period: '2020.04 – Present',
      highlights: [
        'Led technical architecture planning and system design; drove build-out and refactoring of the investment management system, the institutional client website and the in-house App.',
        'Optimized fund analysis performance, cutting processing time for 1,000+ funds from 4–8 hours to 3–5 minutes — a 100x+ efficiency gain.',
        'Built the DevOps system and K8s container-cloud platform from scratch with CI/CD coverage approaching 100%.',
        'Explored domestic-tech paths and LLM application in financial scenarios through to pilot deployment.',
      ],
    },
    {
      company: 'Zhuhai Hengqin Jisheng Technology Co., Ltd.',
      role: 'Senior Development Manager',
      period: '2018.03 – 2020.03',
      highlights: [
        'Led architecture design and R&D team management for market-data monitoring and trading App backend at Guosheng Securities.',
        'Designed an in-house bridging component replacing the vendor C++ counter interface, converting trading logic into lightweight Lua scripting.',
        'Built a high-concurrency market-data alert system covering 6,000+ stocks with distributed deployment capability.',
      ],
    },
    {
      company: 'Microsoft (China) Co., Ltd.',
      role: 'Product Manager',
      period: '2013.01 – 2015.07',
      highlights: [
        'Coordinated payment requirements across business units in the Commerce division, managing development, testing and launch end to end.',
        'Advanced the Xbox One pre-order date by eight days to match the E3 cadence via a pre-authorized credit payment method.',
      ],
    },
    {
      company: 'SAP China Research Institute',
      role: 'Development Team Lead / Scrum Master',
      period: '2007.12 – 2013.01',
      highlights: [
        'Led the EPM development team across FI/CO, HANA and BPC modules with full Scrum practice ownership.',
        'Delivered HANA Based Analytics and Customer Analytics products from requirements through to test hand-off.',
      ],
    },
  ],
  projects: [
    {
      name: 'Equity Research Aggregation & AI Analysis Platform',
      role: 'Independent Delivery · Architecture & Full-stack',
      period: '2025 – 2026',
      content: [
        'Investment-research data aggregation and AI-assisted analysis platform covering A-share equities, indices, stock index futures (IF/IH/IC/IM) and options (IO/MO/HO).',
        '18+ data-source adapters with unified retry/backoff, rate limiting, idempotent upsert and freshness tagging — any single source can fail without breaking the system.',
        'Zero external middleware: SQLite (WAL), in-process TTL cache and a self-built thread-safe SSE channel — the full stack runs on one machine.',
        'Same-process read-only MCP (Streamable HTTP) exposing 13 tools to Claude Code, Cursor and other AI clients.',
      ],
      highlights: [
        'Shipped an extensible three-phase platform aggregating quotes, reports, financials, fund flows, sentiment and actionable signals in one place.',
        'Every item annotated with data source and data date for traceability and compliance.',
      ],
      open_source: false,
    },
    {
      name: 'Wiki Spatial Map',
      role: 'Independent Delivery · Data Engineering & Visualization',
      period: '2024.09 – 2025.02',
      content: [
        'Extracted 100GB-scale historical spatiotemporal events from full Wikipedia dumps into a timeline-replayable historical geography system.',
        'Hybrid "rules + small models + LLM" extraction pipeline with FastText classification and multi-vendor LLM extraction.',
        'Resumable and idempotent: per-language/batch checkpoints with dual data_version + schema_version versioning.',
      ],
      highlights: [
        'Delivered the full chain from extraction and storage to front/back-end visualization solo, with 30+ ops scripts.',
        'Validated a low-cost path to structuring 100GB-scale public corpora.',
      ],
      demo_link: 'https://wikimap.davin.wang',
      repo_link: 'https://github.com/davinwang/wiki-spatial-map',
      open_source: true,
    },
    {
      name: 'Personal Job-Agent Website',
      role: 'Architecture & Full-stack · Agent System',
      period: '2026',
      content: [
        'A résumé + project + code Q&A system for one person: recruiters self-serve questions on the public side while the admin side feeds the Agent with résumés, code and documents.',
        'Permissions pushed into the tool layer: the public side only receives read-only tools, forming a double defence with prompt-level constraints.',
        'Fully pluggable LLM: OpenAI Agents SDK with any OpenAI-compatible endpoint — no vendor lock-in.',
      ],
      highlights: [
        'Upgrades "submitting a résumé" into "a conversational interface to personal capabilities".',
        'The project itself is built heavily with AI-assisted (Vibe) Coding — building an Agent system with Agents.',
      ],
      demo_link: 'https://aboutme.davin.wang',
      repo_link: 'https://github.com/davinwang/job-agent-site',
      open_source: true,
    },
    {
      name: 'Low-Code AI-Assisted Programming Modernization',
      role: 'VS Code Extension · Independent Delivery',
      period: '2025.09 – 2026.04',
      content: [
        'Replaced an outdated internal low-code platform with a VS Code extension suited to AI-assisted programming: syntax highlighting, linting, completion, server communication and Agent Skills.',
        '99% of the code written via Vibe Coding, with 100+ iterations in six months.',
      ],
      highlights: [
        'Improved developer productivity by 20%–100% for 50+ users, saving roughly RMB 2 million per year.',
      ],
      open_source: false,
    },
  ],
  skills: {
    'Architecture & Performance': [
      'High-availability / high-concurrency design',
      'Distributed deployment',
      'Multi-project architecture unification',
      'Full-link performance planning',
      'numpy/pandas vectorization',
    ],
    'AI & Agent': [
      'LLM in financial scenarios',
      'Agent architecture & tool permission layering',
      'MCP (Streamable HTTP) read-only tools',
      'Knowledge-base ingestion & retrieval (RAG)',
      'LangChain',
      'Dify',
      'Vibe Coding',
    ],
    'Data Engineering': [
      'Large-scale unstructured data pipelines',
      'FastText text classification',
      'Checkpointing & data versioning',
      'MongoDB / GeoJSON / 2dsphere',
    ],
    'Backend & Data': ['Python (FastAPI)', 'Java', 'C++', 'Lua', 'Redis', 'Kafka', 'SQLite (WAL)', 'ISO8583'],
    'Frontend & Visualization': ['React 18', 'TypeScript', 'Vite', 'Ant Design v5', 'ECharts 5', 'Leaflet', 'Zustand'],
    'Platform & Ops': ['Docker / docker-compose', 'Kubernetes', 'Rancher', 'GitLab CI/CD', 'Nexus / Helm', 'EFK', 'nginx'],
    'Financial Domain': [
      'Futures / options / fund investment management',
      'Index futures basis & term structure',
      'Option PCR',
      'Calmar / Sharpe / IR / Sortino',
    ],
    Certifications: ['Software Designer', 'CSM (Certified Scrum Master)', 'Futures Practitioner', 'CET-6'],
  },
  education: [
    { school: 'Shanghai Jiao Tong University', degree: 'M.S.', field: 'Accounting', period: '2010 – 2013' },
    { school: 'Shanghai Jiao Tong University', degree: 'B.S.', field: 'Finance', period: '2002 – 2005' },
    {
      school: 'Shanghai Jiao Tong University',
      degree: 'B.S.',
      field: 'Computer Science (Pilot Class)',
      period: '2001 – 2005',
    },
  ],
};

export const SAMPLE_RESUMES: Record<string, ResumeData> = { zh, en };
