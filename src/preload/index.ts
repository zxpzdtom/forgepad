import type { AgentStatusUpdate } from '@shared/agent-lifecycle';
import { IPC } from '@shared/ipc';
import type {
  ContextBundleResult,
  CreateBundleInput,
  FileNode,
  FileStatus,
  GitBucket,
  GitStatusKind,
  LspLocation,
  OpenProjectResult,
  PersistedAppState,
  WorkspaceChangeEvent,
} from '@shared/types';
import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  app: {
    openProject: () => ipcRenderer.invoke(IPC.APP_OPEN_PROJECT) as Promise<OpenProjectResult | null>,
  },
  state: {
    load: () => ipcRenderer.invoke(IPC.STATE_LOAD) as Promise<Partial<PersistedAppState> | null>,
    save: (state: PersistedAppState) => ipcRenderer.invoke(IPC.STATE_SAVE, state) as Promise<void>,
  },
  git: {
    getCurrentBranch: (worktreePath: string) => ipcRenderer.invoke(IPC.GIT_CURRENT_BRANCH, worktreePath) as Promise<string>,
    getBranchStats: (worktreePath: string) =>
      ipcRenderer.invoke(IPC.GIT_BRANCH_STATS, worktreePath) as Promise<{
        ahead: number;
        behind: number;
        additions: number;
        deletions: number;
      }>,
    getStatus: (worktreePath: string) => ipcRenderer.invoke(IPC.GIT_STATUS, worktreePath) as Promise<FileStatus[]>,
    getFileDiff: (worktreePath: string, relPath: string, bucket: GitBucket, status: GitStatusKind, oldPath?: string) =>
      ipcRenderer.invoke(IPC.GIT_FILE_DIFF, worktreePath, relPath, bucket, status, oldPath),
    stage: (worktreePath: string, paths: string[]) => ipcRenderer.invoke(IPC.GIT_STAGE, worktreePath, paths) as Promise<void>,
    unstage: (worktreePath: string, paths: string[]) => ipcRenderer.invoke(IPC.GIT_UNSTAGE, worktreePath, paths) as Promise<void>,
    discard: (worktreePath: string, entries: Array<{ path: string; bucket: GitBucket }>) =>
      ipcRenderer.invoke(IPC.GIT_DISCARD, worktreePath, entries) as Promise<void>,
    commit: (worktreePath: string, message: string) => ipcRenderer.invoke(IPC.GIT_COMMIT, worktreePath, message) as Promise<void>,
    addWorktree: (repoPath: string, branch: string, trackRemote?: boolean) =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_ADD, repoPath, branch, trackRemote) as Promise<{
        worktreePath: string;
        branch: string;
      }>,
    removeWorktree: (repoPath: string, worktreePath: string, branch: string) =>
      ipcRenderer.invoke(IPC.GIT_WORKTREE_REMOVE, repoPath, worktreePath, branch) as Promise<void>,
    fetch: (repoPath: string) => ipcRenderer.invoke(IPC.GIT_FETCH, repoPath) as Promise<void>,
    listRemoteBranches: (repoPath: string) => ipcRenderer.invoke(IPC.GIT_REMOTE_BRANCHES, repoPath) as Promise<string[]>,
    getPrInfo: (worktreePath: string) =>
      ipcRenderer.invoke(IPC.GIT_PR_NUMBER, worktreePath) as Promise<{ number: number; url: string } | null>,
  },
  fs: {
    getTreeWithStatus: (worktreePath: string) => ipcRenderer.invoke(IPC.FS_TREE_WITH_STATUS, worktreePath) as Promise<FileNode[]>,
    listFiles: (worktreePath: string) => ipcRenderer.invoke(IPC.FS_LIST_FILES, worktreePath) as Promise<string[]>,
    readFile: (worktreePath: string, relPath: string) =>
      ipcRenderer.invoke(IPC.FS_READ_FILE, worktreePath, relPath) as Promise<string>,
    readFileAsDataUrl: (worktreePath: string, relPath: string) =>
      ipcRenderer.invoke(IPC.FS_READ_FILE_DATA_URL, worktreePath, relPath) as Promise<string>,
    readAbsFile: (absPath: string) =>
      ipcRenderer.invoke(IPC.FS_READ_ABS_FILE, absPath) as Promise<string>,
    readAbsFileAsDataUrl: (absPath: string) =>
      ipcRenderer.invoke(IPC.FS_READ_ABS_FILE_DATA_URL, absPath) as Promise<string>,
    writeFile: (worktreePath: string, relPath: string, content: string) =>
      ipcRenderer.invoke(IPC.FS_WRITE_FILE, worktreePath, relPath, content) as Promise<void>,
    watchWorkspace: (worktreePath: string) => ipcRenderer.invoke(IPC.FS_WATCH, worktreePath) as Promise<string>,
    unwatchWorkspace: (watchId: string) => ipcRenderer.send(IPC.FS_UNWATCH, watchId),
    onChanged: (watchId: string, callback: (event: WorkspaceChangeEvent) => void) => {
      const channel = `${IPC.FS_CHANGED}:${watchId}`;
      const listener = (_event: Electron.IpcRendererEvent, payload: WorkspaceChangeEvent) => callback(payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
  pty: {
    create: (worktreePath: string, shell?: string, command?: string, extraEnv?: Record<string, string>) =>
      ipcRenderer.invoke(IPC.PTY_CREATE, worktreePath, shell, command, extraEnv) as Promise<string>,
    write: (id: string, data: string) => ipcRenderer.send(IPC.PTY_WRITE, id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send(IPC.PTY_RESIZE, id, cols, rows),
    destroy: (id: string) => ipcRenderer.send(IPC.PTY_DESTROY, id),
    reattach: (id: string) =>
      ipcRenderer.invoke(IPC.PTY_REATTACH, id) as Promise<{
        replay: string;
        alive: boolean;
      }>,
    onData: (id: string, callback: (data: string) => void) => {
      const channel = `${IPC.PTY_DATA}:${id}`;
      const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
    onExit: (id: string, callback: (exitCode: number, signal?: number) => void) => {
      const channel = `${IPC.PTY_EXIT}:${id}`;
      const listener = (_event: Electron.IpcRendererEvent, exitCode: number, signal?: number) => callback(exitCode, signal);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
  context: {
    createBundle: (input: CreateBundleInput) =>
      ipcRenderer.invoke(IPC.CONTEXT_CREATE_BUNDLE, input) as Promise<ContextBundleResult>,
  },
  agent: {
    onStatusUpdate: (callback: (update: AgentStatusUpdate) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, update: AgentStatusUpdate) => callback(update);
      ipcRenderer.on(IPC.AGENT_STATUS_UPDATE, handler);
      return () => {
        ipcRenderer.removeListener(IPC.AGENT_STATUS_UPDATE, handler);
      };
    },
    onFocusTab: (callback: (ptyId: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, ptyId: string) => callback(ptyId);
      ipcRenderer.on(IPC.AGENT_FOCUS_TAB, handler);
      return () => {
        ipcRenderer.removeListener(IPC.AGENT_FOCUS_TAB, handler);
      };
    },
    onRenameTab: (callback: (data: { ptyId: string; title: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { ptyId: string; title: string }) => callback(data);
      ipcRenderer.on(IPC.AGENT_RENAME_TAB, handler);
      return () => {
        ipcRenderer.removeListener(IPC.AGENT_RENAME_TAB, handler);
      };
    },
  },
  menu: {
    onOpenSettings: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(IPC.MENU_OPEN_SETTINGS, handler);
      return () => {
        ipcRenderer.removeListener(IPC.MENU_OPEN_SETTINGS, handler);
      };
    },
  },
  shell: {
    openPath: (fullPath: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_PATH, fullPath) as Promise<void>,
    openExternal: (url: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url) as Promise<void>,
    openInIde: (fullPath: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_IN_IDE, fullPath) as Promise<void>,
    openInTerminal: (fullPath: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_IN_TERMINAL, fullPath) as Promise<void>,
    showItemInFolder: (fullPath: string) => ipcRenderer.invoke(IPC.SHELL_SHOW_ITEM_IN_FOLDER, fullPath) as Promise<void>,
    detectIdes: () =>
      ipcRenderer.invoke(IPC.SHELL_DETECT_IDES) as Promise<
        Array<{ id: string; label: string; command: string; appName?: string }>
      >,
    openWithIde: (fullPath: string, ideId: string) =>
      ipcRenderer.invoke(IPC.SHELL_OPEN_WITH_IDE, fullPath, ideId) as Promise<void>,
    detectTerminals: () =>
      ipcRenderer.invoke(IPC.SHELL_DETECT_TERMINALS) as Promise<Array<{ id: string; label: string; appName: string }>>,
    openWithTerminal: (fullPath: string, terminalId: string) =>
      ipcRenderer.invoke(IPC.SHELL_OPEN_WITH_TERMINAL, fullPath, terminalId) as Promise<void>,
  },
  notification: {
    pickAudio: () =>
      ipcRenderer.invoke(IPC.NOTIFICATION_PICK_AUDIO) as Promise<{
        fileName: string;
        assetPath: string;
        dataUrl: string;
      } | null>,
    deleteAudio: (assetPath: string) => ipcRenderer.invoke(IPC.NOTIFICATION_DELETE_AUDIO, assetPath) as Promise<void>,
  },
  app2: {
    isFocused: () => ipcRenderer.invoke(IPC.APP_IS_FOCUSED) as Promise<boolean>,
    focusWindow: () => ipcRenderer.send(IPC.APP_FOCUS_WINDOW),
  },
  nativeFiles: {
    /** Returns the absolute filesystem path for a File object from an external drag-and-drop. */
    getPath: (file: File): string => webUtils.getPathForFile(file),
  },
  browser: {
    captureScreenshot: (webContentsId: number, rect: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke(IPC.BROWSER_CAPTURE_SCREENSHOT, { webContentsId, rect }) as Promise<string>,
    setTouchEmulation: (webContentsId: number, enabled: boolean) =>
      ipcRenderer.invoke(IPC.BROWSER_SET_TOUCH_EMULATION, { webContentsId, enabled }) as Promise<void>,
    enableConsole: (webContentsId: number) =>
      ipcRenderer.invoke(IPC.BROWSER_ENABLE_CONSOLE, { webContentsId }) as Promise<void>,
    disableConsole: (webContentsId: number) =>
      ipcRenderer.invoke(IPC.BROWSER_DISABLE_CONSOLE, { webContentsId }) as Promise<void>,
    onConsoleEvent: (callback: (raw: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => callback(raw);
      ipcRenderer.on(IPC.BROWSER_CONSOLE_EVENT, handler);
      return () => ipcRenderer.removeListener(IPC.BROWSER_CONSOLE_EVENT, handler);
    },
  },
  lsp: {
    getDefinition: (worktreePath: string, token: string) =>
      ipcRenderer.invoke(IPC.LSP_GET_DEFINITION, worktreePath, token) as Promise<LspLocation[]>,
  },
};

contextBridge.exposeInMainWorld('forgepad', api);

export type ForgePadApi = typeof api;
