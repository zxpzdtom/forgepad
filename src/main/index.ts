import { join } from 'node:path';
import path from 'node:path';
import { IPC } from '@shared/ipc';
import type { PetSettings } from '@shared/types';
import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from 'electron';

import { ptyService, registerIpcHandlers } from './ipc/register-handlers';
import { registerPetHandlers } from './ipc/pet-handlers';
import { createPetWindow, destroyPetWindow, getPetWindow, registerPetIpcHandlers, sendPetSettings, setPetWindowVisible } from './pet-window';
import { AgentHooksService } from './services/agent-hooks-service';
import { HookServer } from './services/hook-server';

// In dev mode, use a separate userData directory so dev and packaged app
// configurations don't interfere with each other.
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`);
}

// Register custom-pet:// protocol scheme (must happen before app.ready)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'custom-pet',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
    },
  },
]);

let hookServer: HookServer | null = null;

function buildAppMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,' as const,
                click: () => {
                  const win = BrowserWindow.getFocusedWindow();
                  win?.webContents.send(IPC.MENU_OPEN_SETTINGS);
                },
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          } satisfies Electron.MenuItemConstructorOptions,
        ]
      : []),
    // File
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                label: 'Settings',
                accelerator: 'Ctrl+,',
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
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Window
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }]),
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
    title: 'ForgePad',
    backgroundColor: '#0f1115',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 14, y: 15 },
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch((err) => {
      console.error('Failed to open external URL:', url, err);
    });
    return { action: 'deny' };
  });

  // Allow external files to be dragged into the renderer.
  // Without this Electron intercepts the drop and tries to navigate to file://.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file://')) e.preventDefault();
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  app.setName('ForgePad');

  // Handle custom-pet:// protocol — serves custom pet assets from userData/custom-pets/
  protocol.handle('custom-pet', (request) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    // Sanitize each segment to prevent path traversal
    for (const seg of segments) {
      if (seg === '..' || seg !== path.basename(seg)) {
        return new Response('Forbidden', { status: 403 });
      }
    }
    const filePath = path.join(app.getPath('userData'), 'custom-pets', ...segments);
    const customPetsRoot = path.resolve(path.join(app.getPath('userData'), 'custom-pets'));
    if (!path.resolve(filePath).startsWith(customPetsRoot)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(`file://${path.resolve(filePath)}`);
  });

  // Start agent hook server
  hookServer = new HookServer();
  let hookPort = 0;
  try {
    hookPort = await hookServer.start();
  } catch (error) {
    console.error('[ForgePad] Failed to start hook server:', error);
  }

  // Inject hooks into agent configs (idempotent)
  try {
    const agentHooks = new AgentHooksService();
    await agentHooks.install();
  } catch (error) {
    console.error('[ForgePad] Failed to install agent hooks:', error);
  }

  buildAppMenu();
  registerIpcHandlers(hookPort);
  registerPetIpcHandlers();
  registerPetHandlers();
  createWindow();

  // Listen for pet settings changes from the main renderer.
  // When the user toggles pets on/off or changes settings, the main renderer
  // sends the updated PetSettings here, and we forward them to the pet overlay window.
  ipcMain.on(IPC.PET_SETTINGS_CHANGED, (_event, settings: PetSettings) => {
    if (settings.enabled) {
      const petWin = getPetWindow();
      if (!petWin) {
        const win = createPetWindow(settings.petSize);
        // Send settings once the pet window is ready
        win.webContents.on('did-finish-load', () => {
          sendPetSettings(settings);
        });
      } else {
        setPetWindowVisible(true);
        sendPetSettings(settings);
      }
    } else {
      setPetWindowVisible(false);
    }
  });

  // Listen for permission decisions from the pet overlay window.
  ipcMain.on(
    IPC.PET_PERMISSION_DECISION,
    (_event, ptyId: string, decision: 'allow' | 'deny' | 'allowAlways' | 'answer', answers?: Record<string, string>) => {
      hookServer?.resolvePermission(ptyId, decision, answers);
    },
  );

  // Listen for permission decisions from the main renderer window.
  ipcMain.on(
    IPC.AGENT_PERMISSION_DECISION,
    (_event, ptyId: string, decision: 'allow' | 'deny' | 'allowAlways' | 'answer', answers?: Record<string, string>) => {
      hookServer?.resolvePermission(ptyId, decision, answers);
    },
  );

  app.on('activate', () => {
    // Check whether the *main* window exists – the pet overlay (skipTaskbar,
    // non-focusable) doesn't count.  Without this, clicking the Dock icon
    // after closing the main window does nothing because the pet window keeps
    // getAllWindows().length > 0.
    const mainWindowExists = BrowserWindow.getAllWindows().some(
      (w) => w !== getPetWindow() && !w.isDestroyed(),
    );
    if (!mainWindowExists) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Don't quit on macOS (standard behavior)
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  destroyPetWindow();
  ptyService.destroyAll();
  hookServer?.stop().catch(() => {});
});
