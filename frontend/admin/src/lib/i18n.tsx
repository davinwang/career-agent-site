/**
 * Lightweight zh/en UI i18n — no external deps.
 *
 * - `I18nProvider` + `useT()` for React components.
 * - `t()` plain function for non-React modules (api layer, etc.).
 * - Language persisted in localStorage under `ui-lang`; defaults to zh when
 *   navigator.language starts with "zh", otherwise en.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UiLang = "zh" | "en";

const STORAGE_KEY = "ui-lang";

/* ------------------------------ dictionary ------------------------------- */

const zh = {
  common: {
    loading: "加载中",
    close: "关闭",
    retry: "重试",
    unnamed: "未命名",
    private: "私有",
    current: "当前",
    backToList: "← 返回列表",
    preview: "预览",
    download: "下载",
    del: "删除",
  },
  login: {
    title: "求职导师 Agent",
    subtitle: "Admin Console · 管理端登录",
    username: "用户名",
    password: "密码",
    submit: "登 录",
    submitting: "登录中…",
    errRequired: "请输入用户名和密码",
    errInvalid: "用户名或密码错误，或后端服务不可用",
    footer: "仅限候选人本人访问 · 受 JWT 保护",
    or: "或",
    guest: "游客进入",
    guestEntering: "进入中…",
    guestHint: "只读模式：可浏览，不能对话或修改任何内容",
    errGuest: "游客模式未开启或服务不可用",
  },
  nav: {
    dashboard: "概览",
    dashboardHint: "Dashboard",
    chat: "助手",
    chatHint: "Agent Chat",
    sessions: "会话",
    sessionsHint: "Sessions",
    mainNav: "主导航",
    menu: "Menu",
    status: "Status",
    connected: "管理端已连接",
    expandSidebar: "展开侧边栏",
    collapseSidebar: "收起侧边栏",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
    logout: "退出登录",
    adminTitle: "管理端",
    chatTitle: "Career Mentor",
    sessionsTitle: "Recruiter Sessions",
  },
  dashboard: {
    loading: "加载概览数据…",
    offline: "后端服务暂不可用，以下为占位视图。请确认 API 已启动。",
    atAGlance: "概览",
    resumeLangs: "简历语言",
    resumeLangsSub: "暂无",
    knowledgeDocs: "知识库文档",
    knowledgeSub: "已入库文件",
    projects: "项目",
    projectsSub: (n: number) => `${n} 已分析`,
    sessions: "猎头会话",
    sessionsSub: "累计对话",
    quickActions: "快捷操作",
    uploadDocs: "上传文档",
    addProject: "添加项目",
    viewResume: "查看简历",
    projectsByStatus: "项目状态",
    recentSessions: "最近猎头会话",
    recentSessionsEn: "Recent recruiter sessions",
    viewAll: "查看全部 →",
    noSessions: "暂无猎头会话",
    createdAt: "创建于",
    justNow: "刚刚",
    minsAgo: (n: number) => `${n} 分钟前`,
    hoursAgo: (n: number) => `${n} 小时前`,
    daysAgo: (n: number) => `${n} 天前`,
  },
  sessions: {
    title: "猎头会话",
    titleEn: (n: number) => `${n} recruiter session(s)`,
    searchPlaceholder: "按会话 ID 或日期筛选…",
    loading: "加载会话…",
    loadingTranscript: "加载对话记录…",
    empty: "暂无猎头会话",
    emptyHint: "当猎头开始对话后会在此显示",
    noMatch: "无匹配会话",
    created: "创建",
    active: "活跃",
    readonly: "只读",
    pickOne: "选择左侧会话查看对话记录",
    noMessages: "该会话暂无消息",
    loadFailed: "加载会话失败",
    loadMsgsFailed: "加载消息失败",
    showEmpty: (n: number) => `显示 ${n} 个空会话`,
    hideEmpty: "隐藏空会话",
    you: "猎",
  },
  github: {
    title: "GitHub 凭证",
    subtitle: "Credential hosting & account binding",
    loading: "加载 GitHub 状态…",
    loadFailed: "加载失败",
    currentStatus: "当前状态",
    patHosted: "已托管",
    patMissing: "未托管",
    oauthBound: (login: string) => `已绑定 @${login}`,
    oauthMissing: "未绑定",
    activeAccount: (user: string, source: string) => `生效账号 @${user}（${source}）`,
    fetchRepos: "拉取仓库列表",
    clearAll: "清除全部凭证",
    noRepos: "该凭证可见 0 个仓库",
    patTitle: "方式一 · 托管 PAT",
    patHelp: "在 GitHub → Settings → Developer settings → Fine-grained tokens 创建仅含 repo 权限的 token，粘贴到此处。凭证以 AES-256-GCM 加密存储，仅用于拉取你的项目仓库。",
    patSave: "验证并托管",
    oauthTitle: "方式二 · 绑定 GitHub 账号",
    oauthHelp: "通过 GitHub OAuth 授权（官方授权码流程）。需要服务端配置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET。",
    oauthBind: "使用 GitHub 登录绑定",
    unbind: "解绑",
    boundOk: (login: string) => `GitHub 账号 @${login} 绑定成功`,
    boundFail: (err: string) => `GitHub 绑定失败：${err}`,
    patSaved: (login: string) => `PAT 已验证并托管（账号 @${login}）`,
    credsCleared: "已清除托管的 GitHub 凭证",
    oauthUnbound: "已解绑 GitHub 账号",
    saveFailed: "保存失败",
    deleteFailed: "删除失败",
    unbindFailed: "解绑失败",
    oauthStartFailed: "无法发起 GitHub 授权",
    reposFailed: "获取仓库失败",
  },
  oauth: {
    boundOk: (login: string) => `✓ GitHub @${login} 绑定成功`,
    boundFail: (err: string) => `绑定失败：${err}`,
    backIn: (n: number) => `${n} 秒后返回管理端…`,
    processing: "处理 GitHub 授权回调…",
  },
  chat: {
    brand: "求职导师 · Career Mentor",
    sessions: "会话",
    sessionList: "会话列表",
    noHistory: "暂无历史会话",
    newChat: "＋ 新建对话",
    creating: "创建中…",
    emptyTitle: "（空对话）",
    emptyUnreadable: "（无法读取）",
    artifactsTitle: "对话产出 · 归档",
    artifactsHint: "简历、材料、项目、技能卡都存放在这里",
    archives: "归档内容 · Archives",
    pendingGen: "待生成",
    artifactsFooter: "所有成果均由对话生成 · 点击卡片查看，修改请回到对话",
    closeDetail: "关闭详情",
    loadingShort: "加载中…",
    emptyWelcome: "和你的求职导师聊聊",
    emptyHint: "上传简历、补充材料、分析项目、规划转型 —— 一切通过对话完成，产出在上方的「对话产出 · 归档」里。",
    stop: "停止",
    loadingHistory: "加载历史消息…",
    uploadNoteImage: (name: string, stored: string) =>
      `我上传了图片「${name}」（已存储为 ${stored}）。如果适合作为简历/公司 logo 照片，请把它设置到简历 photo 字段（用 /uploads/${stored}）。`,
    uploadNoteFile: (name: string, stored: string) =>
      `我上传了文件「${name}」（已存储为 ${stored}），请用 ingestFile 解析并纳入知识库。`,
    uploadFailed: "文件上传失败",
    suggestion1: "我有一份旧简历，先给你看看哪里需要更新",
    suggestion2: "帮我分析一个项目的源码仓库，提炼简历条目",
    suggestion3: "我想往 AI 架构方向转型，帮我评估和规划",
    me: "我",
    guestBanner: "当前以游客身份浏览（只读）：可查看归档内容和历史记录，不能与助手对话、上传或修改任何内容。",
  },
  input: {
    guestPlaceholder: "游客模式为只读，无法与助手对话",
    placeholder: "输入消息，Enter 发送 / Shift+Enter 换行…（也可直接拖入文件）",
    referenceTitle: "引用已上传的附件",
    closePicker: "关闭引用选择",
    noUploads: "还没有上传过附件（图片等直接上传的文件不在此列表）",
    refBadge: "引",
    dropToUpload: "松开以上传附件",
    attach: "添加附件",
    uploadFile: "上传文件",
    reference: "引用已上传的附件",
    send: "发送",
  },
  artifacts: {
    resume: "简历",
    resumeEn: "Resume",
    docs: "材料",
    docsEn: "Docs",
    projects: "项目",
    projectsEn: "Projects",
    skills: "技能卡",
    skillsEn: "Skills",
    source: "源码",
    document: "文档",
    emptyProjects: "还没有项目，提供 git URL 或上传项目文档开始分析",
    askProject: "帮我分析一个项目",
    deleteProjectConfirm: (name: string) => `删除项目「${name}」？将同时删除项目库记录和克隆的仓库目录，此操作不可恢复。`,
    deleteProject: (name: string) => `删除项目 ${name}`,
    emptySkills: "还没有技能卡（提示词），让导师帮你配置猎头端行为",
    askSkills: "帮我配置猎头端的提示词技能",
    modifyHint: "修改请回到对话，例如「{q}」",
    emptyResumes: "还没有简历。上传一份 PDF 简历给导师开始。",
    newLangVersion: "+ 新语言版本",
    genEnResume: "请基于现有材料，为我生成/完善英文简历，保持与中文版内容一致。",
    uploadsTitle: (n: number) => `上传的原件 · ${n}`,
    deleteUploadConfirm: (name: string) => `删除原件「${name}」？已解析入知识库的内容会保留。`,
    deleteKnowledgeConfirm: (title: string) => `从知识库删除「${title}」？此操作不可恢复。`,
    downloadOriginal: (name: string) => `下载 ${name}`,
    deleteOriginal: (name: string) => `删除 ${name}`,
    uploadsNote: "删除仅移除原件文件，解析内容仍在知识库中。",
    emptyKnowledge: "还没有材料，上传 PDF / 文档 / 图片后自动入库",
    knowledgeModifyHint: "修改请回到对话，例如「帮我整理知识库材料」",
  },
  tool: {
    calling: "调用工具",
    running: "执行中…",
    noArgs: "（无参数）",
    noResult: "无返回结果",
  },
  resume: {
    summary: "个人简介",
    experience: "工作经历",
    projects: "项目经历",
    skills: "技能",
    education: "教育背景",
  },
  api: {
    networkDown: "网络连接失败，请检查后端服务是否在线",
    sessionExpired: "登录已过期，请重新登录",
    requestFailed: (status: number) => `请求失败 (${status})`,
    uploadFailed: (status: number) => `上传失败 (${status})`,
    uploadNetworkError: "上传失败：网络错误",
    agentFailed: (status: number) => `Agent 请求失败 (${status})`,
    agentError: "Agent 运行出错",
    agentUnreachable: "无法连接到 Agent 服务",
    newSessionFailed: "新建会话失败",
  },
  a11y: {
    uiLanguage: "切换界面语言",
  },
  appearance: {
    title: "外观设置",
    theme: "主题",
    style: "样式",
    light: "浅色",
    system: "跟随系统",
    dark: "深色",
    skinClassic: "经典报纸",
    skinModern: "现代简约",
    skinEmerald: "墨绿典雅",
  },
};

