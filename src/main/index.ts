import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { registerIpcHandlers } from "./ipc/register-handlers";

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: "ForgePad",
    backgroundColor: "#0f1115",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
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

app.whenReady().then(() => {
  app.setName("ForgePad");
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
