export type GitStatusKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export type GitBucket = 'staged' | 'unstaged' | 'untracked';

export type RightPanelMode = 'files' | 'changes' | 'commits' | 'context';

export type FilePreviewResult = {
  content: string;
  lineCount: number;
  totalBytes: number;
  previewBytes: number;
  truncated: boolean;
};

export type Tab =
  | {
      id: string;
      workspaceId: string;
      type: 'terminal';
      title: string;
      ptyId: string;
      isAgent?: boolean;
      agentPresetId?: string;
      agentCommand?: string;
      sessionId?: string;
      /** True once the agent CLI has actually used the session (first hook event received).
       *  Only confirmed sessions are persisted and eligible for restore. */
      sessionConfirmed?: boolean;
    }
  | {
      id: string;
      workspaceId: string;
      type: 'file';
      relPath: string;
      unsaved?: boolean;
      /** Absolute path for files outside the workspace (read-only preview). */
      absPath?: string;
      /** Transient object URL for files dropped from the OS when the WebView cannot expose an absolute path. */
      externalUrl?: string;
      externalMime?: string;
      /** 1-based line number to scroll to after opening (cleared after scroll). */
      targetLine?: number;
      /** Last meaningful 1-based line for external editor handoff. */
      lastLine?: number;
    }
  | {
      id: string;
      workspaceId: string;
      type: 'diff';
      activePath?: string;
      activeBucket?: GitBucket;
      activeStatus?: GitStatusKind;
      activeOldPath?: string;
      commitHash?: string;
      commitSubject?: string;
    }
  | {
      id: string;
      workspaceId: string;
      type: 'context-preview';
      bundleId?: string;
    }
  | {
      id: string;
      workspaceId: string;
      type: 'browser';
      url: string;
      title: string;
      isLoading: boolean;
      canGoBack: boolean;
      canGoForward: boolean;
    };

export type AgentSessionHistoryItem = {
  id: string;
  workspaceId: string;
  title: string;
  sessionId: string;
  agentPresetId?: string;
  agentCommand?: string;
  updatedAt: number;
};

/** A URL visited in the browser tab, stored for history/autocomplete */
export type BrowserHistoryEntry = {
  url: string;
  title: string;
  /** Google favicon API URL, empty string if unavailable */
  favicon: string;
  visitedAt: number;
};

/** Element selected via the in-browser element picker */
export type SelectedElementInfo = {
  /** Unique CSS selector path for the element */
  selector: string;
  /** Tag name e.g. "BUTTON", "DIV" */
  tagName: string;
  /** Element's outerHTML, truncated to 500 chars */
  outerHTML: string;
  /** Bounding rect relative to the page viewport */
  boundingRect: { x: number; y: number; width: number; height: number };
  /** Base64-encoded PNG screenshot of the element region */
  screenshotBase64: string;
  /** Page URL at time of selection */
  pageUrl: string;
  /** Page title at time of selection */
  pageTitle: string;
};
export type WorkspacePanel = {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
};

export type Project = {
  id: string;
  panelId: string;
  name: string;
  repoPath: string;
  defaultAgentCommand?: string;
  /** Per-project run commands (display name + shell command) */
  runCommands?: { name: string; command: string }[];
  createdAt: number;
  updatedAt: number;
};

export type Workspace = {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  worktreePath: string;
  isRoot: boolean;
  taskId?: string;
  createdAt: number;
};

export type TaskStatus = 'backlog' | 'ready' | 'running' | 'review' | 'done';

export type Task = {
  id: string;
  projectId: string;
  workspaceId?: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
};

export type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  gitStatus?: Exclude<GitStatusKind, 'conflicted'>;
};

export type FileStatus = {
  path: string;
  oldPath?: string;
  status: GitStatusKind;
  bucket: GitBucket;
  staged: boolean;
  conflictKind?: string;
  additions?: number;
  deletions?: number;
};

export type GitCommitFileSummary = {
  path: string;
  oldPath?: string;
  status: Exclude<GitStatusKind, 'untracked'>;
  additions: number;
  deletions: number;
};

export type GitCommitSummary = {
  hash: string;
  shortHash: string;
  subject: string;
  timestamp: number;
  additions: number;
  deletions: number;
  files: GitCommitFileSummary[];
};

export type DiffFileData = {
  path: string;
  oldPath?: string;
  patch: string;
  /** Full contents of the file before the change. */
  oldContent?: string;
  /** Full contents of the file after the change. */
  newContent?: string;
  oldImageUrl?: string;
  newImageUrl?: string;
  status: GitStatusKind;
  bucket: GitBucket;
  commitHash?: string;
  isBinary: boolean;
};

export type ContextFileItem = {
  id: string;
  type: 'file';
  workspaceId: string;
  relPath: string;
  note?: string;
  includeContent: boolean;
  addedAt: number;
};

export type ContextDiffItem = {
  id: string;
  type: 'diff';
  workspaceId: string;
  relPath: string;
  bucket: GitBucket;
  status: GitStatusKind;
  note?: string;
  addedAt: number;
};

export type ContextTaskItem = {
  id: string;
  type: 'task';
  workspaceId: string;
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  note?: string;
  addedAt: number;
};

export type DiffCommentItem = {
  id: string;
  type: 'comment';
  workspaceId: string;
  relPath: string;
  bucket: GitBucket;
  side: 'additions' | 'deletions';
  endSide?: 'additions' | 'deletions';
  startLine: number;
  endLine: number;
  text: string;
  addedAt: number;
};

export type CodeSelectionItem = {
  id: string;
  type: 'selection';
  workspaceId: string;
  relPath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  text: string;
  addedAt: number;
};

export type ContextItem = ContextFileItem | ContextDiffItem | ContextTaskItem | DiffCommentItem | CodeSelectionItem;

export type ContextBundleResult = {
  id: string;
  path: string;
  relPath: string;
  markdown: string;
  estimatedTokens: number;
  createdAt: number;
};

export type PersistedAppState = {
  schemaVersion: 1 | 2;
  panels: WorkspacePanel[];
  activePanelId: string | null;
  projects: Project[];
  workspaces: Workspace[];
  tasks: Task[];
  tabs: Tab[];
  agentSessionHistory?: AgentSessionHistoryItem[];
  activeWorkspaceId: string | null;
  activeTabId: string | null;
  /** Per-workspace last-selected agent tab id, so switching workspaces remembers the agent tab */
  workspaceActiveAgentTabIds?: Record<string, string>;
  /** Per-workspace last-selected file/editor tab id, so switching workspaces remembers the editor tab */
  workspaceActiveFileTabIds?: Record<string, string>;
  /** Per-workspace cached sidebar git badges, restored before live git refresh finishes */
  branchStats?: Record<
    string,
    {
      ahead: number;
      behind: number;
      additions: number;
      deletions: number;
      prNumber?: number | null;
      prUrl?: string | null;
      prMerged?: boolean | null;
      updatedAt?: number;
    }
  >;
  rightPanelMode: RightPanelMode;
  rightPanelOpen: boolean;
  sidebarOpen: boolean;
  terminalPanelOpen?: boolean;
  contextItems: ContextItem[];
  composerText: string;
  settings: AppSettings;
  browserHistory?: BrowserHistoryEntry[];
  /** Per-project last-selected run command index */
  projectActiveRunIndex?: Record<string, number>;
};

