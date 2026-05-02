export type GitStatusKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export type GitBucket = 'staged' | 'unstaged' | 'untracked';

export type RightPanelMode = 'files' | 'changes' | 'context';

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
      /** 1-based line number to scroll to after opening (cleared after scroll). */
      targetLine?: number;
    }
  | { id: string; workspaceId: string; type: 'diff'; activePath?: string }
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

export type DiffFileData = {
  path: string;
  oldPath?: string;
  patch: string;
  /** Full contents of the file before the change. */
  oldContent?: string;
  /** Full contents of the file after the change. */
  newContent?: string;
  status: GitStatusKind;
  bucket: GitBucket;
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
  activeWorkspaceId: string | null;
  activeTabId: string | null;
  /** Per-workspace last-selected agent tab id, so switching workspaces remembers the agent tab */
  workspaceActiveAgentTabIds?: Record<string, string>;
  rightPanelMode: RightPanelMode;
  rightPanelOpen: boolean;
  sidebarOpen: boolean;
  terminalPanelOpen?: boolean;
  contextItems: ContextItem[];
  composerText: string;
  settings: AppSettings;
  browserHistory?: BrowserHistoryEntry[];
};

export type ThemePreference = 'dark' | 'light' | 'system';
export type TerminalThemeMode = 'follow' | 'dark' | 'light';

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

export const BUILTIN_THEMES: ThemeDefinition[] = [
  BUILTIN_THEME_SYSTEM,
  BUILTIN_THEME_DARK,
  BUILTIN_THEME_LIGHT,
  BUILTIN_THEME_MONOKAI,
  BUILTIN_THEME_DIM,
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
  /** For custom sounds: data URL for playback */
  dataUrl?: string;
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

export type AppSettings = {
  theme: ThemePreference;
  /** Active theme id — one of the built-in ids or a custom theme id */
  themeId: string;
  /** User-imported custom themes */
  customThemes: ThemeDefinition[];
  defaultShell: string;
  defaultAgentCommand: string;
  agentPresets: AgentPreset[];
  /** User-configured run commands (each entry has a display name and shell command) */
  runCommands?: { name: string; command: string }[];
  terminalFontSize: number;
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
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  themeId: 'dark',
  customThemes: [],
  defaultShell: '',
  defaultAgentCommand: DEFAULT_AGENT_PRESETS[0].command,
  agentPresets: [...DEFAULT_AGENT_PRESETS],
  terminalFontSize: 14,
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
  spinnerStyle: 'braille',
  notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
  worktreeBaseDir: '',
  worktreeTrackRemoteByDefault: false,
  worktreeAutoDeleteBranch: true,
  autoFetchEnabled: false,
  autoFetchIntervalMinutes: 5,
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

export type LspSymbolPeekState = {
  locations: LspLocation[];
  token: string;
  kind: 'definition';
  /** File where Cmd+Click originated */
  originFile?: string;
  /** Line number in origin file */
  originLine?: number;
} | null;
