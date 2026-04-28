export type GitStatusKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export type GitBucket = "staged" | "unstaged" | "untracked";

export type RightPanelMode = "files" | "changes" | "context";

export type Tab =
  | {
      id: string;
      workspaceId: string;
      type: "terminal";
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
      type: "file";
      relPath: string;
      unsaved?: boolean;
    }
  | { id: string; workspaceId: string; type: "diff"; activePath?: string }
  | {
      id: string;
      workspaceId: string;
      type: "context-preview";
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

export type TaskStatus = "backlog" | "ready" | "running" | "review" | "done";

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
  type: "file" | "directory";
  children?: FileNode[];
  gitStatus?: Exclude<GitStatusKind, "conflicted">;
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
  status: GitStatusKind;
  bucket: GitBucket;
  isBinary: boolean;
};

export type ContextFileItem = {
  id: string;
  type: "file";
  workspaceId: string;
  relPath: string;
  note?: string;
  includeContent: boolean;
  addedAt: number;
};

export type ContextDiffItem = {
  id: string;
  type: "diff";
  workspaceId: string;
  relPath: string;
  bucket: GitBucket;
  status: GitStatusKind;
  note?: string;
  addedAt: number;
};

export type ContextTaskItem = {
  id: string;
  type: "task";
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
  type: "comment";
  workspaceId: string;
  relPath: string;
  bucket: GitBucket;
  side: "additions" | "deletions";
  endSide?: "additions" | "deletions";
  startLine: number;
  endLine: number;
  text: string;
  addedAt: number;
};

export type CodeSelectionItem = {
  id: string;
  type: "selection";
  workspaceId: string;
  relPath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  text: string;
  addedAt: number;
};

export type ContextItem =
  | ContextFileItem
  | ContextDiffItem
  | ContextTaskItem
  | DiffCommentItem
  | CodeSelectionItem;

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

export type ThemePreference = "dark" | "light" | "system";

export type DiffViewStyle = "split" | "unified";
export type DiffIndicators = "classic" | "bars" | "none";
export type DiffLineDiffType = "word-alt" | "word" | "char" | "none";
export type DiffOverflow = "scroll" | "wrap";

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
    id: "claude",
    label: "Claude Code",
    command: "claude --permission-mode acceptEdits",
    enabled: true,
    builtIn: true,
    sessionTemplate: "--session-id {sessionId}",
    restoreTemplate: "claude --resume {sessionId}",
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    enabled: true,
    builtIn: true,
    restoreTemplate: "codex resume {sessionId}",
  },
  {
    id: "gemini",
    label: "Gemini",
    command: "gemini --approval-mode=auto_edit",
    enabled: true,
    builtIn: true,
    restoreTemplate: "gemini --resume {sessionId}",
  },
];

export type AppSettings = {
  theme: ThemePreference;
  defaultShell: string;
  defaultAgentCommand: string;
  agentPresets: AgentPreset[];
  runCommand?: string;
  terminalFontSize: number;
  editorFontSize: number;
  diffInline: boolean;
  diffStyle: DiffViewStyle;
  diffIndicators: DiffIndicators;
  diffLineDiffType: DiffLineDiffType;
  diffOverflow: DiffOverflow;
  diffDisableBackground: boolean;
  sendAndClearComments: boolean;
  defaultOpenWith: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  defaultShell: "",
  defaultAgentCommand: DEFAULT_AGENT_PRESETS[0].command,
  agentPresets: [...DEFAULT_AGENT_PRESETS],
  terminalFontSize: 14,
  editorFontSize: 13,
  diffInline: false,
  diffStyle: "split",
  diffIndicators: "bars",
  diffLineDiffType: "word-alt",
  diffOverflow: "scroll",
  diffDisableBackground: false,
  sendAndClearComments: false,
  defaultOpenWith: "finder",
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
  comments: Array<
    Omit<DiffCommentItem, "id" | "type" | "workspaceId" | "addedAt">
  >;
  selections: Array<
    Omit<CodeSelectionItem, "id" | "type" | "workspaceId" | "addedAt">
  >;
};
