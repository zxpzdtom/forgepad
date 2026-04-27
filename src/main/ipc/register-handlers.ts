import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { execFile } from "node:child_process";
import { watch as watchFs } from "node:fs";
import type { FSWatcher } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { IPC } from "@shared/ipc";
import type {
  CreateBundleInput,
  PersistedAppState,
  WorkspaceChangeEvent,
} from "@shared/types";
import { ContextService } from "@main/services/context-service";
import { FileService } from "@main/services/file-service";
import { GitService } from "@main/services/git-service";
import { resolveInsideRoot } from "@main/services/path-guard";
import { PtyService } from "@main/services/pty-service";
import { StateService } from "@main/services/state-service";

const ptyService = new PtyService();
const execFileAsync = promisify(execFile);

type FileWatch = {
  watcher: FSWatcher;
  webContentsId: number;
  timer: NodeJS.Timeout | null;
  paths: Set<string>;
};

const fileWatches = new Map<string, FileWatch>();
let nextFileWatchId = 0;

function shouldIgnoreWatchPath(relPath: string): boolean {
  if (!relPath) return true;
  return (
    relPath === ".git" ||
    relPath.startsWith(".git/") ||
    relPath === "node_modules" ||
    relPath.startsWith("node_modules/") ||
    relPath === ".forgepad/context" ||
    relPath.startsWith(".forgepad/context/")
  );
}

function stopFileWatch(id: string): void {
  const watch = fileWatches.get(id);
  if (!watch) return;
  if (watch.timer) clearTimeout(watch.timer);
  watch.watcher.close();
  fileWatches.delete(id);
}

function queueFileChange(id: string, relPath: string): void {
  const watch = fileWatches.get(id);
  if (!watch || shouldIgnoreWatchPath(relPath)) return;
  watch.paths.add(relPath);
  if (watch.timer) clearTimeout(watch.timer);
  watch.timer = setTimeout(() => {
    const current = fileWatches.get(id);
    if (!current) return;
    current.timer = null;
    const win = BrowserWindow.fromId(current.webContentsId);
    if (!win || win.webContents.isDestroyed()) {
      stopFileWatch(id);
      return;
    }
    const payload: WorkspaceChangeEvent = {
      id,
      paths: [...current.paths].sort(),
      changedAt: Date.now(),
    };
    current.paths.clear();
    win.webContents.send(`${IPC.FS_CHANGED}:${id}`, payload);
  }, 300);
}

function createFileWatch(rootPath: string, webContentsId: number): string {
  const id = `watch-${++nextFileWatchId}`;
  let watcher: FSWatcher;
  const onChange = (_eventType: string, filename: string | Buffer | null) => {
    const relPath = filename ? filename.toString().replaceAll("\\", "/") : ".";
    queueFileChange(id, relPath);
  };

  try {
    watcher = watchFs(rootPath, { recursive: true }, onChange);
  } catch {
    watcher = watchFs(rootPath, onChange);
  }

  fileWatches.set(id, {
    watcher,
    webContentsId,
    timer: null,
    paths: new Set(),
  });
  watcher.on("error", () => stopFileWatch(id));
  return id;
}

async function openInTerminal(fullPath: string): Promise<void> {
  if (process.platform === "darwin") {
    await execFileAsync("open", ["-a", "Terminal", fullPath]);
    return;
  }

  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "wt", "-d", fullPath]);
    return;
  }

  await execFileAsync("x-terminal-emulator", ["--working-directory", fullPath]);
}

async function openInIde(fullPath: string): Promise<void> {
  const commands =
    process.env.FORGEPAD_IDE_COMMAND?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  const candidates =
    commands.length > 0 ? commands : ["code", "cursor", "windsurf", "zed"];

  for (const command of candidates) {
    try {
      await execFileAsync(command, [fullPath]);
      return;
    } catch {
      // Try the next common editor command.
    }
  }

  if (process.platform === "darwin") {
    for (const appName of ["Cursor", "Visual Studio Code", "Windsurf", "Zed"]) {
      try {
        await execFileAsync("open", ["-a", appName, fullPath]);
        return;
      } catch {
        // Try the next installed editor app.
      }
    }
  }

  throw new Error("No supported IDE command found.");
}

type DetectedIde = {
  id: string;
  label: string;
  command: string;
  appName?: string;
};

