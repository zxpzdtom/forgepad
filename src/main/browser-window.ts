/**
 * Creates a standalone popout browser window with its own menu
 * (Cmd+T, Cmd+W, Cmd+L, Cmd+Shift+], Cmd+Shift+[).
 *
 * Loads browser.html with the dedicated browser preload script.
 */
import { join } from 'node:path';
import { app, BrowserWindow, Menu } from 'electron';

export function createBrowserWindow(opts: {
  url: string;
  title?: string;
  locale?: string;
  theme?: string;
  defaultHomepage?: string;
}): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 600,
    minHeight: 400,
    title: opts.title || 'ForgePad Browser',
    backgroundColor: '#0f1115',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 15 },
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/browser.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      additionalArguments: [
        `--initial-url=${encodeURIComponent(opts.url)}`,
        `--locale=${encodeURIComponent(opts.locale || 'en')}`,
        `--theme=${encodeURIComponent(opts.theme || 'dark')}`,
        `--default-homepage=${encodeURIComponent(opts.defaultHomepage || 'https://www.google.com')}`,
      ],
    },
  });

  win.on('ready-to-show', () => {
    win.show();
  });

  // Trust certificates in the popout window
  win.webContents.on('certificate-error' as never, (event: Event) => {
    (event as Electron.Event).preventDefault?.();
  });

  // ── Window-specific Menu with keyboard accelerators ──
  // These send IPC messages to the renderer so the React app can handle them.
  const isMac = process.platform === 'darwin';
  const modKey = isMac ? 'Cmd' : 'Ctrl';

  const buildBrowserMenu = (): Menu => {
    const template: Electron.MenuItemConstructorOptions[] = [
      // App menu (macOS only)
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: 'about' as const },
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
            label: 'New Tab',
            accelerator: `${modKey}+T`,
            click: () => {
              if (!win.isDestroyed()) win.webContents.send('browser:new-tab');
            },
          },
          {
            label: 'Close Tab',
            accelerator: `${modKey}+W`,
            click: () => {
              if (!win.isDestroyed()) win.webContents.send('browser:close-tab');
            },
          },
          { type: 'separator' },
          {
            label: 'Focus Address Bar',
            accelerator: `${modKey}+L`,
            click: () => {
              if (!win.isDestroyed()) win.webContents.send('browser:focus-url');
            },
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
      // Tab navigation
      {
        label: 'Tab',
        submenu: [
          {
            label: 'Next Tab',
            accelerator: `${modKey}+Shift+]`,
            click: () => {
              if (!win.isDestroyed()) win.webContents.send('browser:next-tab');
            },
          },
          {
            label: 'Previous Tab',
            accelerator: `${modKey}+Shift+[`,
            click: () => {
              if (!win.isDestroyed()) win.webContents.send('browser:prev-tab');
            },
          },
          { type: 'separator' },
          // Cmd+1 through Cmd+9 — select tab by index
          ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
            label: `Tab ${n}`,
            accelerator: `${modKey}+${n}`,
            click: () => {
              if (!win.isDestroyed()) win.webContents.send('browser:select-tab-index', n);
            },
          })),
          // Cmd+0 — select last tab
          {
            label: 'Last Tab',
            accelerator: `${modKey}+0`,
            click: () => {
              if (!win.isDestroyed()) win.webContents.send('browser:select-tab-index', 0);
            },
          },
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

    return Menu.buildFromTemplate(template);
  };

  // Set menu when window is focused, restore app menu when unfocused
  const browserMenu = buildBrowserMenu();

  win.on('focus', () => {
    Menu.setApplicationMenu(browserMenu);
  });

  win.on('blur', () => {
    // When blurring, the main window will set its own menu on focus.
    // If no other window takes focus (e.g., user switches to another app),
    // we leave the browser menu in place — it doesn't hurt.
  });

  // Set initial menu
  Menu.setApplicationMenu(browserMenu);

  // ── Load the browser renderer ──
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/browser.html`);
  } else {
    void win.loadFile(join(__dirname, '../renderer/browser.html'));
  }

  return win;
}
