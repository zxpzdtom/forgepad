import { BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { IPC } from "@shared/ipc";
import type { CreateBundleInput, PersistedAppState } from "@shared/types";
import { ContextService } from "@main/services/context-service";
import { FileService } from "@main/services/file-service";
import { GitService } from "@main/services/git-service";
import { PtyService } from "@main/services/pty-service";
import { StateService } from "@main/services/state-service";

const ptyService = new PtyService();

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.APP_OPEN_PROJECT, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Open Project",
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const selectedPath = result.filePaths[0];
    const isGitRepo = await GitService.isGitRepo(selectedPath);
    const repoPath = isGitRepo ? await GitService.getTopLevel(selectedPath).catch(() => selectedPath) : selectedPath;
    const branch = isGitRepo ? await GitService.getCurrentBranch(repoPath) : "";
    return {
      name: path.basename(repoPath),
      repoPath,
      branch,
      isGitRepo,
    };
  });

  ipcMain.handle(IPC.STATE_LOAD, async () => StateService.load());
  ipcMain.handle(IPC.STATE_SAVE, async (_event, state: PersistedAppState) => StateService.save(state));

  ipcMain.handle(IPC.GIT_CURRENT_BRANCH, async (_event, worktreePath: string) =>
    GitService.getCurrentBranch(worktreePath),
  );
  ipcMain.handle(IPC.GIT_STATUS, async (_event, worktreePath: string) => GitService.getStatus(worktreePath));
  ipcMain.handle(
    IPC.GIT_FILE_DIFF,
    async (_event, worktreePath: string, relPath: string, bucket, status, oldPath?: string) =>
      GitService.getFileDiff(worktreePath, relPath, bucket, status, oldPath),
  );
  ipcMain.handle(IPC.GIT_STAGE, async (_event, worktreePath: string, paths: string[]) =>
    GitService.stage(worktreePath, paths),
  );
  ipcMain.handle(IPC.GIT_UNSTAGE, async (_event, worktreePath: string, paths: string[]) =>
    GitService.unstage(worktreePath, paths),
  );
  ipcMain.handle(IPC.GIT_DISCARD, async (_event, worktreePath: string, entries) =>
    GitService.discard(worktreePath, entries),
  );
  ipcMain.handle(IPC.GIT_COMMIT, async (_event, worktreePath: string, message: string) =>
    GitService.commit(worktreePath, message),
  );

  ipcMain.handle(IPC.FS_TREE_WITH_STATUS, async (_event, worktreePath: string) =>
    FileService.getTreeWithStatus(worktreePath),
  );
  ipcMain.handle(IPC.FS_READ_FILE, async (_event, worktreePath: string, relPath: string) =>
    FileService.readFile(worktreePath, relPath),
  );
  ipcMain.handle(IPC.FS_WRITE_FILE, async (_event, worktreePath: string, relPath: string, content: string) =>
    FileService.writeFile(worktreePath, relPath, content),
  );

  ipcMain.handle(
    IPC.PTY_CREATE,
    async (_event, worktreePath: string, shell?: string, command?: string, extraEnv?: Record<string, string>) => {
      const win = BrowserWindow.fromWebContents(_event.sender);
      if (!win) throw new Error("No BrowserWindow for PTY.");
      return ptyService.create(worktreePath, win.webContents, shell, command, extraEnv);
    },
  );
  ipcMain.on(IPC.PTY_WRITE, (_event, id: string, data: string) => ptyService.write(id, data));
  ipcMain.on(IPC.PTY_RESIZE, (_event, id: string, cols: number, rows: number) =>
    ptyService.resize(id, cols, rows),
  );
  ipcMain.on(IPC.PTY_DESTROY, (_event, id: string) => ptyService.destroy(id));
  ipcMain.handle(IPC.PTY_REATTACH, async (_event, id: string) => {
    const win = BrowserWindow.fromWebContents(_event.sender);
    if (!win) return { replay: "", alive: false };
    return ptyService.reattach(id, win.webContents);
  });

  ipcMain.handle(IPC.CONTEXT_CREATE_BUNDLE, async (_event, input: CreateBundleInput) =>
    ContextService.createBundle(input),
  );
}

