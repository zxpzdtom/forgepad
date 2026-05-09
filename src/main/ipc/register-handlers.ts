import { execFile } from "node:child_process";
import type { FSWatcher } from "node:fs";
import { watch as watchFs } from "node:fs";
import { copyFile, mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createBrowserWindow } from "@main/browser-window";
import { ContextService } from "@main/services/context-service";
import { FileService } from "@main/services/file-service";
import { GitService } from "@main/services/git-service";
import { LspService } from "@main/services/lsp-service";
import { resolveInsideRoot } from "@main/services/path-guard";
import { PtyService } from "@main/services/pty-service";
import { StateService } from "@main/services/state-service";
import { IPC } from "@shared/ipc";
import type {
  CreateBundleInput,
  PersistedAppState,
  WorkspaceChangeEvent,
} from "@shared/types";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
  session,
  shell,
  webContents,
} from "electron";

export const ptyService = new PtyService();
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

export function registerIpcHandlers(
  hookPort?: number,
  hookServer?: import("../services/hook-server").HookServer,
): void {
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

  ipcMain.handle(IPC.APP_OPEN_PROJECT_FROM_PATH, async (_event, selectedPath: string) => {
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

  ipcMain.handle(IPC.APP_PICK_DIRECTORY, async (_event, title?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: title ?? "Choose Directory",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC.STATE_LOAD, async () => StateService.load());
  ipcMain.handle(IPC.STATE_SAVE, async (_event, state: PersistedAppState) => {
    await StateService.save(state);
    // Forward AI tab title settings to the hook server
    if (hookServer && state.settings) {
      hookServer.updateSettings({
        autoGenerateTabTitle: state.settings.autoGenerateTabTitle,
        tabTitlePromptTemplate: state.settings.tabTitlePromptTemplate,
        renameOnFirstMessageOnly: state.settings.renameOnFirstMessageOnly,
      });
    }
  });

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
  ipcMain.handle(IPC.GIT_PUSH, async (_event, worktreePath: string) =>
    GitService.push(worktreePath),
  );
  ipcMain.handle(IPC.GIT_PULL, async (_event, worktreePath: string) =>
    GitService.pull(worktreePath),
  );
  ipcMain.handle(
    IPC.GIT_GENERATE_COMMIT_MSG,
    async (_event, worktreePath: string, promptTemplate: string) =>
      GitService.generateCommitMessage(worktreePath, promptTemplate),
  );
  ipcMain.handle(
    IPC.GIT_WORKTREE_ADD,
    async (
      _event,
      repoPath: string,
      branch: string,
      trackRemote?: boolean,
      worktreeBaseDir?: string,
    ) => GitService.addWorktree(repoPath, branch, trackRemote, worktreeBaseDir),
  );
  ipcMain.handle(
    IPC.GIT_WORKTREE_REMOVE,
    async (
      _event,
      repoPath: string,
      worktreePath: string,
      branch: string,
      deleteBranch?: boolean,
    ) =>
      GitService.removeWorktree(repoPath, worktreePath, branch, deleteBranch),
  );
  ipcMain.handle(IPC.GIT_SCAN_WORKTREES, async (_event, baseDir: string) =>
    GitService.scanWorktrees(baseDir),
  );
  ipcMain.handle(IPC.GIT_FETCH, async (_event, repoPath: string) =>
    GitService.fetch(repoPath),
  );
  ipcMain.handle(IPC.GIT_REMOTE_BRANCHES, async (_event, repoPath: string) =>
    GitService.listRemoteBranches(repoPath),
  );
  ipcMain.handle(IPC.GIT_PR_NUMBER, async (_event, worktreePath: string) =>
    GitService.getPrInfo(worktreePath),
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
  ipcMain.handle(IPC.FS_READ_ABS_FILE, async (_event, absPath: string) =>
    FileService.readAbsFile(absPath),
  );
  ipcMain.handle(
    IPC.FS_READ_ABS_FILE_DATA_URL,
    async (_event, absPath: string) =>
      FileService.readAbsFileAsDataUrl(absPath),
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

  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    await shell.openExternal(url);
  });

  // ── Browser (<webview>) handlers ──────────────────────────────────────────
  ipcMain.handle(
    IPC.BROWSER_CAPTURE_SCREENSHOT,
    async (
      _event,
      args: {
        webContentsId: number;
        rect: { x: number; y: number; width: number; height: number };
      },
    ) => {
      const wc = webContents.fromId(args.webContentsId);
      if (!wc || wc.isDestroyed()) return "";
      try {
        const w = Math.max(1, Math.round(args.rect.width));
        const h = Math.max(1, Math.round(args.rect.height));
        const image = await wc.capturePage({
          x: Math.round(args.rect.x),
          y: Math.round(args.rect.y),
          width: w,
          height: h,
        });
        return image.toPNG().toString("base64");
      } catch {
        return "";
      }
    },
  );

  // ── CDP debugger lifecycle management ─────────────────────────────────
  // Track which features need the debugger attached per webContentsId.
  // Only detach when no feature needs it anymore.
  const cdpUsers = new Map<number, Set<string>>();

  function ensureDebugger(wcId: number): void {
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) return;
    const dbg = wc.debugger;
    if (!dbg.isAttached()) {
      dbg.attach("1.3");
    }
  }

  function addCdpUser(wcId: number, feature: string): void {
    let users = cdpUsers.get(wcId);
    if (!users) {
      users = new Set();
      cdpUsers.set(wcId, users);
    }
    users.add(feature);
  }

  function removeCdpUser(wcId: number, feature: string): void {
    const users = cdpUsers.get(wcId);
    if (!users) return;
    users.delete(feature);
    if (users.size === 0) {
      cdpUsers.delete(wcId);
      try {
        const wc = webContents.fromId(wcId);
        if (wc && !wc.isDestroyed() && wc.debugger.isAttached()) {
          wc.debugger.detach();
        }
      } catch {
        // ignore
      }
    }
  }

  // Enable/disable touch emulation via Chrome DevTools Protocol
  ipcMain.handle(
    IPC.BROWSER_SET_TOUCH_EMULATION,
    async (_event, args: { webContentsId: number; enabled: boolean }) => {
      const wc = webContents.fromId(args.webContentsId);
      if (!wc || wc.isDestroyed()) {
        console.warn(
          "[touch-emu] webContents not found or destroyed:",
          args.webContentsId,
        );
        return;
      }
      try {
        ensureDebugger(args.webContentsId);
        if (args.enabled) {
          addCdpUser(args.webContentsId, "touch");
        }
        const dbg = wc.debugger;
        await dbg.sendCommand("Emulation.setTouchEmulationEnabled", {
          enabled: args.enabled,
          maxTouchPoints: args.enabled ? 5 : 1,
        });
        await dbg.sendCommand("Emulation.setEmitTouchEventsForMouse", {
          enabled: args.enabled,
          configuration: args.enabled ? "mobile" : "desktop",
        });
        if (!args.enabled) {
          removeCdpUser(args.webContentsId, "touch");
        }
      } catch (err) {
        console.error("[touch-emu] failed:", err);
      }
    },
  );

  // ── Open DevTools for a webview ────────────────────────────────────────
  ipcMain.handle(
    IPC.BROWSER_OPEN_DEVTOOLS,
    async (_event, args: { webContentsId: number }) => {
      const wc = webContents.fromId(args.webContentsId);
      if (!wc || wc.isDestroyed()) return;
      wc.openDevTools({ mode: "undocked" });
    },
  );

  // ── Popout browser in a new window ────────────────────────────────────
  ipcMain.handle(
    IPC.BROWSER_POPOUT,
    (
      _event,
      args: {
        url: string;
        title?: string;
        locale?: string;
        theme?: string;
        defaultHomepage?: string;
      },
    ) => {
      createBrowserWindow({
        url: args.url,
        title: args.title,
        locale: args.locale,
        theme: args.theme,
        defaultHomepage: args.defaultHomepage,
      });
    },
  );

  // ── CDP console capture ──────────────────────────────────────────────
  // Structured console output via Runtime.consoleAPICalled — provides
  // full object previews, argument types, and stack traces.
  //
  // The handler is attached to the debugger exactly once per webContentsId.
  // Subsequent enableConsole calls only re-run Runtime.enable (idempotent)
  // to pick up new execution contexts after navigation, without adding
  // duplicate listeners.
  ipcMain.handle(
    IPC.BROWSER_ENABLE_CONSOLE,
    async (_event, args: { webContentsId: number }) => {
      const wc = webContents.fromId(args.webContentsId);
      if (!wc || wc.isDestroyed()) return;
      try {
        ensureDebugger(args.webContentsId);
        addCdpUser(args.webContentsId, "console");
        const dbg = wc.debugger;

        // Always re-enable Runtime domain — this is idempotent and ensures
        // new execution contexts (after navigation) are covered.
        await dbg.sendCommand("Runtime.enable");

        // Only attach the message handler once. If a handler already exists,
        // skip — it will keep forwarding events from the new context.
        if ((dbg as unknown as Record<string, unknown>).__consoleHandler) {
          return;
        }

        // Forward Runtime.consoleAPICalled events to the renderer.
        // Capture the parent window's webContents now (the IPC sender) so
        // we can route events even though the debugger callback doesn't
        // give us a webContents reference.
        const senderWc = _event.sender;
        const handler = (
          _evt: Electron.Event,
          method: string,
          params: Record<string, unknown>,
        ) => {
          if (method !== "Runtime.consoleAPICalled") return;
          if (senderWc.isDestroyed()) return;
          senderWc.send(IPC.BROWSER_CONSOLE_EVENT, {
            webContentsId: args.webContentsId,
            type: params.type,
            args: params.args,
            timestamp: params.timestamp,
            stackTrace: params.stackTrace,
          });
        };

        (dbg as unknown as Record<string, unknown>).__consoleHandler = handler;
        dbg.on("message", handler);
      } catch (err) {
        console.error("[console-cdp] enable failed:", err);
      }
    },
  );

  ipcMain.handle(
    IPC.BROWSER_DISABLE_CONSOLE,
    async (_event, args: { webContentsId: number }) => {
      const wc = webContents.fromId(args.webContentsId);
      if (!wc || wc.isDestroyed()) {
        cdpUsers.delete(args.webContentsId);
        return;
      }
      try {
        const dbg = wc.debugger;
        const handler = (dbg as unknown as Record<string, unknown>)
          .__consoleHandler as ((...a: unknown[]) => void) | undefined;
        if (handler) {
          dbg.removeListener("message", handler);
          delete (dbg as unknown as Record<string, unknown>).__consoleHandler;
        }
        if (dbg.isAttached()) {
          await dbg.sendCommand("Runtime.disable").catch(() => {});
        }
      } catch {
        // ignore
      }
      removeCdpUser(args.webContentsId, "console");
    },
  );

  // ─── Notification audio handlers ───

  ipcMain.handle(IPC.NOTIFICATION_PICK_AUDIO, async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Audio File",
      properties: ["openFile"],
      filters: [{ name: "Audio Files", extensions: ["mp3", "wav", "ogg"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const srcPath = result.filePaths[0];
    const ext = path.extname(srcPath).toLowerCase();
    const soundsDir = path.join(app.getPath("userData"), "notification-sounds");
    await mkdir(soundsDir, { recursive: true });

    // Generate a unique filename to avoid collisions
    const baseName = path.basename(srcPath, ext);
    const sanitized = baseName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
    const uniqueName = `${sanitized}_${Date.now()}${ext}`;
    const destPath = path.join(soundsDir, uniqueName);

    await copyFile(srcPath, destPath);

    // Read as data URL for renderer playback (CSP-safe)
    const buffer = await readFile(destPath);
    const mimeMap: Record<string, string> = {
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
    };
    const mime = mimeMap[ext] ?? "audio/mpeg";
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

    return { fileName: uniqueName, assetPath: destPath, dataUrl };
  });

  ipcMain.handle(
    IPC.NOTIFICATION_DELETE_AUDIO,
    async (_event, assetPath: string) => {
      // Only allow deleting from the notification-sounds directory
      const soundsDir = path.join(
        app.getPath("userData"),
        "notification-sounds",
      );
      const resolved = path.resolve(assetPath);
      if (!resolved.startsWith(path.resolve(soundsDir))) {
        throw new Error("Invalid path: outside notification-sounds directory");
      }
      try {
        await unlink(resolved);
      } catch {
        // File may already be gone; ignore
      }
    },
  );

  ipcMain.handle(IPC.APP_IS_FOCUSED, () => {
    return BrowserWindow.getFocusedWindow() !== null;
  });

  ipcMain.on(IPC.APP_FOCUS_WINDOW, () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // ── LSP (text-based symbol search) ──────────────────────────────────────
  ipcMain.handle(
    IPC.LSP_GET_DEFINITION,
    async (_event, worktreePath: string, token: string) =>
      LspService.getDefinition(worktreePath, token),
  );

  // ── System emoji picker ────────────────────────────────────────────────
  ipcMain.handle(IPC.APP_SHOW_EMOJI_PANEL, () => {
    app.showEmojiPanel();
  });

  // ── Browser extensions ────────────────────────────────────────────────

  /**
   * Resolve the best icon path from an extension's manifest.
   * Returns the relative path to the icon file, or null.
   */
  function resolveExtensionIconPath(ext: Electron.Extension): string | null {
    const action = ext.manifest.action || ext.manifest.browser_action;
    const iconConfig = action?.default_icon || ext.manifest.icons;
    if (!iconConfig) return null;
    if (typeof iconConfig === "string") return iconConfig;
    const sizes = Object.keys(iconConfig)
      .map(Number)
      .sort((a: number, b: number) => a - b);
    const best = sizes.find((s: number) => s >= 16) || sizes[sizes.length - 1];
    return best != null ? (iconConfig[best] as string) : null;
  }

  /**
   * Read the extension icon from disk and return a data: URL.
   * Falls back to null if the file can't be read.
   */
  async function resolveExtensionIconDataUrl(
    ext: Electron.Extension,
  ): Promise<string | null> {
    const relPath = resolveExtensionIconPath(ext);
    if (!relPath) return null;
    try {
      const absPath = path.join(ext.path, relPath);
      const buffer = await readFile(absPath);
      const extName = path.extname(relPath).toLowerCase();
      const mime =
        extName === ".svg"
          ? "image/svg+xml"
          : extName === ".webp"
            ? "image/webp"
            : extName === ".jpg" || extName === ".jpeg"
              ? "image/jpeg"
              : "image/png";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return null;
    }
  }

  /** Build a serializable ExtensionInfo from an Electron Extension. */
  async function toExtensionInfo(ext: Electron.Extension) {
    const action = ext.manifest.action || ext.manifest.browser_action;
    return {
      id: ext.id,
      name: ext.name,
      version: ext.version,
      path: ext.path,
      popupPath: (action?.default_popup as string) || null,
      iconUrl: await resolveExtensionIconDataUrl(ext),
    };
  }

  ipcMain.handle(IPC.EXTENSION_LIST, async () => {
    return Promise.all(
      session.defaultSession.getAllExtensions().map(toExtensionInfo),
    );
  });

  ipcMain.handle(IPC.EXTENSION_INSTALL, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog({
      ...(win ? { parentWindow: win } : {}),
      properties: ["openDirectory"],
      title: "Select Unpacked Extension Directory",
    });
    if (canceled || !filePaths[0]) return null;
    const ext = await session.defaultSession.loadExtension(filePaths[0]);
    return toExtensionInfo(ext);
  });

  ipcMain.handle(IPC.EXTENSION_UNINSTALL, (_event, id: string) => {
    session.defaultSession.removeExtension(id);
  });

  type ExtensionScriptingExecuteArgs = {
    tabId: number;
    func?: string;
    files?: string[];
    extId?: string;
  };

  async function executeExtensionScripting(
    args: ExtensionScriptingExecuteArgs,
  ): Promise<Array<{ result?: unknown; error?: { message: string } }>> {
    const wc = webContents.fromId(args.tabId);
    if (!wc || wc.isDestroyed()) return [{ result: undefined }];

    // Execute a serialized function call in the target tab.
    if (args.func) {
      try {
        const result = await wc.executeJavaScript(args.func);
        return [{ result }];
      } catch (err) {
        return [{ error: { message: String(err) } }];
      }
    }

    // Execute extension JS files in the target tab.
    if (args.files && args.extId) {
      const ext = session.defaultSession
        .getAllExtensions()
        .find((e) => e.id === args.extId);
      if (!ext) return [{ error: { message: "Extension not found" } }];

      const results: Array<{
        result?: unknown;
        error?: { message: string };
      }> = [];
      for (const file of args.files) {
        try {
          const code = await readFile(path.join(ext.path, file), "utf-8");
          const result = await wc.executeJavaScript(code);
          results.push({ result });
        } catch (err) {
          results.push({ error: { message: String(err) } });
        }
      }
      return results;
    }

    return [{ result: undefined }];
  }

  async function insertExtensionCss(args: {
    tabId: number;
    css: string;
  }): Promise<void> {
    const wc = webContents.fromId(args.tabId);
    if (!wc || wc.isDestroyed()) return;
    await wc.insertCSS(args.css);
  }

  // ── chrome.scripting polyfill — relay executeScript / insertCSS to webview ──
  ipcMain.handle(
    IPC.EXTENSION_SCRIPTING_EXECUTE,
    async (
      _event,
      args: ExtensionScriptingExecuteArgs,
    ) => executeExtensionScripting(args),
  );

  ipcMain.handle(
    IPC.EXTENSION_SCRIPTING_INSERT_CSS,
    async (_event, args: { tabId: number; css: string }) => {
      await insertExtensionCss(args);
    },
  );

  // Extension popup window — singleton, auto-closes on blur
  let extensionPopup: BrowserWindow | null = null;

  // Track context for each extension popup (keyed by popup webContents.id).
  // Populated when popup opens, used by the unified EXTENSION_MSG handler.
  const popupContextMap = new Map<
    number,
    {
      activeTabId: number;
      activeTabUrl: string;
      extId: string;
      senderWin: BrowserWindow | null;
    }
  >();

  function makeFakeTab(
    id: number,
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      id,
      active: true,
      windowId: 1,
      status: "complete",
      url: "",
      title: "",
      index: 0,
      pinned: false,
      highlighted: true,
      incognito: false,
      ...extra,
    };
  }

  // ── Unified extension API IPC handler ────────────────────────────────
  // Receives calls from the session preload's polyfill code and dispatches
  // to the appropriate handler. Context (active tab info) is looked up from
  // popupContextMap using the sender's webContents.id.
  ipcMain.handle(
    IPC.EXTENSION_MSG,
    async (event, method: string, ...args: unknown[]) => {
      const wcId = event.sender.id;
      const ctx = popupContextMap.get(wcId);
      if (!ctx) {
        throw new Error(
          `No extension popup context for webContents ${wcId}`,
        );
      }

      switch (method) {
        case "tabs.query": {
          return [
            makeFakeTab(ctx.activeTabId, { url: ctx.activeTabUrl }),
          ];
        }
        case "tabs.get": {
          const tabId = (args[0] as number) || ctx.activeTabId;
          return makeFakeTab(tabId, { url: ctx.activeTabUrl });
        }
        case "tabs.create": {
          const payload = args[0] as { url?: string; active?: boolean } | undefined;
          return createExtensionTab({
            url: payload?.url || "about:blank",
            active: payload?.active !== false,
          });
        }
        case "tabs.update": {
          const tabId = args[0] as number | undefined;
          const updateProps = args[1] as
            | { url?: string; active?: boolean }
            | undefined;
          return makeFakeTab(tabId || ctx.activeTabId, {
            url: updateProps?.url || ctx.activeTabUrl,
          });
        }
        case "tabs.remove":
          return undefined;
        case "tabs.sendMessage":
          return undefined;
        case "scripting.executeScript": {
          const payload = args[0] as {
            tabId?: number;
            func?: string;
            files?: string[];
            extId?: string;
          } | undefined;
          return executeExtensionScripting({
            tabId: payload?.tabId ?? ctx.activeTabId,
            func: payload?.func,
            files: payload?.files,
            extId: payload?.extId ?? ctx.extId,
          });
        }
        case "scripting.insertCSS": {
          const payload = args[0] as {
            tabId?: number;
            css?: string;
          } | undefined;
          await insertExtensionCss({
            tabId: payload?.tabId ?? ctx.activeTabId,
            css: payload?.css || "",
          });
          return undefined;
        }
        default:
          throw new Error(`Unknown extension method: ${method}`);
      }
    },
  );

  // ── chrome.tabs.create — extension asks to open a new tab ──
  // The popup polyfill calls this; we relay to the originating browser window
  // and wait for the renderer to report the new webContentsId.
  const pendingTabCreates = new Map<
    string,
    { resolve: (tabId: number) => void; timer: NodeJS.Timeout }
  >();

  function createExtensionTab(args: {
    url: string;
    active?: boolean;
  }): Promise<{ id: number }> {
    // Find the sender window from the current popup context
    const popupWcId = extensionPopup && !extensionPopup.isDestroyed()
      ? extensionPopup.webContents.id
      : null;
    const ctx = popupWcId ? popupContextMap.get(popupWcId) : null;
    const win = ctx?.senderWin;
    if (!win || win.isDestroyed()) return Promise.resolve({ id: 0 });

    const requestId = `tab-create-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise<{ id: number }>((resolve) => {
      const timer = setTimeout(() => {
        pendingTabCreates.delete(requestId);
        resolve({ id: 0 });
      }, 10000);

      pendingTabCreates.set(requestId, {
        resolve: (tabId) => resolve({ id: tabId }),
        timer,
      });
      win.webContents.send(IPC.EXTENSION_TAB_CREATE, {
        requestId,
        url: args.url,
        active: args.active !== false,
      });
    });
  }

  ipcMain.handle(
    IPC.EXTENSION_TAB_CREATE,
    async (_event, args: { url: string; active?: boolean }) => {
      return createExtensionTab(args);
    },
  );

  // Renderer replies with the new tab's webContentsId
  ipcMain.on(
    IPC.EXTENSION_TAB_CREATED,
    (_event, args: { requestId: string; webContentsId: number }) => {
      const pending = pendingTabCreates.get(args.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingTabCreates.delete(args.requestId);
        pending.resolve(args.webContentsId);
      }
    },
  );

  ipcMain.handle(
    IPC.EXTENSION_OPEN_POPUP,
    async (
      _event,
      args: {
        extId: string;
        popupPath: string;
        x: number;
        y: number;
        activeTabId: number;
        activeTabUrl?: string;
      },
    ) => {
      const senderWin =
        BrowserWindow.fromWebContents(_event.sender) ?? null;

      // Close any existing popup first
      if (extensionPopup && !extensionPopup.isDestroyed()) {
        extensionPopup.close();
        extensionPopup = null;
      }

      // ── Screen boundary detection ──
      const anchorX = Math.round(args.x);
      const anchorY = Math.round(args.y);
      const initialW = 400;
      const initialH = 600;

      const display = screen.getDisplayNearestPoint({ x: anchorX, y: anchorY });
      const workArea = display.workArea;

      let popX = anchorX;
      let popY = anchorY;

      if (popX + initialW > workArea.x + workArea.width) {
        popX = workArea.x + workArea.width - initialW;
      }
      if (popY + initialH > workArea.y + workArea.height) {
        popY = anchorY - initialH;
      }
      popX = Math.max(workArea.x, popX);
      popY = Math.max(workArea.y, popY);

      // Resolve active tab info
      const activeTabWc = webContents.fromId(args.activeTabId);
      const activeTabId =
        activeTabWc && !activeTabWc.isDestroyed()
          ? activeTabWc.id
          : args.activeTabId;
      const activeTabUrl =
        args.activeTabUrl ||
        (() => {
          try {
            return activeTabWc && !activeTabWc.isDestroyed()
              ? activeTabWc.getURL()
              : "";
          } catch {
            return "";
          }
        })();

      extensionPopup = new BrowserWindow({
        width: initialW,
        height: initialH,
        x: popX,
        y: popY,
        frame: false,
        resizable: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        webPreferences: {
          contextIsolation: true,
          sandbox: false,
        },
      });

      // Store context for this popup — the unified EXTENSION_MSG handler
      // will look it up by sender webContents.id when polyfill code calls IPC.
      const popupWcId = extensionPopup.webContents.id;
      popupContextMap.set(popupWcId, {
        activeTabId,
        activeTabUrl,
        extId: args.extId,
        senderWin,
      });

      // Clean up context when popup closes
      extensionPopup.on("closed", () => {
        popupContextMap.delete(popupWcId);
        extensionPopup = null;
      });

      extensionPopup.loadURL(
        `chrome-extension://${args.extId}/${args.popupPath}`,
      );

      // ── Auto-size popup to content after load ──
      extensionPopup.webContents.on("did-finish-load", () => {
        extensionPopup?.webContents
          .executeJavaScript(
            `JSON.stringify({
              w: Math.min(Math.max(document.body.scrollWidth || 350, 300), 800),
              h: Math.min(Math.max(document.body.scrollHeight || 400, 200), 600),
            })`,
          )
          .then((result: string) => {
            if (!extensionPopup || extensionPopup.isDestroyed()) return;
            try {
              const { w, h } = JSON.parse(result) as { w: number; h: number };
              const bounds = extensionPopup.getBounds();

              let newX = bounds.x;
              let newY = bounds.y;
              if (newX + w > workArea.x + workArea.width) {
                newX = workArea.x + workArea.width - w;
              }
              if (newY + h > workArea.y + workArea.height) {
                newY = workArea.y + workArea.height - h;
              }
              newX = Math.max(workArea.x, newX);
              newY = Math.max(workArea.y, newY);

              extensionPopup.setBounds({
                x: newX,
                y: newY,
                width: w,
                height: h,
              });
            } catch {
              // ignore parse errors
            }
          })
          .catch(() => {});
      });

      extensionPopup.on("blur", () => {
        extensionPopup?.close();
      });
    },
  );
}