export type ThemePreference = 'dark' | 'light' | 'system';
export type TerminalThemeMode = 'follow' | 'dark' | 'light';
export type AppIconVariant =
  | 'graphite'
  | 'aurora'
  | 'ember'
  | 'frost'
  | 'violet';

/* ─── Theme System ─── */

export type ThemeMode = 'dark' | 'light' | 'system';

/** All CSS variable tokens a ThemeDefinition can override */
export type ThemeTokens = {
  // App surfaces
  bg?: string;
  panel?: string;
  'panel-2'?: string;
  'panel-3'?: string;
  // Borders
  border?: string;
  'border-soft'?: string;
  // Text hierarchy
  text?: string;
  muted?: string;
  subtle?: string;
  // Brand / accent
  accent?: string;
  'accent-2'?: string;
  // Semantic status
  warn?: string;
  danger?: string;
  ok?: string;
  // Semantic surfaces
  'surface-inset'?: string;
  'surface-input'?: string;
  'surface-toolbar'?: string;
  'surface-search'?: string;
  'surface-dialog'?: string;
  'surface-card'?: string;
  'surface-footer'?: string;
  'surface-terminal'?: string;
  'surface-markdown'?: string;
  'accent-surface'?: string;
  'focus-border'?: string;
  'accent-contrast'?: string;
  // Semantic text
  'text-addition'?: string;
  'text-deletion'?: string;
  'text-warning-status'?: string;
  'text-code-inline'?: string;
  'text-code-block'?: string;
  'text-heading'?: string;
  // Toast borders
  'toast-border-success'?: string;
  'toast-border-error'?: string;
  // Sidebar
  'sidebar-bg'?: string;
  'workspace-card-bg'?: string;
};

export type TerminalThemeTokens = {
  background?: string;
  foreground?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  // ANSI colors
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
};

export type SyntaxThemeTokens = {
  keyword?: string;
  string?: string;
  number?: string;
  comment?: string;
  function?: string;
  variable?: string;
  type?: string;
  operator?: string;
  punctuation?: string;
  tag?: string;
  attribute?: string;
  constant?: string;
};

export type MarkdownThemeTokens = {
  blockquoteBorder?: string;
  codeHeaderBg?: string;
  checkboxBg?: string;
  checkboxBorder?: string;
};

export type DiffThemeTokens = {
  addedBg?: string;
  deletedBg?: string;
  addedText?: string;
  deletedText?: string;
};

export const THEME_SCHEMA_VERSION = 1;

export type ThemeDefinition = {
  /** Schema version for migration */
  schemaVersion: number;
  id: string;
  name: string;
  author?: string;
  mode: ThemeMode;
  version?: string;
  /** Main UI token overrides */
  tokens: ThemeTokens;
  /** Terminal / xterm color palette */
  terminal?: TerminalThemeTokens;
  /** Syntax highlight palette */
  syntax?: SyntaxThemeTokens;
  /** Markdown rendering tokens */
  markdown?: MarkdownThemeTokens;
  /** Diff viewer tokens */
  diff?: DiffThemeTokens;
  /** Whether this is a built-in theme (cannot be deleted) */
  builtIn?: boolean;
};

/* ─── Built-in Themes ─── */

export const BUILTIN_THEME_SYSTEM: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'system',
  name: 'System',
  author: 'ForgePad',
  mode: 'system',
  tokens: {},
  builtIn: true,
};

export const BUILTIN_THEME_DARK: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'dark',
  name: 'Dark',
  author: 'ForgePad',
  mode: 'dark',
  tokens: {},
  terminal: {
    background: '#08090a',
    foreground: '#f7f8f8',
    cursor: '#5e6ad2',
    cursorAccent: '#08090a',
    selectionBackground: 'rgba(94,106,210,0.25)',
    black: '#1a1b1c',
    red: '#ff7777',
    green: '#27a644',
    yellow: '#e9bd61',
    blue: '#5e6ad2',
    magenta: '#a855f7',
    cyan: '#22d3ee',
    white: '#8a8f98',
    brightBlack: '#3f4147',
    brightRed: '#ff9999',
    brightGreen: '#4ade80',
    brightYellow: '#fcd34d',
    brightBlue: '#7170ff',
    brightMagenta: '#c084fc',
    brightCyan: '#67e8f9',
    brightWhite: '#f7f8f8',
  },
  builtIn: true,
};

export const BUILTIN_THEME_LIGHT: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'light',
  name: 'Light',
  author: 'ForgePad',
  mode: 'light',
  tokens: {
    bg: '#f5f5f7',
    panel: '#ffffff',
    'panel-2': '#f0f0f2',
    'panel-3': '#e4e4e8',
    border: 'rgba(0,0,0,0.08)',
    'border-soft': 'rgba(0,0,0,0.05)',
    text: '#0f0f10',
    muted: '#6b7280',
    subtle: '#9ca3af',
    accent: '#4f46e5',
    'accent-2': '#6366f1',
    warn: '#b45309',
    danger: '#dc2626',
    ok: '#16a34a',
    'surface-inset': '#e8e8ec',
    'surface-input': 'rgba(0,0,0,0.03)',
    'surface-toolbar': '#ffffff',
    'surface-search': '#f0f0f2',
    'surface-dialog': '#ffffff',
    'surface-card': 'rgba(0,0,0,0.02)',
    'surface-footer': '#ffffff',
    'surface-terminal': '#f5f5f7',
    'surface-markdown': '#ffffff',
    'accent-surface': 'rgba(79,70,229,0.08)',
    'focus-border': '#4f46e5',
    'accent-contrast': '#ffffff',
    'text-addition': '#16a34a',
    'text-deletion': '#dc2626',
    'text-warning-status': '#b45309',
    'text-code-inline': '#4338ca',
    'text-code-block': '#374151',
    'text-heading': '#0f0f10',
    'toast-border-success': 'rgba(22,163,74,0.3)',
    'toast-border-error': 'rgba(220,38,38,0.3)',
    'sidebar-bg': '#ffffff',
    'workspace-card-bg': 'rgba(0,0,0,0.02)',
  },
  terminal: {
    background: '#f5f5f7',
    foreground: '#0f0f10',
    cursor: '#4f46e5',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(79,70,229,0.2)',
    black: '#1f2937',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#6b7280',
    brightBlack: '#374151',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#eab308',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#0f0f10',
  },
  builtIn: true,
};

