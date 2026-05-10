/**
 * Minimal preload for the popout browser window.
 * Only exposes browser/extension APIs + tab management IPC from menu accelerators.
 * Does NOT expose git, fs, pty, agent, state, or any main-window-only APIs.
 */
import { IPC } from '@shared/ipc';
import type { ExtensionInfo } from '@shared/types';
import { contextBridge, ipcRenderer } from 'electron';

// ── Extract initial params from command-line arguments ──────────────────
function getArg(name: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? decodeURIComponent(arg.slice(prefix.length)) : '';
}

const browserApi = {
  // ── Init data (read once on mount) ──
  init: {
    initialUrl: getArg('initial-url'),
    locale: (getArg('locale') || 'en') as 'en' | 'zh-CN',
    theme: getArg('theme') || 'dark',
    defaultHomepage: getArg('default-homepage') || 'https://www.google.com',
  },

  // ── Browser webview control ──
  browser: {
    captureScreenshot: (webContentsId: number, rect: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke(IPC.BROWSER_CAPTURE_SCREENSHOT, {
        webContentsId,
        rect,
      }) as Promise<string>,
    setTouchEmulation: (webContentsId: number, enabled: boolean) =>
      ipcRenderer.invoke(IPC.BROWSER_SET_TOUCH_EMULATION, {
        webContentsId,
        enabled,
      }) as Promise<void>,
    enableConsole: (webContentsId: number) =>
      ipcRenderer.invoke(IPC.BROWSER_ENABLE_CONSOLE, {
        webContentsId,
      }) as Promise<void>,
    disableConsole: (webContentsId: number) =>
      ipcRenderer.invoke(IPC.BROWSER_DISABLE_CONSOLE, {
        webContentsId,
      }) as Promise<void>,
    openDevTools: (webContentsId: number) =>
      ipcRenderer.invoke(IPC.BROWSER_OPEN_DEVTOOLS, {
        webContentsId,
      }) as Promise<void>,
    onConsoleEvent: (callback: (raw: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => callback(raw);
      ipcRenderer.on(IPC.BROWSER_CONSOLE_EVENT, handler);
      return () => ipcRenderer.removeListener(IPC.BROWSER_CONSOLE_EVENT, handler);
    },
  },

  // ── Extensions ──
  extension: {
    list: () => ipcRenderer.invoke(IPC.EXTENSION_LIST) as Promise<ExtensionInfo[]>,
    openPopup: (extId: string, popupPath: string, x: number, y: number, activeTabId: number, activeTabUrl?: string) =>
      ipcRenderer.invoke(IPC.EXTENSION_OPEN_POPUP, {
        extId,
        popupPath,
        x,
        y,
        activeTabId,
        activeTabUrl,
      }) as Promise<void>,
  },

  // ── Tab management IPC from main process (menu accelerators) ──
  onNewTab: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('browser:new-tab', handler);
    return () => ipcRenderer.removeListener('browser:new-tab', handler);
  },
  onCloseTab: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('browser:close-tab', handler);
    return () => ipcRenderer.removeListener('browser:close-tab', handler);
  },
  onFocusUrl: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('browser:focus-url', handler);
    return () => ipcRenderer.removeListener('browser:focus-url', handler);
  },
  onNextTab: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('browser:next-tab', handler);
    return () => ipcRenderer.removeListener('browser:next-tab', handler);
  },
  onPrevTab: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('browser:prev-tab', handler);
    return () => ipcRenderer.removeListener('browser:prev-tab', handler);
  },
  onSelectTabByIndex: (callback: (index: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, index: number) => callback(index);
    ipcRenderer.on('browser:select-tab-index', handler);
    return () => ipcRenderer.removeListener('browser:select-tab-index', handler);
  },

  // ── Extension tab creation (main asks renderer to create a tab) ──
  onExtensionTabCreate: (callback: (data: { requestId: string; url: string; active: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { requestId: string; url: string; active: boolean }) =>
      callback(data);
    ipcRenderer.on(IPC.EXTENSION_TAB_CREATE, handler);
    return () => ipcRenderer.removeListener(IPC.EXTENSION_TAB_CREATE, handler);
  },
  sendExtensionTabCreated: (requestId: string, webContentsId: number) => {
    ipcRenderer.send(IPC.EXTENSION_TAB_CREATED, { requestId, webContentsId });
  },
};

contextBridge.exposeInMainWorld('forgepadBrowser', browserApi);

export type ForgePadBrowserApi = typeof browserApi;
