import { randomUUID } from 'node:crypto';
import { type BrowserWindow, WebContentsView } from 'electron';

import { IPC } from '../../shared/ipc';
import type { BrowserNavState, SelectedElementInfo, ViewBounds } from '../../shared/types';
import { getElementSelectionScript } from './element-selection-script';

interface ManagedView {
  id: string;
  view: WebContentsView;
  bounds: ViewBounds;
  visible: boolean;
  selectModeActive: boolean;
  // Stored so we can remove it later
  consoleHandler: ((...args: unknown[]) => void) | null;
}

export class BrowserService {
  private views = new Map<string, ManagedView>();
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  create(initialUrl?: string): string {
    const id = randomUUID();

    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: true,
      },
    });

    const bounds: ViewBounds = { x: 0, y: 0, width: 800, height: 600 };
    view.setBounds(bounds);

    this.mainWindow.contentView.addChildView(view);
    view.setVisible(false);

    const managed: ManagedView = {
      id,
      view,
      bounds,
      visible: false,
      selectModeActive: false,
      consoleHandler: null,
    };
    this.views.set(id, managed);

    this.attachNavigationListeners(managed);

    const url = initialUrl || 'about:blank';
    view.webContents.loadURL(this.normalizeUrl(url));

    return id;
  }

  destroy(tabId: string): void {
    const managed = this.views.get(tabId);
    if (!managed) return;

    if (managed.consoleHandler) {
      managed.view.webContents.removeListener(
        'console-message',
        managed.consoleHandler as Parameters<typeof managed.view.webContents.removeListener>[1],
      );
    }

    this.mainWindow.contentView.removeChildView(managed.view);

    if (!managed.view.webContents.isDestroyed()) {
      managed.view.webContents.close();
    }

    this.views.delete(tabId);
  }

  destroyAll(): void {
    for (const [id] of this.views) {
      this.destroy(id);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  navigate(tabId: string, url: string): void {
    this.getOrThrow(tabId).view.webContents.loadURL(this.normalizeUrl(url));
  }

  goBack(tabId: string): void {
    this.getOrThrow(tabId).view.webContents.goBack();
  }

  goForward(tabId: string): void {
    this.getOrThrow(tabId).view.webContents.goForward();
  }

  reload(tabId: string): void {
    this.getOrThrow(tabId).view.webContents.reload();
  }

  stop(tabId: string): void {
    this.getOrThrow(tabId).view.webContents.stop();
  }

  // ── Bounds & Visibility ───────────────────────────────────────────────────

  setBounds(tabId: string, bounds: ViewBounds): void {
    const managed = this.getOrThrow(tabId);
    managed.bounds = bounds;
    if (managed.visible) {
      managed.view.setBounds(bounds);
    }
  }

  setVisible(tabId: string, visible: boolean): void {
    const managed = this.getOrThrow(tabId);
    managed.visible = visible;
    managed.view.setVisible(visible);
    if (visible) {
      managed.view.setBounds(managed.bounds);
    }
  }

  // ── Element Selection ─────────────────────────────────────────────────────

  async startSelectMode(tabId: string): Promise<void> {
    const managed = this.getOrThrow(tabId);
    if (managed.selectModeActive) return;
    managed.selectModeActive = true;

    const script = getElementSelectionScript();
    await managed.view.webContents.executeJavaScript(script);

    const handler = this.createConsoleHandler(managed);
    managed.consoleHandler = handler as (...args: unknown[]) => void;
    managed.view.webContents.on('console-message', handler);
  }

  async stopSelectMode(tabId: string): Promise<void> {
    const managed = this.getOrThrow(tabId);
    if (!managed.selectModeActive) return;
    managed.selectModeActive = false;

    if (managed.consoleHandler) {
      managed.view.webContents.removeListener(
        'console-message',
        managed.consoleHandler as Parameters<typeof managed.view.webContents.removeListener>[1],
      );
      managed.consoleHandler = null;
    }

    // Clean up the overlay if still present
    await managed.view.webContents
      .executeJavaScript(
        `(() => {
          const o = document.getElementById('__forgepad_select_overlay__');
          if (o) o.remove();
          const h = document.querySelector('[style*="__forgepad"]');
          if (h) h.remove();
          window.__forgepadSelectActive__ = false;
        })()`,
      )
      .catch(() => {
        // Ignore if page was navigated away
      });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private getOrThrow(tabId: string): ManagedView {
    const managed = this.views.get(tabId);
    if (!managed) throw new Error(`No browser view for tab: ${tabId}`);
    return managed;
  }

  private normalizeUrl(url: string): string {
    if (url === 'about:blank') return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) return url;
    return `https://${url}`;
  }

  private attachNavigationListeners(managed: ManagedView): void {
    const wc = managed.view.webContents;

    const sendNavState = (): void => {
      if (this.mainWindow.isDestroyed()) return;
      const state: BrowserNavState = {
        tabId: managed.id,
        url: wc.getURL(),
        title: wc.getTitle() || wc.getURL(),
        isLoading: wc.isLoading(),
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
      };
      this.mainWindow.webContents.send(IPC.BROWSER_NAV_STATE, state);
    };

    wc.on('did-start-loading', sendNavState);
    wc.on('did-stop-loading', sendNavState);
    wc.on('did-navigate', sendNavState);
    wc.on('did-navigate-in-page', sendNavState);
    wc.on('page-title-updated', sendNavState);

    // Redirect new-window requests to load in the same view
    wc.setWindowOpenHandler(({ url }) => {
      wc.loadURL(url);
      return { action: 'deny' };
    });
  }

  private createConsoleHandler(managed: ManagedView) {
    const PREFIX = '__FORGEPAD_SELECT__:';

    const handler = async (_event: Electron.Event, _level: number, message: string): Promise<void> => {
      if (!message.startsWith(PREFIX)) return;

      const jsonStr = message.slice(PREFIX.length);
      let data: {
        selector: string;
        tagName: string;
        outerHTML: string;
        boundingRect: { x: number; y: number; width: number; height: number };
        pageUrl: string;
        pageTitle: string;
      };

      try {
        data = JSON.parse(jsonStr);
      } catch {
        return;
      }

      const screenshotBase64 = await this.captureElementScreenshot(managed, data.boundingRect);

      const elementInfo: SelectedElementInfo = {
        ...data,
        screenshotBase64,
      };

      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC.BROWSER_ELEMENT_SELECTED, {
          tabId: managed.id,
          element: elementInfo,
        });
      }

      // Auto-exit select mode after a successful selection
      managed.selectModeActive = false;
      managed.view.webContents.removeListener(
        'console-message',
        handler as Parameters<typeof managed.view.webContents.removeListener>[1],
      );
      managed.consoleHandler = null;
    };

    return handler;
  }

  private async captureElementScreenshot(
    managed: ManagedView,
    rect: { x: number; y: number; width: number; height: number },
  ): Promise<string> {
    try {
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const image = await managed.view.webContents.capturePage({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: w,
        height: h,
      });
      return image.toPNG().toString('base64');
    } catch {
      return '';
    }
  }
}