export const BUILTIN_THEME_MONOKAI: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'monokai',
  name: 'Monokai',
  author: 'ForgePad',
  mode: 'dark',
  version: '1.0.0',
  tokens: {
    bg: '#272822',
    panel: '#2d2e27',
    'panel-2': '#3e3d32',
    'panel-3': '#49483e',
    border: 'rgba(255,255,255,0.08)',
    'border-soft': 'rgba(255,255,255,0.04)',
    text: '#f8f8f2',
    muted: '#908d80',
    subtle: '#75715e',
    accent: '#a6e22e',
    'accent-2': '#66d9e8',
    warn: '#e6db74',
    danger: '#f92672',
    ok: '#a6e22e',
    'surface-inset': '#1e1f18',
    'surface-input': 'rgba(255,255,255,0.03)',
    'surface-toolbar': '#2d2e27',
    'surface-search': '#3e3d32',
    'surface-dialog': '#3e3d32',
    'surface-card': 'rgba(255,255,255,0.03)',
    'surface-footer': '#2d2e27',
    'surface-terminal': '#272822',
    'surface-markdown': '#2d2e27',
    'accent-surface': 'rgba(166,226,46,0.1)',
    'focus-border': '#a6e22e',
    'accent-contrast': '#272822',
    'text-addition': '#a6e22e',
    'text-deletion': '#f92672',
    'text-warning-status': '#e6db74',
    'text-code-inline': '#66d9e8',
    'text-code-block': '#f8f8f2',
    'text-heading': '#f8f8f2',
    'toast-border-success': 'rgba(166,226,46,0.35)',
    'toast-border-error': 'rgba(249,38,114,0.35)',
    'sidebar-bg': '#2d2e27',
    'workspace-card-bg': 'rgba(255,255,255,0.03)',
  },
  terminal: {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    cursorAccent: '#272822',
    selectionBackground: 'rgba(73,72,62,0.6)',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9e8',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9e8',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5',
  },
  syntax: {
    keyword: '#f92672',
    string: '#e6db74',
    number: '#ae81ff',
    comment: '#75715e',
    function: '#a6e22e',
    variable: '#f8f8f2',
    type: '#66d9e8',
    operator: '#f92672',
    punctuation: '#f8f8f2',
    tag: '#f92672',
    attribute: '#a6e22e',
    constant: '#ae81ff',
  },
  builtIn: true,
};

export const BUILTIN_THEME_DIM: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'dim',
  name: 'Dim',
  author: 'ForgePad',
  mode: 'dark',
  version: '1.0.0',
  tokens: {
    bg: '#1a1e2e',
    panel: '#1f2437',
    'panel-2': '#252b3d',
    'panel-3': '#2e3549',
    border: 'rgba(255,255,255,0.06)',
    'border-soft': 'rgba(255,255,255,0.03)',
    text: '#cdd6f4',
    muted: '#7c85a8',
    subtle: '#585d77',
    accent: '#89b4fa',
    'accent-2': '#b4befe',
    warn: '#f9e2af',
    danger: '#f38ba8',
    ok: '#a6e3a1',
    'surface-inset': '#141726',
    'surface-input': 'rgba(255,255,255,0.02)',
    'surface-toolbar': '#1f2437',
    'surface-search': '#252b3d',
    'surface-dialog': '#252b3d',
    'surface-card': 'rgba(255,255,255,0.02)',
    'surface-footer': '#1f2437',
    'surface-terminal': '#1a1e2e',
    'surface-markdown': '#1f2437',
    'accent-surface': 'rgba(137,180,250,0.08)',
    'focus-border': '#89b4fa',
    'accent-contrast': '#1a1e2e',
    'text-addition': '#a6e3a1',
    'text-deletion': '#f38ba8',
    'text-warning-status': '#f9e2af',
    'text-code-inline': '#cba6f7',
    'text-code-block': '#cdd6f4',
    'text-heading': '#cdd6f4',
    'toast-border-success': 'rgba(166,227,161,0.3)',
    'toast-border-error': 'rgba(243,139,168,0.3)',
    'sidebar-bg': '#1f2437',
    'workspace-card-bg': 'rgba(255,255,255,0.02)',
  },
  terminal: {
    background: '#1a1e2e',
    foreground: '#cdd6f4',
    cursor: '#89b4fa',
    cursorAccent: '#1a1e2e',
    selectionBackground: 'rgba(137,180,250,0.2)',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  },
  builtIn: true,
};

export const BUILTIN_THEME_CLAUDE: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'claude',
  name: 'Claude',
  author: 'ForgePad',
  mode: 'dark',
  version: '1.0.0',
  tokens: {
    bg: '#262624',
    panel: '#30302e',
    'panel-2': '#3e3e38',
    'panel-3': '#52514a',
    border: 'rgba(255,255,255,0.07)',
    'border-soft': 'rgba(255,255,255,0.04)',
    text: '#faf9f5',
    muted: '#b7b5a9',
    subtle: '#7a7970',
    accent: '#d97757',
    'accent-2': '#e89578',
    warn: '#f9e2af',
    danger: '#ef4444',
    ok: '#a6e3a1',
    'surface-inset': '#1f1e1d',
    'surface-input': 'rgba(255,255,255,0.03)',
    'surface-toolbar': '#30302e',
    'surface-search': '#3e3e38',
    'surface-dialog': '#3e3e38',
    'surface-card': 'rgba(255,255,255,0.03)',
    'surface-footer': '#30302e',
    'surface-terminal': '#262624',
    'surface-markdown': '#30302e',
    'accent-surface': 'rgba(217,119,87,0.1)',
    'focus-border': '#d97757',
    'accent-contrast': '#ffffff',
    'text-addition': '#a6e3a1',
    'text-deletion': '#ef4444',
    'text-warning-status': '#f9e2af',
    'text-code-inline': '#e89578',
    'text-code-block': '#c3c0b6',
    'text-heading': '#faf9f5',
    'toast-border-success': 'rgba(166,227,161,0.35)',
    'toast-border-error': 'rgba(239,68,68,0.35)',
    'sidebar-bg': '#1f1e1d',
    'workspace-card-bg': 'rgba(255,255,255,0.03)',
  },
  terminal: {
    background: '#262624',
    foreground: '#faf9f5',
    cursor: '#d97757',
    cursorAccent: '#262624',
    selectionBackground: 'rgba(217,119,87,0.2)',
    black: '#1b1b19',
    red: '#ef4444',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#9c87f5',
    magenta: '#dbd3f0',
    cyan: '#94e2d5',
    white: '#c3c0b6',
    brightBlack: '#52514a',
    brightRed: '#ef4444',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#9c87f5',
    brightMagenta: '#dbd3f0',
    brightCyan: '#94e2d5',
    brightWhite: '#faf9f5',
  },
  builtIn: true,
};

