import type { AgentStatusUpdate } from "./agent-lifecycle";
import type {
  AgentCompletionData,
  AgentSessionHistoryItem,
  AgentUserPromptData,
  ContextBundleResult,
  CreateBundleInput,
  CustomPetMeta,
  DeletePetResult,
  FileNode,
  FilePreviewResult,
  FileStatus,
  GitBucket,
  GitCommitFileSummary,
  GitCommitMeta,
  GitCommitSummary,
  GitStatusKind,
  ImportPetResult,
  LspLocation,
  OpenProjectResult,
  PendingPermission,
  PersistedAppState,
  PetCommand,
  PetPlayAction,
  PetSettings,
  WorkspaceChangeEvent,
} from "./types";

export type Unsubscribe = () => void;

export type BranchStats = {
  ahead: number;
  behind: number;
  additions: number;
  deletions: number;
};

export type GitDiscardEntry = {
  path: string;
  bucket: GitBucket;
};

export type WorktreeAddResult = {
  worktreePath: string;
  branch: string;
};

export type WorktreeSummary = {
  repoName: string;
  repoPath: string;
  branch: string;
  worktreePath: string;
};

export type PtyReplay = {
  replay: string;
  alive: boolean;
};

export type PickedAudio = {
  fileName: string;
  assetPath: string;
};

export type NativeIde = {
  id: string;
  label: string;
  command: string;
  appName?: string;
};

export type NativeTerminal = {
  id: string;
  label: string;
  appName: string;
};

export type SaveFileRequest = {
  suggestedName: string;
  contentBase64: string;
  mimeType?: string;
};

