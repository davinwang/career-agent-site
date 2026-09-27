/**
 * UI chrome copy. The résumé itself comes from the API; everything around it
 * (labels, buttons, agent prompts) is translated here.
 */

export interface UiStrings {
  dir: 'ltr';
  masthead: {
    dossier: string;
    candidate: string;
    available: string;
    updated: string;
    offlineBadge: string;
    offlineHint: string;
  };
  sections: {
    summary: string;
    experience: string;
    projects: string;
    skills: string;
    education: string;
  };
  resume: {
    loading: string;
    loadingHint: string;
    failed: string;
    retry: string;
    openSource: string;
    closedSource: string;
    demo: string;
    repo: string;
    highlights: string;
    keyPoints: string;
    emptyProjects: string;
    present: string;
  };
  chat: {
    title: string;
    subtitle: string;
    online: string;
    offline: string;
    connecting: string;
    open: string;
    close: string;
    placeholder: string;
    placeholderBlocked: string;
    send: string;
    stop: string;
    clear: string;
    clearConfirm: string;
    thinking: string;
    streaming: string;
    welcomeTitle: string;
    welcomeBody: string;
    suggested: string;
    you: string;
    agent: string;
    errorTitle: string;
    errorBody: string;
    retry: string;
    historyFailed: string;
    footer: string;
    session: string;
  };
  a11y: {
    themeToggle: string;
    lightMode: string;
    darkMode: string;
    language: string;
    resumePanel: string;
    chatPanel: string;
    sendMessage: string;
    skipToChat: string;
  };
}

const zh: UiStrings = {
  dir: 'ltr',
  masthead: {
    dossier: '候选人档案',
    candidate: '候选人',
    available: '在业看机会',
    updated: '更新于',
    offlineBadge: '离线预览',
    offlineHint: '未能连接后端服务，当前展示内置示例档案。',
  },
  sections: {
    summary: '个人概述',
    experience: '工作经历',
    projects: '项目作品',
    skills: '技能矩阵',
    education: '教育背景',
  },
  resume: {
    loading: '正在加载档案',
    loadingHint: '读取简历数据中…',
    failed: '档案加载失败',
    retry: '重试',
    openSource: '开源',
    closedSource: '内部项目',
    demo: '在线演示',
    repo: '代码仓库',
    highlights: '成果亮点',
    keyPoints: '关键工作',
    emptyProjects: '暂无项目记录',
    present: '至今',
  },
  chat: {
    title: 'AI 招聘助手',
    subtitle: '就该候选人的经历、项目与技术栈随时提问',
    online: '在线',
    offline: '未连接',
    connecting: '连接中',
    open: '咨询 AI',
    close: '收起',
    placeholder: '输入你的问题…（Enter 发送 / Shift+Enter 换行）',
    placeholderBlocked: 'AI 正在回复中…',
    send: '发送',
    stop: '停止',
    clear: '新会话',
    clearConfirm: '开启新会话将清空当前对话记录，确定继续？',
    thinking: '正在思考',
    streaming: '正在回复',
    welcomeTitle: '你好，我是这位候选人的 AI 助手。',
    welcomeBody:
      '左侧是完整简历。你可以直接向我提问关于工作经历、项目细节、技术栈深度或求职意向的任何问题——我会基于候选人的真实档案与代码库作答。',
    suggested: '试试问我',
    you: '你',
    agent: 'AI 助手',
    errorTitle: '消息发送失败',
    errorBody: '无法连接到 AI 服务，请稍后重试。',
    retry: '重试',
    historyFailed: '历史记录加载失败',
    footer: '由 AG-UI 流式协议驱动 · 会话匿名保存于本机',
    session: '会话',
  },
  a11y: {
    themeToggle: '切换深浅色主题',
    lightMode: '浅色',
    darkMode: '深色',
    language: '切换简历语言',
    resumePanel: '候选人简历',
    chatPanel: 'AI 助手对话',
    sendMessage: '发送消息',
    skipToChat: '跳转到 AI 对话',
  },
};