const IDE_CANDIDATES: Array<{
  id: string;
  label: string;
  command: string;
  appName: string;
}> = [
  { id: "zed", label: "Zed", command: "zed", appName: "Zed" },
  {
    id: "vscode",
    label: "VS Code",
    command: "code",
    appName: "Visual Studio Code",
  },
  { id: "cursor", label: "Cursor", command: "cursor", appName: "Cursor" },
  {
    id: "windsurf",
    label: "Windsurf",
    command: "windsurf",
    appName: "Windsurf",
  },
  {
    id: "intellij",
    label: "IntelliJ IDEA",
    command: "idea",
    appName: "IntelliJ IDEA",
  },
];

async function detectIdes(): Promise<DetectedIde[]> {
  return IDE_CANDIDATES.map((ide) => ({
    id: ide.id,
    label: ide.label,
    command: ide.command,
    appName: ide.appName,
  }));
}

type DetectedTerminal = {
  id: string;
  label: string;
  appName: string;
};

const TERMINAL_CANDIDATES: DetectedTerminal[] = [
  { id: "terminal", label: "Terminal", appName: "Terminal" },
  { id: "iterm", label: "iTerm2", appName: "iTerm" },
  { id: "ghostty", label: "Ghostty", appName: "Ghostty" },
];

async function detectTerminals(): Promise<DetectedTerminal[]> {
  return [...TERMINAL_CANDIDATES];
}

async function openWithTerminal(
  fullPath: string,
  terminalId: string,
): Promise<void> {
  if (process.platform === "darwin") {
    const term = TERMINAL_CANDIDATES.find((c) => c.id === terminalId);
    const appName = term?.appName ?? "Terminal";
    await execFileAsync("open", ["-a", appName, fullPath]);
    return;
  }
  // Fallback for non-macOS
  await openInTerminal(fullPath);
}

async function openWithIde(fullPath: string, ideId: string): Promise<void> {
  const ide = IDE_CANDIDATES.find((c) => c.id === ideId);
  if (!ide) throw new Error(`Unknown IDE: ${ideId}`);
  try {
    await execFileAsync(ide.command, [fullPath]);
    return;
  } catch {
    // CLI failed, try app
  }
  if (process.platform === "darwin" && ide.appName) {
    await execFileAsync("open", ["-a", ide.appName, fullPath]);
    return;
  }
  throw new Error(`Failed to open with ${ide.label}.`);
}