export const BUILTIN_THEME_CLAUDE_LIGHT: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'claude-light',
  name: 'Claude Light',
  author: 'ForgePad',
  mode: 'light',
  version: '1.0.0',
  tokens: {
    bg: '#faf9f5',
    panel: '#f5f4ee',
    'panel-2': '#e9e6dc',
    'panel-3': '#dad9d4',
    border: 'rgba(0,0,0,0.08)',
    'border-soft': 'rgba(0,0,0,0.05)',
    text: '#141413',
    muted: '#83827d',
    subtle: '#b4b2a7',
    accent: '#c96442',
    'accent-2': '#d97757',
    warn: '#b45309',
    danger: '#dc2626',
    ok: '#16a34a',
    'surface-inset': '#ede9de',
    'surface-input': 'rgba(0,0,0,0.03)',
    'surface-toolbar': '#f5f4ee',
    'surface-search': '#faf9f5',
    'surface-dialog': '#ffffff',
    'surface-card': 'rgba(0,0,0,0.02)',
    'surface-footer': '#f5f4ee',
    'surface-terminal': '#faf9f5',
    'surface-markdown': '#ffffff',
    'accent-surface': 'rgba(201,100,66,0.08)',
    'focus-border': '#c96442',
    'accent-contrast': '#ffffff',
    'text-addition': '#16a34a',
    'text-deletion': '#dc2626',
    'text-warning-status': '#b45309',
    'text-code-inline': '#c96442',
    'text-code-block': '#3d3929',
    'text-heading': '#141413',
    'toast-border-success': 'rgba(22,163,74,0.3)',
    'toast-border-error': 'rgba(220,38,38,0.3)',
    'sidebar-bg': '#f5f4ee',
    'workspace-card-bg': 'rgba(0,0,0,0.02)',
  },
  terminal: {
    background: '#faf9f5',
    foreground: '#141413',
    cursor: '#c96442',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(201,100,66,0.2)',
    black: '#3d3929',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#b45309',
    blue: '#9c87f5',
    magenta: '#c96442',
    cyan: '#0891b2',
    white: '#83827d',
    brightBlack: '#535146',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#eab308',
    brightBlue: '#9c87f5',
    brightMagenta: '#d97757',
    brightCyan: '#06b6d4',
    brightWhite: '#141413',
  },
  builtIn: true,
};

export const BUILTIN_THEME_SPOTIFY: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'spotify',
  name: 'Spotify',
  author: 'ForgePad',
  mode: 'dark',
  version: '1.0.0',
  tokens: {
    bg: '#121212',
    panel: '#1a1a1a',
    'panel-2': '#242424',
    'panel-3': '#2a2a2a',
    border: 'rgba(255,255,255,0.07)',
    'border-soft': 'rgba(255,255,255,0.04)',
    text: '#ffffff',
    muted: '#a7a7a7',
    subtle: '#6a6a6a',
    accent: '#1db954',
    'accent-2': '#1ed760',
    warn: '#f59b23',
    danger: '#e91429',
    ok: '#1db954',
    'surface-inset': '#0a0a0a',
    'surface-input': 'rgba(255,255,255,0.07)',
    'surface-toolbar': '#1a1a1a',
    'surface-search': '#2a2a2a',
    'surface-dialog': '#242424',
    'surface-card': 'rgba(255,255,255,0.04)',
    'surface-footer': '#1a1a1a',
    'surface-terminal': '#121212',
    'surface-markdown': '#1a1a1a',
    'accent-surface': 'rgba(29,185,84,0.12)',
    'focus-border': '#1db954',
    'accent-contrast': '#000000',
    'text-addition': '#1db954',
    'text-deletion': '#e91429',
    'text-warning-status': '#f59b23',
    'text-code-inline': '#1ed760',
    'text-code-block': '#b3b3b3',
    'text-heading': '#ffffff',
    'toast-border-success': 'rgba(29,185,84,0.4)',
    'toast-border-error': 'rgba(233,20,41,0.4)',
    'sidebar-bg': '#0a0a0a',
    'workspace-card-bg': 'rgba(255,255,255,0.04)',
  },
  terminal: {
    background: '#121212',
    foreground: '#ffffff',
    cursor: '#1db954',
    cursorAccent: '#121212',
    selectionBackground: 'rgba(29,185,84,0.25)',
    black: '#121212',
    red: '#e91429',
    green: '#1db954',
    yellow: '#f59b23',
    blue: '#4687d6',
    magenta: '#af2896',
    cyan: '#2d9e9e',
    white: '#a7a7a7',
    brightBlack: '#535353',
    brightRed: '#ff4040',
    brightGreen: '#1ed760',
    brightYellow: '#ffc862',
    brightBlue: '#69a3e0',
    brightMagenta: '#d45bc9',
    brightCyan: '#4ec5c5',
    brightWhite: '#ffffff',
  },
  builtIn: true,
};

export const BUILTIN_THEME_SLACK: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'slack',
  name: 'Slack',
  author: 'ForgePad',
  mode: 'dark',
  version: '1.0.0',
  tokens: {
    bg: '#1a1d21',
    panel: '#222529',
    'panel-2': '#2c2d31',
    'panel-3': '#38393d',
    border: 'rgba(255,255,255,0.08)',
    'border-soft': 'rgba(255,255,255,0.04)',
    text: '#d1d2d3',
    muted: '#ababad',
    subtle: '#7a7b7e',
    accent: '#e8a3ff',
    'accent-2': '#d4a0ff',
    warn: '#ecb22d',
    danger: '#e01d5a',
    ok: '#2eb67d',
    'surface-inset': '#141618',
    'surface-input': 'rgba(255,255,255,0.06)',
    'surface-toolbar': '#222529',
    'surface-search': '#2c2d31',
    'surface-dialog': '#2c2d31',
    'surface-card': 'rgba(255,255,255,0.03)',
    'surface-footer': '#222529',
    'surface-terminal': '#1a1d21',
    'surface-markdown': '#222529',
    'accent-surface': 'rgba(74,21,75,0.15)',
    'focus-border': '#e8a3ff',
    'accent-contrast': '#1a1d21',
    'text-addition': '#2eb67d',
    'text-deletion': '#e01d5a',
    'text-warning-status': '#ecb22d',
    'text-code-inline': '#e8a3ff',
    'text-code-block': '#d1d2d3',
    'text-heading': '#d1d2d3',
    'toast-border-success': 'rgba(46,182,125,0.35)',
    'toast-border-error': 'rgba(224,29,90,0.35)',
    'sidebar-bg': '#4a154b',
    'workspace-card-bg': 'rgba(255,255,255,0.06)',
  },
  terminal: {
    background: '#1a1d21',
    foreground: '#d1d2d3',
    cursor: '#e8a3ff',
    cursorAccent: '#1a1d21',
    selectionBackground: 'rgba(232,163,255,0.2)',
    black: '#1a1d21',
    red: '#e01d5a',
    green: '#2eb67d',
    yellow: '#ecb22d',
    blue: '#36c5f0',
    magenta: '#e8a3ff',
    cyan: '#36c5f0',
    white: '#ababad',
    brightBlack: '#7a7b7e',
    brightRed: '#e01d5a',
    brightGreen: '#2eb67d',
    brightYellow: '#ecb22d',
    brightBlue: '#36c5f0',
    brightMagenta: '#d4a0ff',
    brightCyan: '#36c5f0',
    brightWhite: '#d1d2d3',
  },
  builtIn: true,
};