const en: UiStrings = {
  dir: 'ltr',
  masthead: {
    dossier: 'Candidate Dossier',
    candidate: 'Candidate',
    available: 'Open to opportunities',
    updated: 'Updated',
    offlineBadge: 'Offline preview',
    offlineHint: 'Backend unreachable — showing the bundled sample dossier.',
  },
  sections: {
    summary: 'Profile',
    experience: 'Experience',
    projects: 'Selected Projects',
    skills: 'Skill Matrix',
    education: 'Education',
  },
  resume: {
    loading: 'Loading dossier',
    loadingHint: 'Fetching résumé data…',
    failed: 'Could not load the dossier',
    retry: 'Retry',
    openSource: 'Open source',
    closedSource: 'Internal',
    demo: 'Live demo',
    repo: 'Source',
    highlights: 'Impact',
    keyPoints: 'Scope of work',
    emptyProjects: 'No projects recorded yet.',
    present: 'Present',
  },
  chat: {
    title: 'Recruiting Agent',
    subtitle: 'Ask anything about this candidate — history, projects, tech depth',
    online: 'Online',
    offline: 'Disconnected',
    connecting: 'Connecting',
    open: 'Ask the AI',
    close: 'Close',
    placeholder: 'Type your question… (Enter to send / Shift+Enter for a new line)',
    placeholderBlocked: 'The agent is replying…',
    send: 'Send',
    stop: 'Stop',
    clear: 'New thread',
    clearConfirm: 'Starting a new thread clears this conversation. Continue?',
    thinking: 'Thinking',
    streaming: 'Replying',
    welcomeTitle: 'Hello — I am this candidate’s AI agent.',
    welcomeBody:
      'The full dossier is on the left. Ask me anything about work history, project specifics, technical depth or availability — I answer from the candidate’s real résumé and repositories.',
    suggested: 'Try asking',
    you: 'You',
    agent: 'Agent',
    errorTitle: 'Message failed',
    errorBody: 'Could not reach the AI service. Please try again.',
    retry: 'Retry',
    historyFailed: 'Could not load history',
    footer: 'Streamed over AG-UI · this thread stays anonymous on your device',
    session: 'Session',
  },
  a11y: {
    themeToggle: 'Toggle colour theme',
    lightMode: 'Light',
    darkMode: 'Dark',
    language: 'Switch résumé language',
    resumePanel: 'Candidate résumé',
    chatPanel: 'AI agent conversation',
    sendMessage: 'Send message',
    skipToChat: 'Skip to AI chat',
  },
};

export const UI: Record<string, UiStrings> = { zh, en };

export function getUi(lang: string): UiStrings {
  if (UI[lang]) return UI[lang];
  return lang.toLowerCase().startsWith('zh') ? zh : en;
}

/** Suggested first questions, localised. */
export const SUGGESTED_PROMPTS: Record<string, string[]> = {
  zh: [
    '他近两年独立交付的 AI 项目，技术难点分别是什么？',
    '把 1000 只基金计算从 4-8 小时压到 3-5 分钟，具体做了哪些优化？',
    '他在金融业务上的理解深度如何？能举几个例子吗？',
    '如果他来带一个 8 人的架构小组，管理风格会是怎样？',
    '简历里提到的 MCP 只读工具出口是怎么设计的？',
  ],
  en: [
    'What were the hardest technical problems in his recent solo AI projects?',
    'How exactly did he cut fund metric computation from 4–8 hours to 3–5 minutes?',
    'How deep is his financial-domain knowledge? Give concrete examples.',
    'What would his management style look like leading an 8-person architecture team?',
    'How is the read-only MCP tool surface in his résumé actually designed?',
  ],
};

export function getSuggestedPrompts(lang: string): string[] {
  if (SUGGESTED_PROMPTS[lang]) return SUGGESTED_PROMPTS[lang];
  return lang.toLowerCase().startsWith('zh') ? SUGGESTED_PROMPTS.zh : SUGGESTED_PROMPTS.en;
}
