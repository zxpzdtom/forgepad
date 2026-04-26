import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "@shared/ipc";
import type {
  ContextBundleResult,
  CreateBundleInput,
  FileNode,
  FileStatus,
  GitBucket,
  GitStatusKind,
  OpenProjectResult,
  PersistedAppState,
  WorkspaceChangeEvent,
} from "@shared/types";

const api = {
  app: {
    openProject: () => ipcRenderer.invoke(IPC.APP_OPEN_PROJECT) as Promise<OpenProjectResult | null>,
  },
  state: {
    load: () => ipcRenderer.invoke(IPC.STATE_LOAD) as Promise<Partial<PersistedAppState> | null>,
    save: (state: PersistedAppState) => ipcRenderer.invoke(IPC.STATE_SAVE, state) as Promise<void>,
  },
  git: {
    getCurrentBranch: (worktreePath: string) =>
      ipcRenderer.invoke(IPC.GIT_CURRENT_BRANCH, worktreePath) as Promise<string>,
    getBranchStats: (worktreePath: string) =>
      ipcRenderer.invoke(IPC.GIT_BRANCH_STATS, worktreePath) as Promise<{
        ahead: number;
        behind: number;
        additions: number;
        deletions: number;
      }>,
    getStatus: (worktreePath: string) =>
      ipcRenderer.invoke(IPC.GIT_STATUS, worktreePath) as Promise<FileStatus[]>,
    getFileDiff: (
      worktreePath: string,
      relPath: string,
      bucket: GitBucket,
      status: GitStatusKind,
      oldPath?: string,
    ) =>
      ipcRenderer.invoke(IPC.GIT_FILE_DIFF, worktreePath, relPath, bucket, status, oldPath),
    stage: (worktreePath: string, paths: string[]) =>
      ipcRenderer.invoke(IPC.GIT_STAGE, worktreePath, paths) as Promise<void>,
    unstage: (worktreePath: string, paths: string[]) =>
      ipcRenderer.invoke(IPC.GIT_UNSTAGE, worktreePath, paths) as Promise<void>,
    discard: (worktreePath: string, entries: Array<{ path: string; bucket: GitBucket }>) =>
      ipcRenderer.invoke(IPC.GIT_DISCARD, worktreePath, entries) as Promise<void>,
    commit: (worktreePath: string, message: string) =>
      ipcRenderer.invoke(IPC.GIT_COMMIT, worktreePath, message) as Promise<void>,
  },
  fs: {
    getTreeWithStatus: (worktreePath: string) =>
      ipcRenderer.invoke(IPC.FS_TREE_WITH_STATUS, worktreePath) as Promise<FileNode[]>,
    readFile: (worktreePath: string, relPath: string) =>
      ipcRenderer.invoke(IPC.FS_READ_FILE, worktreePath, relPath) as Promise<string>,
    readFileAsDataUrl: (worktreePath: string, relPath: string) =>
      ipcRenderer.invoke(IPC.FS_READ_FILE_DATA_URL, worktreePath, relPath) as Promise<string>,
    writeFile: (worktreePath: string, relPath: string, content: string) =>
      ipcRenderer.invoke(IPC.FS_WRITE_FILE, worktreePath, relPath, content) as Promise<void>,
    watchWorkspace: (worktreePath: string) =>
      ipcRenderer.invoke(IPC.FS_WATCH, worktreePath) as Promise<string>,
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
      ipcRenderer.invoke(IPC.PTY_REATTACH, id) as Promise<{ replay: string; alive: boolean }>,
    onData: (id: string, callback: (data: string) => void) => {
      const channel = `${IPC.PTY_DATA}:${id}`;
      const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
    onExit: (id: string, callback: (exitCode: number, signal?: number) => void) => {
      const channel = `${IPC.PTY_EXIT}:${id}`;
      const listener = (_event: Electron.IpcRendererEvent, exitCode: number, signal?: number) =>
        callback(exitCode, signal);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
  context: {
    createBundle: (input: CreateBundleInput) =>
      ipcRenderer.invoke(IPC.CONTEXT_CREATE_BUNDLE, input) as Promise<ContextBundleResult>,
  },
};

contextBridge.exposeInMainWorld("forgepad", api);

export type ForgePadApi = typeof api;