export type Dict = typeof zh;

const en: Dict = {
  common: {
    loading: "Loading",
    close: "Close",
    retry: "Retry",
    unnamed: "Untitled",
    private: "Private",
    current: "Current",
    backToList: "← Back",
    preview: "Preview",
    download: "Download",
    del: "Delete",
  },
  login: {
    title: "Career Mentor Agent",
    subtitle: "Admin Console · Sign in",
    username: "Username",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    errRequired: "Username and password are required",
    errInvalid: "Invalid credentials, or the backend is unreachable",
    footer: "Candidate only · JWT protected",
    or: "or",
    guest: "Enter as guest",
    guestEntering: "Entering…",
    guestHint: "Read-only: browse only — no chat, no changes",
    errGuest: "Guest mode is disabled or the service is unavailable",
  },
  nav: {
    dashboard: "Dashboard",
    dashboardHint: "At a glance",
    chat: "Mentor",
    chatHint: "Agent Chat",
    sessions: "Sessions",
    sessionsHint: "Sessions",
    mainNav: "Main navigation",
    menu: "Menu",
    status: "Status",
    connected: "Admin connected",
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    logout: "Sign out",
    adminTitle: "Admin",
    chatTitle: "Career Mentor",
    sessionsTitle: "Recruiter Sessions",
  },
  dashboard: {
    loading: "Loading overview…",
    offline: "Backend unreachable — showing a placeholder view. Check that the API is running.",
    atAGlance: "At a glance",
    resumeLangs: "Resume languages",
    resumeLangsSub: "None",
    knowledgeDocs: "Knowledge docs",
    knowledgeSub: "Ingested files",
    projects: "Projects",
    projectsSub: (n: number) => `${n} analyzed`,
    sessions: "Recruiter sessions",
    sessionsSub: "All-time conversations",
    quickActions: "Quick actions",
    uploadDocs: "Upload docs",
    addProject: "Add project",
    viewResume: "View résumé",
    projectsByStatus: "Projects by status",
    recentSessions: "Recent recruiter sessions",
    recentSessionsEn: "Recent recruiter sessions",
    viewAll: "View all →",
    noSessions: "No recruiter sessions yet",
    createdAt: "Created",
    justNow: "just now",
    minsAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} h ago`,
    daysAgo: (n: number) => `${n} d ago`,
  },
  sessions: {
    title: "Recruiter sessions",
    titleEn: (n: number) => `${n} recruiter session(s)`,
    searchPlaceholder: "Filter by session ID or date…",
    loading: "Loading sessions…",
    loadingTranscript: "Loading transcript…",
    empty: "No recruiter sessions yet",
    emptyHint: "They will appear here once a recruiter starts chatting",
    noMatch: "No matching sessions",
    created: "Created",
    active: "Active",
    readonly: "Read-only",
    pickOne: "Pick a session on the left to view its transcript",
    noMessages: "No messages in this session",
    loadFailed: "Failed to load sessions",
    loadMsgsFailed: "Failed to load messages",
    showEmpty: (n: number) => `Show ${n} empty session(s)`,
    hideEmpty: "Hide empty sessions",
    you: "R",
  },
  github: {
    title: "GitHub credentials",
    subtitle: "Credential hosting & account binding",
    loading: "Loading GitHub status…",
    loadFailed: "Load failed",
    currentStatus: "Current status",
    patHosted: "hosted",
    patMissing: "not hosted",
    oauthBound: (login: string) => `bound @${login}`,
    oauthMissing: "not bound",
    activeAccount: (user: string, source: string) => `Active account @${user} (${source})`,
    fetchRepos: "Fetch repos",
    clearAll: "Clear all credentials",
    noRepos: "0 repos visible to these credentials",
    patTitle: "Option 1 · Host a PAT",
    patHelp: "Create a fine-grained token with the repo permission under GitHub → Settings → Developer settings → Fine-grained tokens, then paste it here. Stored AES-256-GCM encrypted, used only to pull your project repos.",
    patSave: "Verify & host",
    oauthTitle: "Option 2 · Bind a GitHub account",
    oauthHelp: "Authorize via GitHub OAuth (official code flow). Requires server-side GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET.",
    oauthBind: "Bind with GitHub",
    unbind: "Unbind",
    boundOk: (login: string) => `GitHub account @${login} bound`,
    boundFail: (err: string) => `GitHub binding failed: ${err}`,
    patSaved: (login: string) => `PAT verified and hosted (account @${login})`,
    credsCleared: "Hosted GitHub credentials cleared",
    oauthUnbound: "GitHub account unbound",
    saveFailed: "Save failed",
    deleteFailed: "Delete failed",
    unbindFailed: "Unbind failed",
    oauthStartFailed: "Could not start GitHub authorization",
    reposFailed: "Failed to fetch repos",
  },
  oauth: {
    boundOk: (login: string) => `✓ GitHub @${login} bound`,
    boundFail: (err: string) => `Binding failed: ${err}`,
    backIn: (n: number) => `Back to admin in ${n}s…`,
    processing: "Processing GitHub OAuth callback…",
  },
  chat: {
    brand: "Career Mentor",
    sessions: "Sessions",
    sessionList: "Session list",
    noHistory: "No past sessions",
    newChat: "＋ New chat",
    creating: "Creating…",
    emptyTitle: "(empty)",
    emptyUnreadable: "(unreadable)",
    artifactsTitle: "Artifacts · Archive",
    artifactsHint: "Résumés, docs, projects and skill cards live here",
    archives: "Archives",
    pendingGen: "Empty",
    artifactsFooter: "Everything here was produced in conversation · click a card to view; go back to the chat to edit",
    closeDetail: "Close details",
    loadingShort: "Loading…",
    emptyWelcome: "Chat with your career mentor",
    emptyHint: "Upload a résumé, add documents, analyze projects, plan a pivot — all through conversation; outputs land in the archive above.",
    stop: "Stop",
    loadingHistory: "Loading history…",
    uploadNoteImage: (name: string, stored: string) =>
      `I uploaded an image "${name}" (stored as ${stored}). If it works as a résumé/company logo photo, set it into the résumé photo field (use /uploads/${stored}).`,
    uploadNoteFile: (name: string, stored: string) =>
      `I uploaded a file "${name}" (stored as ${stored}); please parse it with ingestFile and add it to the knowledge base.`,
    uploadFailed: "File upload failed",
    suggestion1: "I have an old résumé — first show me what needs updating",
    suggestion2: "Help me analyze a project's repo and distill résumé bullets",
    suggestion3: "I want to pivot toward AI architecture — help me assess and plan",
    me: "Me",
    guestBanner: "You are browsing as a guest (read-only): view archives and history, but chat, upload and edits are disabled.",
  },
  input: {
    guestPlaceholder: "Guest mode is read-only — chatting is disabled",
    placeholder: "Type a message — Enter to send / Shift+Enter for a new line… (or drop files here)",
    referenceTitle: "Reference uploaded files",
    closePicker: "Close reference picker",
    noUploads: "No uploads yet (images uploaded directly are not listed here)",
    refBadge: "Ref",
    dropToUpload: "Drop to upload",
    attach: "Add attachment",
    uploadFile: "Upload file",
    reference: "Reference uploaded files",
    send: "Send",
  },
  artifacts: {
    resume: "Résumé",
    resumeEn: "Résumé",
    docs: "Docs",
    docsEn: "Docs",
    projects: "Projects",
    projectsEn: "Projects",
    skills: "Skill cards",
    skillsEn: "Skills",
    source: "Source",
    document: "Doc",
    emptyProjects: "No projects yet — provide a git URL or upload project docs to start analysis",
    askProject: "help me analyze a project",
    deleteProjectConfirm: (name: string) => `Delete project \"${name}\"? This removes the library record and the cloned repo directory. This cannot be undone.`,
    deleteProject: (name: string) => `Delete project ${name}`,
    emptySkills: "No skill cards (prompts) yet — ask the mentor to configure recruiter-side behavior",
    askSkills: "help me configure recruiter-side prompt skills",
    modifyHint: "To edit, go back to the chat, e.g. \"{q}\"",
    emptyResumes: "No résumés yet. Upload a PDF résumé to get started.",
    newLangVersion: "+ New language version",
    genEnResume: "Based on the existing materials, generate/refine my English résumé, keeping it consistent with the Chinese version.",
    uploadsTitle: (n: number) => `Uploaded originals · ${n}`,
    deleteUploadConfirm: (name: string) => `Delete original "${name}"? Parsed content stays in the knowledge base.`,
    deleteKnowledgeConfirm: (title: string) => `Delete "${title}" from the knowledge base? This cannot be undone.`,
    downloadOriginal: (name: string) => `Download ${name}`,
    deleteOriginal: (name: string) => `Delete ${name}`,
    uploadsNote: "Deleting only removes the original file; parsed content remains in the knowledge base.",
    emptyKnowledge: "No documents yet — upload a PDF / doc / image and it is ingested automatically",
    knowledgeModifyHint: "To edit, go back to the chat, e.g. \"help me tidy the knowledge base\"",
  },
  tool: {
    calling: "Tool call",
    running: "Running…",
    noArgs: "(no arguments)",
    noResult: "No result returned",
  },
  resume: {
    summary: "Summary",
    experience: "Experience",
    projects: "Projects",
    skills: "Skills",
    education: "Education",
  },
  api: {
    networkDown: "Network request failed — check that the backend is online",
    sessionExpired: "Session expired, please sign in again",
    requestFailed: (status: number) => `Request failed (${status})`,
    uploadFailed: (status: number) => `Upload failed (${status})`,
    uploadNetworkError: "Upload failed: network error",
    agentFailed: (status: number) => `Agent request failed (${status})`,
    agentError: "Agent error",
    agentUnreachable: "Could not reach the agent service",
    newSessionFailed: "Failed to create a new session",
  },
  a11y: {
    uiLanguage: "Switch UI language",
  },
  appearance: {
    title: "Appearance",
    theme: "Theme",
    style: "Style",
    light: "Light",
    system: "System",
    dark: "Dark",
    skinClassic: "Classic",
    skinModern: "Modern",
    skinEmerald: "Emerald",
  },
};