export const BUILTIN_THEME_PERPETUITY: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'perpetuity',
  name: 'Perpetuity',
  author: 'ForgePad',
  mode: 'dark',
  version: '1.0.0',
  tokens: {
    bg: '#0a1a20',
    panel: '#0c2025',
    'panel-2': '#164955',
    'panel-3': '#1c5a68',
    border: 'rgba(77,232,232,0.12)',
    'border-soft': 'rgba(77,232,232,0.06)',
    text: '#4de8e8',
    muted: '#36a5a5',
    subtle: '#1c6e6e',
    accent: '#4de8e8',
    'accent-2': '#70f0f0',
    warn: '#ecb22d',
    danger: '#e83c3c',
    ok: '#2eb67d',
    'surface-inset': '#071418',
    'surface-input': 'rgba(77,232,232,0.05)',
    'surface-toolbar': '#0c2025',
    'surface-search': '#164955',
    'surface-dialog': '#164955',
    'surface-card': 'rgba(77,232,232,0.04)',
    'surface-footer': '#0c2025',
    'surface-terminal': '#0a1a20',
    'surface-markdown': '#0c2025',
    'accent-surface': 'rgba(77,232,232,0.08)',
    'focus-border': '#4de8e8',
    'accent-contrast': '#0a1a20',
    'text-addition': '#2eb67d',
    'text-deletion': '#e83c3c',
    'text-warning-status': '#ecb22d',
    'text-code-inline': '#70f0f0',
    'text-code-block': '#36a5a5',
    'text-heading': '#4de8e8',
    'toast-border-success': 'rgba(46,182,125,0.35)',
    'toast-border-error': 'rgba(232,60,60,0.35)',
    'sidebar-bg': '#071418',
    'workspace-card-bg': 'rgba(77,232,232,0.04)',
  },
  terminal: {
    background: '#0a1a20',
    foreground: '#4de8e8',
    cursor: '#4de8e8',
    cursorAccent: '#0a1a20',
    selectionBackground: 'rgba(77,232,232,0.2)',
    black: '#071418',
    red: '#e83c3c',
    green: '#2eb67d',
    yellow: '#ecb22d',
    blue: '#36a5a5',
    magenta: '#c084fc',
    cyan: '#4de8e8',
    white: '#36a5a5',
    brightBlack: '#1c6e6e',
    brightRed: '#f06060',
    brightGreen: '#4ade80',
    brightYellow: '#fcd34d',
    brightBlue: '#4de8e8',
    brightMagenta: '#d4a0ff',
    brightCyan: '#70f0f0',
    brightWhite: '#4de8e8',
  },
  builtIn: true,
};

export const BUILTIN_THEME_NOTEBOOK: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'notebook',
  name: 'Notebook',
  author: 'ForgePad',
  mode: 'light',
  version: '1.0.0',
  tokens: {
    bg: '#f9f9f9',
    panel: '#ffffff',
    'panel-2': '#f0f0f0',
    'panel-3': '#e5e5e5',
    border: '#747272',
    'border-soft': 'rgba(0,0,0,0.1)',
    text: '#3a3a3a',
    muted: '#606060',
    subtle: '#a0a0a0',
    accent: '#606060',
    'accent-2': '#505050',
    warn: '#b45309',
    danger: '#c87a7a',
    ok: '#16a34a',
    'surface-inset': '#f0f0f0',
    'surface-input': '#ffffff',
    'surface-toolbar': '#ffffff',
    'surface-search': '#f9f9f9',
    'surface-dialog': '#ffffff',
    'surface-card': 'rgba(0,0,0,0.02)',
    'surface-footer': '#ffffff',
    'surface-terminal': '#f9f9f9',
    'surface-markdown': '#ffffff',
    'accent-surface': '#f3eac8',
    'focus-border': '#606060',
    'accent-contrast': '#ffffff',
    'text-addition': '#16a34a',
    'text-deletion': '#c87a7a',
    'text-warning-status': '#b45309',
    'text-code-inline': '#505050',
    'text-code-block': '#3a3a3a',
    'text-heading': '#3a3a3a',
    'toast-border-success': 'rgba(22,163,74,0.3)',
    'toast-border-error': 'rgba(200,122,122,0.3)',
    'sidebar-bg': '#f0f0f0',
    'workspace-card-bg': 'rgba(0,0,0,0.02)',
  },
  terminal: {
    background: '#f9f9f9',
    foreground: '#3a3a3a',
    cursor: '#606060',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(96,96,96,0.15)',
    black: '#3a3a3a',
    red: '#c87a7a',
    green: '#16a34a',
    yellow: '#b45309',
    blue: '#606060',
    magenta: '#8b7a8b',
    cyan: '#5a8a8a',
    white: '#a0a0a0',
    brightBlack: '#505050',
    brightRed: '#d48a8a',
    brightGreen: '#22c55e',
    brightYellow: '#ca8a04',
    brightBlue: '#747272',
    brightMagenta: '#a090a0',
    brightCyan: '#70a0a0',
    brightWhite: '#3a3a3a',
  },
  builtIn: true,
};

export const BUILTIN_THEME_PAPER: ThemeDefinition = {
  schemaVersion: THEME_SCHEMA_VERSION,
  id: 'paper',
  name: 'Paper',
  author: 'ForgePad',
  mode: 'light',
  version: '1.0.0',
  tokens: {
    bg: '#faf8f0',
    panel: '#f5f2e8',
    'panel-2': '#ece8dc',
    'panel-3': '#ddd8ca',
    border: '#8a8070',
    'border-soft': '#b8b0a0',
    text: '#2a2a2a',
    muted: '#6a6560',
    subtle: '#9a9590',
    accent: '#c0392b',
    'accent-2': '#d44637',
    warn: '#d4a017',
    danger: '#c0392b',
    ok: '#27ae60',
    'surface-inset': '#f0ede3',
    'surface-input': '#fffdf5',
    'surface-toolbar': '#f5f2e8',
    'surface-search': '#fffdf5',
    'surface-dialog': '#faf8f0',
    'surface-card': 'rgba(0,0,0,0.02)',
    'surface-footer': '#f5f2e8',
    'surface-terminal': '#faf8f0',
    'surface-markdown': '#fffdf5',
    'accent-surface': 'rgba(192,57,43,0.08)',
    'focus-border': '#c0392b',
    'accent-contrast': '#ffffff',
    'text-addition': '#27ae60',
    'text-deletion': '#c0392b',
    'text-warning-status': '#d4a017',
    'text-code-inline': '#8e44ad',
    'text-code-block': '#2a2a2a',
    'text-heading': '#1a1a1a',
    'toast-border-success': 'rgba(39,174,96,0.3)',
    'toast-border-error': 'rgba(192,57,43,0.3)',
    'sidebar-bg': '#f0ede3',
    'workspace-card-bg': 'rgba(0,0,0,0.02)',
  },
  terminal: {
    background: '#faf8f0',
    foreground: '#2a2a2a',
    cursor: '#c0392b',
    cursorAccent: '#faf8f0',
    selectionBackground: 'rgba(192,57,43,0.12)',
    black: '#2a2a2a',
    red: '#c0392b',
    green: '#27ae60',
    yellow: '#d4a017',
    blue: '#2980b9',
    magenta: '#8e44ad',
    cyan: '#16a085',
    white: '#9a9590',
    brightBlack: '#6a6560',
    brightRed: '#d44637',
    brightGreen: '#2ecc71',
    brightYellow: '#f1c40f',
    brightBlue: '#3498db',
    brightMagenta: '#9b59b6',
    brightCyan: '#1abc9c',
    brightWhite: '#2a2a2a',
  },
  builtIn: true,
};

