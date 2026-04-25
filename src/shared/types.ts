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

export type ContextItem =
  | ContextFileItem
  | ContextDiffItem
  | ContextTaskItem
  | DiffCommentItem;

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
  rightPanelMode: RightPanelMode;
  rightPanelOpen: boolean;
  sidebarOpen: boolean;
  contextItems: ContextItem[];
  composerText: string;
  settings: AppSettings;
};

export type DiffViewStyle = "split" | "unified";
export type DiffIndicators = "classic" | "bars" | "none";
export type DiffLineDiffType = "word-alt" | "word" | "char" | "none";
export type DiffOverflow = "scroll" | "wrap";

export type AppSettings = {
  defaultShell: string;
  defaultAgentCommand: string;
  terminalFontSize: number;
  editorFontSize: number;
  diffInline: boolean;
  diffStyle: DiffViewStyle;
  diffIndicators: DiffIndicators;
  diffLineDiffType: DiffLineDiffType;
  diffOverflow: DiffOverflow;
  diffDisableBackground: boolean;
  sendAndClearComments: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultShell: "",
  defaultAgentCommand: "codex",
  terminalFontSize: 14,
  editorFontSize: 13,
  diffInline: false,
  diffStyle: "split",
  diffIndicators: "bars",
  diffLineDiffType: "word-alt",
  diffOverflow: "scroll",
  diffDisableBackground: false,
  sendAndClearComments: false,
};

export type OpenProjectResult = {
  name: string;
  repoPath: string;
  branch: string;
  isGitRepo: boolean;
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
};