export function registerIpcHandlers(hookPort?: number): void {
  if (hookPort) ptyService.setHookPort(hookPort);
  ipcMain.handle(IPC.APP_OPEN_PROJECT, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Open Project",
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const selectedPath = result.filePaths[0];
    const isGitRepo = await GitService.isGitRepo(selectedPath);
    const repoPath = isGitRepo
      ? await GitService.getTopLevel(selectedPath).catch(() => selectedPath)
      : selectedPath;
    const branch = isGitRepo ? await GitService.getCurrentBranch(repoPath) : "";
    return {
      name: path.basename(repoPath),
      repoPath,
      branch,
      isGitRepo,
    };
  });

  ipcMain.handle(IPC.STATE_LOAD, async () => StateService.load());
  ipcMain.handle(IPC.STATE_SAVE, async (_event, state: PersistedAppState) =>
    StateService.save(state),
  );

  ipcMain.handle(IPC.GIT_CURRENT_BRANCH, async (_event, worktreePath: string) =>
    GitService.getCurrentBranch(worktreePath),
  );
  ipcMain.handle(IPC.GIT_BRANCH_STATS, async (_event, worktreePath: string) =>
    GitService.getBranchStats(worktreePath),
  );
  ipcMain.handle(IPC.GIT_STATUS, async (_event, worktreePath: string) =>
    GitService.getStatus(worktreePath),
  );
  ipcMain.handle(
    IPC.GIT_FILE_DIFF,
    async (
      _event,
      worktreePath: string,
      relPath: string,
      bucket,
      status,
      oldPath?: string,
    ) => GitService.getFileDiff(worktreePath, relPath, bucket, status, oldPath),
  );
  ipcMain.handle(
    IPC.GIT_STAGE,
    async (_event, worktreePath: string, paths: string[]) =>
      GitService.stage(worktreePath, paths),
  );
  ipcMain.handle(
    IPC.GIT_UNSTAGE,
    async (_event, worktreePath: string, paths: string[]) =>
      GitService.unstage(worktreePath, paths),
  );
  ipcMain.handle(
    IPC.GIT_DISCARD,
    async (_event, worktreePath: string, entries) =>
      GitService.discard(worktreePath, entries),
  );
  ipcMain.handle(
    IPC.GIT_COMMIT,
    async (_event, worktreePath: string, message: string) =>
      GitService.commit(worktreePath, message),
  );

  ipcMain.handle(
    IPC.FS_TREE_WITH_STATUS,
    async (_event, worktreePath: string) =>
      FileService.getTreeWithStatus(worktreePath),
  );
  ipcMain.handle(IPC.FS_LIST_FILES, async (_event, worktreePath: string) =>
    FileService.listFiles(worktreePath),
  );
  ipcMain.handle(
    IPC.FS_READ_FILE,
    async (_event, worktreePath: string, relPath: string) =>
      FileService.readFile(worktreePath, relPath),
  );
  ipcMain.handle(
    IPC.FS_READ_FILE_DATA_URL,
    async (_event, worktreePath: string, relPath: string) =>
      FileService.readFileAsDataUrl(worktreePath, relPath),
  );
  ipcMain.handle(
    IPC.FS_WRITE_FILE,
    async (_event, worktreePath: string, relPath: string, content: string) =>
      FileService.writeFile(worktreePath, relPath, content),
  );
  ipcMain.handle(IPC.FS_WATCH, async (_event, worktreePath: string) => {
    const rootPath = await resolveInsideRoot(worktreePath);
    const win = BrowserWindow.fromWebContents(_event.sender);
    if (!win) throw new Error("No BrowserWindow for file watcher.");
    const id = createFileWatch(rootPath, win.id);
    win.webContents.once("destroyed", () => stopFileWatch(id));
    return id;
  });
  ipcMain.on(IPC.FS_UNWATCH, (_event, id: string) => stopFileWatch(id));

  ipcMain.handle(
    IPC.PTY_CREATE,
    async (
      _event,
      worktreePath: string,
      shell?: string,
      command?: string,
      extraEnv?: Record<string, string>,
    ) => {
      const win = BrowserWindow.fromWebContents(_event.sender);
      if (!win) throw new Error("No BrowserWindow for PTY.");
      return ptyService.create(
        worktreePath,
        win.webContents,
        shell,
        command,
        extraEnv,
      );
    },
  );
  ipcMain.on(IPC.PTY_WRITE, (_event, id: string, data: string) =>
    ptyService.write(id, data),
  );
  ipcMain.on(IPC.PTY_RESIZE, (_event, id: string, cols: number, rows: number) =>
    ptyService.resize(id, cols, rows),
  );
  ipcMain.on(IPC.PTY_DESTROY, (_event, id: string) => ptyService.destroy(id));
  ipcMain.handle(IPC.PTY_REATTACH, async (_event, id: string) => {
    const win = BrowserWindow.fromWebContents(_event.sender);
    if (!win) return { replay: "", alive: false };
    return ptyService.reattach(id, win.webContents);
  });

  ipcMain.handle(
    IPC.CONTEXT_CREATE_BUNDLE,
    async (_event, input: CreateBundleInput) =>
      ContextService.createBundle(input),
  );

  ipcMain.handle(IPC.SHELL_OPEN_PATH, async (_event, fullPath: string) => {
    const error = await shell.openPath(fullPath);
    if (error) throw new Error(error);
  });

  ipcMain.handle(IPC.SHELL_OPEN_IN_IDE, async (_event, fullPath: string) => {
    await openInIde(fullPath);
  });

  ipcMain.handle(
    IPC.SHELL_OPEN_IN_TERMINAL,
    async (_event, fullPath: string) => {
      await openInTerminal(fullPath);
    },
  );

  ipcMain.handle(
    IPC.SHELL_SHOW_ITEM_IN_FOLDER,
    async (_event, fullPath: string) => {
      await shell.showItemInFolder(fullPath);
    },
  );

  ipcMain.handle(IPC.SHELL_DETECT_IDES, async () => detectIdes());

  ipcMain.handle(
    IPC.SHELL_OPEN_WITH_IDE,
    async (_event, fullPath: string, ideId: string) => {
      await openWithIde(fullPath, ideId);
    },
  );

  ipcMain.handle(IPC.SHELL_DETECT_TERMINALS, async () => detectTerminals());

  ipcMain.handle(
    IPC.SHELL_OPEN_WITH_TERMINAL,
    async (_event, fullPath: string, terminalId: string) => {
      await openWithTerminal(fullPath, terminalId);
    },
  );
}