export const BUILTIN_THEMES: ThemeDefinition[] = [
  BUILTIN_THEME_SYSTEM,
  BUILTIN_THEME_DARK,
  BUILTIN_THEME_LIGHT,
  BUILTIN_THEME_MONOKAI,
  BUILTIN_THEME_DIM,
  BUILTIN_THEME_CLAUDE,
  BUILTIN_THEME_CLAUDE_LIGHT,
  BUILTIN_THEME_SPOTIFY,
  BUILTIN_THEME_SLACK,
  BUILTIN_THEME_PERPETUITY,
  BUILTIN_THEME_NOTEBOOK,
  BUILTIN_THEME_PAPER,
];

export type DiffViewStyle = 'split' | 'unified';
export type DiffIndicators = 'classic' | 'bars' | 'none';
export type DiffLineDiffType = 'word-alt' | 'word' | 'char' | 'none';
export type DiffOverflow = 'scroll' | 'wrap';

export type AgentPreset = {
  id: string;
  label: string;
  command: string;
  enabled: boolean;
  builtIn?: boolean;
  /** Appended to command on first launch to assign a session ID (e.g. "--session-id {sessionId}"). */
  sessionTemplate?: string;
  /** Full command used to restore/resume a previous session (e.g. "claude --resume {sessionId}"). */
  restoreTemplate?: string;
};

export const DEFAULT_AGENT_PRESETS: AgentPreset[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude --permission-mode acceptEdits',
    enabled: true,
    builtIn: true,
    sessionTemplate: '--session-id {sessionId}',
    restoreTemplate: 'claude --resume {sessionId}',
  },
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    enabled: true,
    builtIn: true,
    restoreTemplate: 'codex resume {sessionId}',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    command: 'gemini --approval-mode=auto_edit',
    enabled: true,
    builtIn: true,
    restoreTemplate: 'gemini --resume {sessionId}',
  },
];

/* ─── Keyboard Shortcuts ─── */

export type ShortcutActionId =
  | 'quickSearch'
  | 'toggleSettings'
  | 'cycleTabForward'
  | 'cycleTabBackward'
  | 'switchTab1'
  | 'switchTab2'
  | 'switchTab3'
  | 'switchTab4'
  | 'switchTab5'
  | 'switchTab6'
  | 'switchTab7'
  | 'switchTab8'
  | 'switchTab9'
  | 'newTerminal'
  | 'newAgent'
  | 'openWithDefault'
  | 'closeTab'
  | 'toggleTerminal'
  | 'toggleSidebar'
  | 'toggleRightPanel'
  | 'openRightPanelFiles'
  | 'openRightPanelChanges'
  | 'openRightPanelContext'
  | 'copyPath'
  | 'copyRelativePath'
  | 'prevPanel'
  | 'nextPanel'
  | 'switchPanel1'
  | 'switchPanel2'
  | 'switchPanel3'
  | 'switchPanel4'
  | 'switchPanel5'
  | 'switchPanel6'
  | 'switchPanel7'
  | 'switchPanel8'
  | 'switchPanel9';

export type ShortcutCombo = {
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** Lowercase key value from KeyboardEvent.key (e.g., "p", "tab", "1") */
  key: string;
};

export type KeyboardShortcuts = Partial<Record<ShortcutActionId, ShortcutCombo>>;

const combo = (key: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): ShortcutCombo => ({
  meta: mods.meta ?? false,
  ctrl: mods.ctrl ?? false,
  shift: mods.shift ?? false,
  alt: mods.alt ?? false,
  key,
});

export const DEFAULT_SHORTCUTS: Record<ShortcutActionId, ShortcutCombo> = {
  quickSearch: combo('p', { meta: true }),
  toggleSettings: combo(',', { meta: true }),
  cycleTabForward: combo('tab', { ctrl: true }),
  cycleTabBackward: combo('tab', { ctrl: true, shift: true }),
  switchTab1: combo('1', { meta: true }),
  switchTab2: combo('2', { meta: true }),
  switchTab3: combo('3', { meta: true }),
  switchTab4: combo('4', { meta: true }),
  switchTab5: combo('5', { meta: true }),
  switchTab6: combo('6', { meta: true }),
  switchTab7: combo('7', { meta: true }),
  switchTab8: combo('8', { meta: true }),
  switchTab9: combo('9', { meta: true }),
  newTerminal: combo('t', { meta: true }),
  newAgent: combo('t', { meta: true, shift: true }),
  openWithDefault: combo('o', { meta: true }),
  closeTab: combo('w', { meta: true }),
  toggleTerminal: combo('j', { meta: true }),
  toggleSidebar: combo('b', { meta: true }),
  toggleRightPanel: combo('b', { meta: true, shift: true }),
  openRightPanelFiles: combo('e', { meta: true, shift: true }),
  openRightPanelChanges: combo('g', { meta: true, shift: true }),
  openRightPanelContext: combo('c', { meta: true, shift: true }),
  copyPath: combo('c', { meta: true, alt: true }),
  copyRelativePath: combo('c', { meta: true, shift: true, alt: true }),
  prevPanel: combo('[', { ctrl: true, shift: true }),
  nextPanel: combo(']', { ctrl: true, shift: true }),
  switchPanel1: combo('1', { alt: true }),
  switchPanel2: combo('2', { alt: true }),
  switchPanel3: combo('3', { alt: true }),
  switchPanel4: combo('4', { alt: true }),
  switchPanel5: combo('5', { alt: true }),
  switchPanel6: combo('6', { alt: true }),
  switchPanel7: combo('7', { alt: true }),
  switchPanel8: combo('8', { alt: true }),
  switchPanel9: combo('9', { alt: true }),
};

export type ShortcutCategory = 'navigation' | 'tabs' | 'panels' | 'other';