export const DICTS: Record<UiLang, Dict> = { zh, en };

/* ------------------------------- state ---------------------------------- */

function detectLang(): UiLang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

let currentLang: UiLang = detectLang();

export function getLang(): UiLang {
  return currentLang;
}

export function setLang(l: UiLang): void {
  currentLang = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  }
}

/** Plain t() usable outside React — reads the module-level current language. */
export function t(path: string, arg?: string | number | ((a: any) => string), arg2?: string | number): string {
  if (typeof arg === "function") arg = arg(arg as any);
  return resolve(DICTS[currentLang], path, arg, arg2) ?? path;
}

function resolve(dict: unknown, path: string, arg?: string | number | ((a: any) => string), arg2?: string | number): string | undefined {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  if (typeof node === "function") {
    // Template helpers: (string) => string or (number) => string.
    return (node as (a: string, b: string) => string)(arg as never, arg2 as never);
  }
  if (typeof node === "string") {
    return arg !== undefined && typeof arg === "string" ? node.replace(/\{q\}/g, arg) : node;
  }
  return undefined;
}

/* ------------------------------- context -------------------------------- */

const I18nContext = createContext<{ lang: UiLang; setLanguage: (l: UiLang) => void }>({
  lang: currentLang,
  setLanguage: () => undefined,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setState] = useState<UiLang>(currentLang);

  useEffect(() => {
    setLang(lang);
  }, []); // sync <html lang> on mount

  const setLanguage = useCallback((l: UiLang) => {
    setLang(l);
    setState(l);
  }, []);

  const value = useMemo(() => ({ lang, setLanguage }), [lang, setLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the raw context: { lang, setLanguage } — used by the language switch. */
export function useI18n() {
  return useContext(I18nContext);
}

/** Translation hook: const t = useT(); t('login.title') */
export function useT(): ((path: string, arg?: string | number | ((a: any) => string), arg2?: string | number) => string) & { lang: UiLang } {
  const { lang } = useContext(I18nContext);
  const translate = useCallback((path: string, arg?: string | number | ((a: any) => string), arg2?: string | number) => resolve(DICTS[lang], path, arg, arg2) ?? path, [lang]);
  return Object.assign(translate, { lang });
}
