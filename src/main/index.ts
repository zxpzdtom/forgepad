import { app, BrowserWindow, Menu, shell } from "electron";
import { join } from "node:path";
import { registerIpcHandlers, ptyService } from "./ipc/register-handlers";
import { HookServer } from "./services/hook-server";
import { AgentHooksService } from "./services/agent-hooks-service";
import { IPC } from "@shared/ipc";

let hookServer: HookServer | null = null;

function buildAppMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Settings…",
                accelerator: "CmdOrCtrl+," as const,
                click: () => {
                  const win = BrowserWindow.getFocusedWindow();
                  win?.webContents.send(IPC.MENU_OPEN_SETTINGS);
                },
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          } satisfies Electron.MenuItemConstructorOptions,
        ]
      : []),
    // File
    {
      label: "File",
      submenu: [
        {
          label: "Open Project…",
          accelerator: "CmdOrCtrl+O",
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    // Edit
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        ...(!isMac
          ? [
              { type: "separator" as const },
              {
                label: "Settings",
                accelerator: "Ctrl+,",
                click: () => {
                  const win = BrowserWindow.getFocusedWindow();
                  win?.webContents.send(IPC.MENU_OPEN_SETTINGS);
                },
              },
            ]
          : []),
      ],
    },
    // View
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    // Window
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: "ForgePad",
    backgroundColor: "#0f1115",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 14, y: 15 },
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  app.setName("ForgePad");

  // Start agent hook server
  hookServer = new HookServer();
  let hookPort = 0;
  try {
    hookPort = await hookServer.start();
  } catch (error) {
    console.error("[ForgePad] Failed to start hook server:", error);
  }

  // Inject hooks into agent configs (idempotent)
  try {
    const agentHooks = new AgentHooksService();
    await agentHooks.install();
  } catch (error) {
    console.error("[ForgePad] Failed to install agent hooks:", error);
  }

  buildAppMenu();
  registerIpcHandlers(hookPort);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  ptyService.destroyAll();
  hookServer?.stop().catch(() => {});
});