export type ShortcutDefinition = {
  id: ShortcutActionId;
  label: string;
  category: ShortcutCategory;
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'quickSearch', label: 'Quick Search', category: 'navigation' },
  { id: 'toggleSettings', label: 'Settings', category: 'navigation' },
  { id: 'newTerminal', label: 'New Terminal', category: 'other' },
  { id: 'newAgent', label: 'New Agent', category: 'other' },
  { id: 'openWithDefault', label: 'Open With Default', category: 'other' },
  { id: 'closeTab', label: 'Close Tab', category: 'tabs' },
  { id: 'cycleTabForward', label: 'Next Tab', category: 'tabs' },
  { id: 'cycleTabBackward', label: 'Previous Tab', category: 'tabs' },
  { id: 'switchTab1', label: 'Switch to Tab 1', category: 'tabs' },
  { id: 'switchTab2', label: 'Switch to Tab 2', category: 'tabs' },
  { id: 'switchTab3', label: 'Switch to Tab 3', category: 'tabs' },
  { id: 'switchTab4', label: 'Switch to Tab 4', category: 'tabs' },
  { id: 'switchTab5', label: 'Switch to Tab 5', category: 'tabs' },
  { id: 'switchTab6', label: 'Switch to Tab 6', category: 'tabs' },
  { id: 'switchTab7', label: 'Switch to Tab 7', category: 'tabs' },
  { id: 'switchTab8', label: 'Switch to Tab 8', category: 'tabs' },
  { id: 'switchTab9', label: 'Switch to Tab 9', category: 'tabs' },
  { id: 'toggleSidebar', label: 'Toggle Sidebar', category: 'panels' },
  { id: 'toggleRightPanel', label: 'Toggle Right Panel', category: 'panels' },
  { id: 'toggleTerminal', label: 'Toggle Terminal', category: 'panels' },
  {
    id: 'openRightPanelFiles',
    label: 'Files Panel',
    category: 'panels',
  },
  {
    id: 'openRightPanelChanges',
    label: 'Changes Panel',
    category: 'panels',
  },
  {
    id: 'openRightPanelContext',
    label: 'Context Panel',
    category: 'panels',
  },
  { id: 'copyPath', label: 'Copy Path', category: 'other' },
  { id: 'copyRelativePath', label: 'Copy Relative Path', category: 'other' },
  { id: 'prevPanel', label: 'Previous Panel', category: 'navigation' },
  { id: 'nextPanel', label: 'Next Panel', category: 'navigation' },
  { id: 'switchPanel1', label: 'Switch to Panel 1', category: 'navigation' },
  { id: 'switchPanel2', label: 'Switch to Panel 2', category: 'navigation' },
  { id: 'switchPanel3', label: 'Switch to Panel 3', category: 'navigation' },
  { id: 'switchPanel4', label: 'Switch to Panel 4', category: 'navigation' },
  { id: 'switchPanel5', label: 'Switch to Panel 5', category: 'navigation' },
  { id: 'switchPanel6', label: 'Switch to Panel 6', category: 'navigation' },
  { id: 'switchPanel7', label: 'Switch to Panel 7', category: 'navigation' },
  { id: 'switchPanel8', label: 'Switch to Panel 8', category: 'navigation' },
  { id: 'switchPanel9', label: 'Switch to Panel 9', category: 'navigation' },
];

/* ─── Notification types ─── */

export type NotificationSound = {
  id: string;
  name: string;
  subtitle: string;
  durationMs: number;
  source: 'built-in' | 'custom';
  /** For custom sounds: the userData file path (used as key for deletion) */
  assetPath?: string;
  createdAt: number;
};

export type NotificationSettings = {
  /** Master toggle: play sounds at all */
  enabled: boolean;
  /** Volume 0–100 */
  volume: number;
  /** ID of the selected built-in or custom sound */
  selectedSoundId: string;
  /** User-imported custom sounds */
  customSounds: NotificationSound[];
  /** Play sound even when app window is focused */
  playWhenAppFocused: boolean;
  /** Show OS desktop notification banners */
  desktopNotificationEnabled: boolean;
  /** Trigger when agent finishes (review status) */
  notifyOnAgentDone: boolean;
  /** Trigger when agent waits for user approval */
  notifyOnAgentNeedsApproval: boolean;
  /** Trigger when a Task status changes to done */
  notifyOnTaskDone: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  volume: 70,
  selectedSoundId: 'ping',
  customSounds: [],
  playWhenAppFocused: false,
  desktopNotificationEnabled: true,
  notifyOnAgentDone: true,
  notifyOnAgentNeedsApproval: true,
  notifyOnTaskDone: false,
};

export type PetDefinition = {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
  kind?: 'person' | 'animal' | 'object';
  /** True for user-imported pets (vs built-in) */
  isCustom?: boolean;
};

/** Lightweight metadata for a user-imported custom pet, persisted in the store.
 *  The actual files (pet.json + spritesheet.webp) live on disk at {userData}/custom-pets/{id}/. */
export type CustomPetMeta = {
  id: string;
  displayName: string;
  description: string;
  kind: 'person' | 'animal' | 'object';
  /** ISO 8601 timestamp of import */
  importedAt: string;
};

export type ImportPetResult = { success: true; pet: CustomPetMeta } | { success: false; error: string };

export type DeletePetResult = { success: true } | { success: false; error: string };

export type PetSettings = {
  enabled: boolean;
  selectedPetId: string;
  petSize: number;
  petSpeed: number;
  /** How adventurous autonomous pet movement should be. */
  petPlayMode: "cozy" | "playful" | "adventure";
  /** Allow pet to randomly wander and interact autonomously. */
  allowRandomMove: boolean;
  /** User-imported custom pets metadata */
  customPets: CustomPetMeta[];
};

export type PetPlayAction =
  | "stroll"
  | "hop"
  | "stairs"
  | "portal"
  | "windowTop"
  | "zigzag"
  | "spring"
  | "peek"
  | "balloon"
  | "rocket";

export type PetCommand =
  | { type: "play"; action?: PetPlayAction | "random" }
  | { type: "stop" };

export const DEFAULT_PET_SETTINGS: PetSettings = {
  enabled: false,
  selectedPetId: 'kiki',
  petSize: 0.8,
  petSpeed: 2,
  petPlayMode: "playful",
  allowRandomMove: true,
  customPets: [],
};

export type PetStageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PetStageWindow = PetStageRect & {
  id: string;
  appName: string;
  title: string;
  source: "native" | "system";
};

export type PetStageSnapshot = {
  capturedAt: number;
  workArea: PetStageRect;
  displays: PetStageRect[];
  windows: PetStageWindow[];
};

/** A single permission suggestion from Claude Code's PermissionRequest payload. */
export type PermissionSuggestion = {
  type: string;
  rules: Array<{ toolName: string; ruleContent: string }>;
  behavior: string;
  destination: string;
};

/** A single question item from Claude Code's AskUserQuestion tool. */
export type AskUserQuestionItem = {
  question: string;
  header?: string;
  options: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
};

/** A PermissionRequest pending user approval (forwarded from HookServer). */
export type PendingPermission = {
  ptyId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  /** Permission suggestions from Claude Code (e.g. "always allow this tool"). */
  permissionSuggestions?: PermissionSuggestion[];
  /** Parsed questions from AskUserQuestion tool — if present, show question UI instead of approval UI. */
  questions?: AskUserQuestionItem[];
};

