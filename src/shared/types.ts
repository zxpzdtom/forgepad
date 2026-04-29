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
    }
  | { id: string; workspaceId: string; type: 'diff'; activePath?: string }
  | {
      id: string;
      workspaceId: string;
      type: 'context-preview';
      bundleId?: string;
    };

export type Project = {
  id: string;
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
  schemaVersion: 1;
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
};

export type ThemePreference = 'dark' | 'light' | 'system';
export type TerminalThemeMode = 'follow' | 'dark' | 'light';

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
  | 'copyRelativePath';

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
];

export type AppSettings = {
  theme: ThemePreference;
  defaultShell: string;
  defaultAgentCommand: string;
  agentPresets: AgentPreset[];
  runCommand?: string;
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
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
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