export type HostBridgeApi = {
  app: {
    openProject: () => Promise<OpenProjectResult | null>;
    openProjectFromPath: (selectedPath: string) => Promise<OpenProjectResult | null>;
    showEmojiPanel: () => Promise<void>;
    pickDirectory: (title?: string) => Promise<string | null>;
    setIcon: (variant: string) => Promise<void>;
  };
  state: {
    load: () => Promise<Partial<PersistedAppState> | null>;
    save: (state: PersistedAppState) => Promise<void>;
  };
  git: {
    getCurrentBranch: (worktreePath: string) => Promise<string>;
    getBranchStats: (worktreePath: string) => Promise<BranchStats>;
    getStatus: (worktreePath: string) => Promise<FileStatus[]>;
    getCommitHistory: (worktreePath: string, limit?: number) => Promise<GitCommitSummary[]>;
    getCommitHistorySummary: (worktreePath: string, limit?: number) => Promise<GitCommitMeta[]>;
    getCommitFiles: (worktreePath: string, hash: string) => Promise<GitCommitFileSummary[]>;
    getFileDiff: (
      worktreePath: string,
      relPath: string,
      bucket: GitBucket,
      status: GitStatusKind,
      oldPath?: string,
    ) => Promise<unknown>;
    getCommitFileDiff: (
      worktreePath: string,
      commitHash: string,
      relPath: string,
      status: GitStatusKind,
      oldPath?: string,
    ) => Promise<unknown>;
    stage: (worktreePath: string, paths: string[]) => Promise<void>;
    unstage: (worktreePath: string, paths: string[]) => Promise<void>;
    discard: (worktreePath: string, entries: GitDiscardEntry[]) => Promise<void>;
    commit: (worktreePath: string, message: string) => Promise<void>;
    push: (worktreePath: string) => Promise<void>;
    pull: (worktreePath: string) => Promise<void>;
    generateCommitMessage: (worktreePath: string, promptTemplate: string, agentCommand?: string) => Promise<string>;
    addWorktree: (
      repoPath: string,
      branch: string,
      trackRemote?: boolean,
      worktreeBaseDir?: string,
    ) => Promise<WorktreeAddResult>;
    removeWorktree: (repoPath: string, worktreePath: string, branch: string) => Promise<void>;
    fetch: (repoPath: string) => Promise<void>;
    listRemoteBranches: (repoPath: string) => Promise<string[]>;
    getPrInfo: (worktreePath: string) => Promise<{ number: number; url: string; merged: boolean } | null>;
    scanWorktrees: (baseDir: string) => Promise<WorktreeSummary[]>;
  };
  fs: {
    getTreeWithStatus: (worktreePath: string) => Promise<FileNode[]>;
    listFiles: (worktreePath: string) => Promise<string[]>;
    readFile: (worktreePath: string, relPath: string) => Promise<string>;
    readFilePreview: (worktreePath: string, relPath: string, maxBytes: number) => Promise<FilePreviewResult>;
    fileUrl?: (worktreePath: string, relPath: string) => Promise<string>;
    absFileUrl?: (absPath: string) => Promise<string>;
    readAbsFile: (absPath: string) => Promise<string>;
    readAbsFilePreview: (absPath: string, maxBytes: number) => Promise<FilePreviewResult>;
    writeFile: (worktreePath: string, relPath: string, content: string) => Promise<void>;
    watchWorkspace: (worktreePath: string) => Promise<string>;
    unwatchWorkspace: (watchId: string) => void;
    onChanged: (watchId: string, callback: (event: WorkspaceChangeEvent) => void) => Unsubscribe;
  };
  pty: {
    create: (
      worktreePath: string,
      shell?: string,
      command?: string,
      extraEnv?: Record<string, string>,
    ) => Promise<string>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    destroy: (id: string) => void;
    reattach: (id: string) => Promise<PtyReplay>;
    onData: (id: string, callback: (data: string) => void) => Unsubscribe;
    onExit: (id: string, callback: (exitCode: number, signal?: number) => void) => Unsubscribe;
  };
  context: {
    createBundle: (input: CreateBundleInput) => Promise<ContextBundleResult>;
  };
  agent: {
    externalSessions?: (workspaceId: string, worktreePath: string) => Promise<AgentSessionHistoryItem[]>;
    updateSettings: (settings: Record<string, unknown>) => Promise<void>;
    onStatusUpdate: (callback: (update: AgentStatusUpdate) => void) => Unsubscribe;
    onFocusTab: (callback: (ptyId: string) => void) => Unsubscribe;
    onRenameTab: (callback: (data: { ptyId: string; title: string }) => void) => Unsubscribe;
    onPermissionRequest: (callback: (data: PendingPermission) => void) => Unsubscribe;
    sendPermissionDecision: (
      ptyId: string,
      decision: "allow" | "deny" | "allowAlways" | "answer",
      answers?: Record<string, string>,
    ) => void;
    onUserPrompt: (callback: (data: AgentUserPromptData) => void) => Unsubscribe;
    onCompletion: (callback: (data: AgentCompletionData) => void) => Unsubscribe;
  };
  menu: {
    onOpenSettings: (callback: () => void) => Unsubscribe;
  };
  shell: {
    openPath: (fullPath: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    saveFile?: (request: SaveFileRequest) => Promise<void>;
    openInIde: (fullPath: string) => Promise<void>;
    openInTerminal: (fullPath: string) => Promise<void>;
    showItemInFolder: (fullPath: string) => Promise<void>;
    detectIdes: () => Promise<NativeIde[]>;
    openWithIde: (fullPath: string, ideId: string, lineNumber?: number, projectPath?: string) => Promise<void>;
    detectTerminals: () => Promise<NativeTerminal[]>;
    openWithTerminal: (fullPath: string, terminalId: string) => Promise<void>;
  };
  dialog?: {
    confirm: (options: {
      title?: string;
      message?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }) => Promise<boolean>;
  };
  notification: {
    pickAudio: () => Promise<PickedAudio | null>;
    deleteAudio: (assetPath: string) => Promise<void>;
  };
  app2: {
    isFocused: () => Promise<boolean>;
    focusWindow: () => void;
    toggleMaximize?: () => void;
    startWindowDrag?: () => void;
  };
  native?: Record<string, never>;
  nativeFiles: {
    getPath: (file: File) => string;
  };
  lsp: {
    getDefinition: (worktreePath: string, token: string) => Promise<LspLocation[]>;
  };
  pet: {
    sendSettings: (settings: PetSettings) => void;
    command: (command: PetCommand) => void;
    play: (action?: PetPlayAction | "random") => void;
    stop: () => void;
    importPet: () => Promise<ImportPetResult>;
    deletePet: (petId: string) => Promise<DeletePetResult>;
    listPets: () => Promise<CustomPetMeta[]>;
  };
};