/** Data broadcast when an agent completes (Stop event). */
export type AgentCompletionData = {
  ptyId: string;
  aiMessage: string;
};

/** Data broadcast when the user submits a prompt (UserPromptSubmit event). */
export type AgentUserPromptData = {
  ptyId: string;
  prompt: string;
};

/** A completion notification card displayed above the pet. */
export type CompletionCard = {
  id: string;
  ptyId: string;
  userPrompt: string;
  aiResponse: string;
  timestamp: number;
};

export type ExtensionInfo = {
  id: string;
  name: string;
  version: string;
  path: string;
  /** Popup HTML path relative to extension root (from action.default_popup or browser_action.default_popup) */
  popupPath: string | null;
  /** Icon URL (chrome-extension://<id>/<icon-path>) for toolbar display */
  iconUrl: string | null;
};

export type Locale = 'en' | 'zh-CN';

export type AppSettings = {
  locale: Locale;
  theme: ThemePreference;
  /** Active theme id — one of the built-in ids or a custom theme id */
  themeId: string;
  /** Active Dock icon material variant */
  appIconVariant: AppIconVariant;
  /** User-imported custom themes */
  customThemes: ThemeDefinition[];
  defaultShell: string;
  defaultAgentCommand: string;
  agentPresets: AgentPreset[];
  /** User-configured run commands (each entry has a display name and shell command) */
  runCommands?: { name: string; command: string }[];
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalThemeMode: TerminalThemeMode;
  agentThemeMode: TerminalThemeMode;
  editorFontSize: number;
  diffInline: boolean;
  diffStyle: DiffViewStyle;
  diffIndicators: DiffIndicators;
  diffLineDiffType: DiffLineDiffType;
  diffOverflow: DiffOverflow;
  diffDisableBackground: boolean;
  sendAndClearComments: boolean;
  defaultOpenWith: string;
  spinnerStyle: string;
  keyboardShortcuts?: KeyboardShortcuts;
  lastSettingsTab?: string;
  notifications: NotificationSettings;
  // ── Git ──
  /** Custom base directory for worktrees. Empty string = default (~/.forgepad/worktrees) */
  worktreeBaseDir: string;
  /** Pre-select "Track remote branch" in New Worktree dialog */
  worktreeTrackRemoteByDefault: boolean;
  /** Delete local branch when removing a worktree */
  worktreeAutoDeleteBranch: boolean;
  /** Periodically fetch remote refs */
  autoFetchEnabled: boolean;
  /** Minutes between automatic fetches (1–60) */
  autoFetchIntervalMinutes: number;
  /** Prompt template for AI commit message generation. {diff} is replaced with staged diff. */
  commitPromptTemplate: string;
  /** Whether to use AI (claude -p) to generate agent tab titles */
  autoGenerateTabTitle: boolean;
  /** Prompt template for AI tab title generation. {prompt} is replaced with user's message. */
  tabTitlePromptTemplate: string;
  /** Only rename the tab title on the first user message; ignore subsequent messages */
  renameOnFirstMessageOnly: boolean;
  /** Apply hand-drawn sketchy visual effects on top of any theme */
  sketchyMode: boolean;
  /** Desktop pet settings */
  pets: PetSettings;
  // ── Browser ──
  /** Default homepage URL for new browser tabs (e.g. https://www.google.com) */
  defaultBrowserHomepage: string;
  // ── Browser Extensions ──
  /** Paths to unpacked Chrome extensions to load on startup */
  extensionPaths: string[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'en',
  theme: 'dark',
  themeId: 'dark',
  appIconVariant: 'graphite',
  customThemes: [],
  defaultShell: '',
  defaultAgentCommand: DEFAULT_AGENT_PRESETS[0].command,
  agentPresets: [...DEFAULT_AGENT_PRESETS],
  terminalFontSize: 14,
  terminalFontFamily: '',
  terminalThemeMode: 'follow',
  agentThemeMode: 'follow',
  editorFontSize: 13,
  diffInline: false,
  diffStyle: 'split',
  diffIndicators: 'bars',
  diffLineDiffType: 'word-alt',
  diffOverflow: 'scroll',
  diffDisableBackground: false,
  sendAndClearComments: false,
  defaultOpenWith: 'finder',
  spinnerStyle: 'core-spiral',
  notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
  worktreeBaseDir: '',
  worktreeTrackRemoteByDefault: false,
  worktreeAutoDeleteBranch: true,
  autoFetchEnabled: false,
  autoFetchIntervalMinutes: 5,
  commitPromptTemplate: `分析以下 git diff，生成一条符合 Conventional Commits 规范的提交消息。

格式：<type>(<scope>): <中文描述>

type 包括：feat fix docs style refactor perf test build ci chore revert
scope 从变更的文件路径或模块中提取。

规则：
- header 不超过 72 个字符
- 不以句号结尾
- 描述说明 WHY（为什么改）而非仅 WHAT（改了什么）
- 只输出提交消息本身，不要包含任何解释、引号或 markdown 格式

{diff}`,
  autoGenerateTabTitle: false,
  tabTitlePromptTemplate: `为以下用户消息生成一个简短的标签标题（不超过 10 个字）。

规则：
- 提取核心意图，用最精炼的中文描述
- 不要包含引号、标点或解释
- 只输出标题本身，不超过 10 个字

用户消息：{prompt}`,
  renameOnFirstMessageOnly: false,
  sketchyMode: false,
  pets: { ...DEFAULT_PET_SETTINGS },
  defaultBrowserHomepage: 'https://www.google.com',
  extensionPaths: [],
};

export type OpenProjectResult = {
  name: string;
  repoPath: string;
  branch: string;
  isGitRepo: boolean;
};

export type WorkspaceChangeEvent = {
  id: string;
  paths: string[];
  changedAt: number;
};

export type CreateBundleInput = {
  workspacePath: string;
  workspaceName: string;
  branch: string;
  prompt: string;
  tasks: Array<{
    title: string;
    description: string;
    status: TaskStatus;
    note?: string;
  }>;
  files: Array<{ relPath: string; note?: string; includeContent: boolean }>;
  diffs: Array<{
    relPath: string;
    bucket: GitBucket;
    status: GitStatusKind;
    note?: string;
  }>;
  comments: Array<Omit<DiffCommentItem, 'id' | 'type' | 'workspaceId' | 'addedAt'>>;
  selections: Array<Omit<CodeSelectionItem, 'id' | 'type' | 'workspaceId' | 'addedAt'>>;
};

/* ─── LSP / Symbol Navigation ─── */

export type LspLocation = {
  /** Relative path within workspace */
  filePath: string;
  /** 1-based line number */
  lineNumber: number;
  /** 0-based column offset */
  charStart: number;
  /** The text of the matching line (for preview) */
  lineText: string;
};
