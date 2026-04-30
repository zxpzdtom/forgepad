import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Allotment } from 'allotment';

import { getElementSelectionScript } from '../lib/element-selection-script';
import { useAppStore } from '../store/app-store';
import { BrowserConsolePanel } from './BrowserConsolePanel';
import { BrowserFeedbackModal } from './BrowserFeedbackModal';
import type { ConsoleEntry } from './console-utils';
import { stringifyConsoleArgs } from './console-utils';

type BrowserTabProps = {
  tab: Extract<import('@shared/types').Tab, { type: 'browser' }>;
};

type ViewportMode = 'desktop' | 'mobile';

const VIEWPORT_PRESETS: Record<ViewportMode, { width: number; height: number; userAgent?: string }> = {
  desktop: { width: 0, height: 0 }, // 0 means fill container
  mobile: {
    width: 375,
    height: 812,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
};

/** Error info captured from webview did-fail-load events */
type LoadError = {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
};

/** Map common Chromium error codes to user-friendly messages */
function friendlyErrorMessage(code: number, desc: string, url: string): { title: string; detail: string; canRetry: boolean } {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  switch (code) {
    case -2: // ERR_FAILED
      return {
        title: 'Failed to load',
        detail: `Could not load ${host}`,
        canRetry: true,
      };
    case -6: // ERR_FILE_NOT_FOUND
      return {
        title: 'Page not found',
        detail: `The page at ${host} could not be found`,
        canRetry: false,
      };
    case -7: // ERR_TIMED_OUT
      return {
        title: 'Connection timed out',
        detail: `${host} took too long to respond`,
        canRetry: true,
      };
    case -21: // ERR_NETWORK_CHANGED
      return {
        title: 'Network changed',
        detail: 'Your network connection changed during loading',
        canRetry: true,
      };
    case -100: // ERR_CONNECTION_CLOSED
      return {
        title: 'Connection closed',
        detail: `${host} closed the connection`,
        canRetry: true,
      };
    case -101: // ERR_CONNECTION_RESET
      return {
        title: 'Connection reset',
        detail: `The connection to ${host} was reset`,
        canRetry: true,
      };
    case -102: // ERR_CONNECTION_REFUSED
      return {
        title: 'Connection refused',
        detail: `${host} refused to connect. Check if the server is running.`,
        canRetry: true,
      };
    case -103: // ERR_CONNECTION_ABORTED
      return {
        title: 'Connection aborted',
        detail: `The connection to ${host} was aborted`,
        canRetry: true,
      };
    case -104: // ERR_CONNECTION_FAILED
      return {
        title: 'Connection failed',
        detail: `Could not connect to ${host}`,
        canRetry: true,
      };
    case -105: // ERR_NAME_NOT_RESOLVED
      return {
        title: 'Address not found',
        detail: `Could not resolve ${host}. Check the URL or your DNS settings.`,
        canRetry: true,
      };
    case -106: // ERR_INTERNET_DISCONNECTED
      return {
        title: 'No internet',
        detail: 'Your device is not connected to the internet',
        canRetry: true,
      };
    case -109: // ERR_ADDRESS_UNREACHABLE
      return {
        title: 'Address unreachable',
        detail: `${host} is unreachable`,
        canRetry: true,
      };
    case -118: // ERR_CONNECTION_TIMED_OUT
      return {
        title: 'Connection timed out',
        detail: `${host} took too long to respond`,
        canRetry: true,
      };
    case -200: // ERR_CERT_COMMON_NAME_INVALID
    case -201: // ERR_CERT_DATE_INVALID
    case -202: // ERR_CERT_AUTHORITY_INVALID
      return {
        title: 'Certificate error',
        detail: `The security certificate for ${host} is not trusted`,
        canRetry: true,
      };
    case -501: // ERR_INSECURE_RESPONSE
      return {
        title: 'Insecure connection',
        detail: `${host} sent an insecure response`,
        canRetry: true,
      };
    default:
      return {
        title: 'Failed to load',
        detail: desc || `Error ${code}`,
        canRetry: true,
      };
  }
}

function normalizeUrl(url: string): string {
  if (url === 'about:blank') return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) return url;
  return `https://${url}`;
}

export function BrowserTab({ tab }: BrowserTabProps) {
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const [urlInput, setUrlInput] = useState(tab.url === 'about:blank' ? '' : tab.url);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const selectMode = useAppStore((s) => s.browserSelectMode[tab.id] ?? false);
  const setBrowserSelectMode = useAppStore((s) => s.setBrowserSelectMode);
  const updateBrowserNavState = useAppStore((s) => s.updateBrowserNavState);
  const openFeedbackModal = useAppStore((s) => s.openFeedbackModal);
  const addToast = useAppStore((s) => s.addToast);

  // Console panel state
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const consoleIdRef = useRef(0);

  const consoleErrorCount = useMemo(() => consoleEntries.filter((e) => e.level === 'error').length, [consoleEntries]);

  // Sync URL bar when navigation state changes externally
  useEffect(() => {
    if (tab.url !== 'about:blank') {
      setUrlInput(tab.url);
    }
  }, [tab.url]);

  // Track whether dom-ready has fired so we know the webview API is usable
  const domReadyRef = useRef(false);
  // Keep a ref to viewportMode so event listeners can read the latest value
  const viewportModeRef = useRef(viewportMode);
  viewportModeRef.current = viewportMode;

  // ── Attach webview event listeners ─────────────────────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    /** Inject mobile-style thin overlay scrollbar CSS into the webview page */
    const injectMobileScrollbar = () => {
      if (viewportModeRef.current !== 'mobile') return;
      const css = `
        (function() {
          var id = '__forgepad_mobile_scrollbar__';
          var existing = document.getElementById(id);
          if (existing) existing.remove();
          var style = document.createElement('style');
          style.id = id;
          style.textContent =
            '::-webkit-scrollbar { width: 5px; height: 5px; }' +
            '::-webkit-scrollbar-track { background: transparent; }' +
            '::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); border-radius: 10px; }' +
            '::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.6); }';
          (document.head || document.documentElement).appendChild(style);
        })()
      `;
      wv.executeJavaScript(css).catch(() => {});
    };

    const sendNavState = () => {
      if (!domReadyRef.current) return;
      try {
        updateBrowserNavState({
          tabId: tab.id,
          url: wv.getURL(),
          title: wv.getTitle() || wv.getURL(),
          isLoading: wv.isLoading(),
          canGoBack: wv.canGoBack(),
          canGoForward: wv.canGoForward(),
        });
      } catch {
        // webview may not be ready yet
      }
    };

    const handleDomReady = () => {
      domReadyRef.current = true;
      sendNavState();
      // Apply or remove touch emulation + mobile scrollbar based on current mode
      const isMobile = viewportModeRef.current === 'mobile';
      try {
        const wcId = wv.getWebContentsId();
        window.forgepad.browser.setTouchEmulation(wcId, isMobile).catch(() => {});
      } catch {
        // webContentsId may not be available
      }
      if (isMobile) {
        injectMobileScrollbar();
      }
    };

    const handleDidStartLoading = () => {
      setLoadError(null);
      sendNavState();
      // Clear console entries on page navigation (full reload / new URL)
      setConsoleEntries([]);
    };

    // webview DOM events have extra properties attached directly to the Event object
    const handleDidFailLoad = (e: Event) => {
      const ev = e as Event & {
        errorCode: number;
        errorDescription: string;
        validatedURL: string;
      };
      // ERR_ABORTED (-3) is fired on user-initiated navigation cancels — ignore it
      if (ev.errorCode === -3) return;
      setLoadError({
        errorCode: ev.errorCode,
        errorDescription: ev.errorDescription,
        validatedURL: ev.validatedURL,
      });
      sendNavState();
    };

    // new-window event also has url property on the Event object
    const handleNewWindow = (e: Event) => {
      e.preventDefault();
      const ev = e as Event & { url: string };
      if (domReadyRef.current) {
        wv.loadURL(ev.url);
      }
    };

    wv.addEventListener('dom-ready', handleDomReady);
    wv.addEventListener('did-start-loading', handleDidStartLoading);
    wv.addEventListener('did-stop-loading', sendNavState);
    wv.addEventListener('did-navigate', sendNavState);
    wv.addEventListener('did-navigate-in-page', sendNavState);
    wv.addEventListener('page-title-updated', sendNavState);
    wv.addEventListener('did-fail-load', handleDidFailLoad);
    wv.addEventListener('new-window', handleNewWindow);

    return () => {
      domReadyRef.current = false;
      wv.removeEventListener('dom-ready', handleDomReady);
      wv.removeEventListener('did-start-loading', handleDidStartLoading);
      wv.removeEventListener('did-stop-loading', sendNavState);
      wv.removeEventListener('did-navigate', sendNavState);
      wv.removeEventListener('did-navigate-in-page', sendNavState);
      wv.removeEventListener('page-title-updated', sendNavState);
      wv.removeEventListener('did-fail-load', handleDidFailLoad);
      wv.removeEventListener('new-window', handleNewWindow);
    };
  }, [tab.id, updateBrowserNavState]);

  // ── Element selection via console-message ──────────────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || !selectMode) return;

    if (domReadyRef.current) {
      const script = getElementSelectionScript();
      wv.executeJavaScript(script).catch(() => {});
    }

    const PREFIX = '__FORGEPAD_SELECT__:';

    // webview console-message events expose { message, level, ... } directly on Event
    const handleConsoleMessage = async (e: Event) => {
      const ev = e as Event & { message: string };
      if (!ev.message?.startsWith(PREFIX)) return;
      const jsonStr = ev.message.slice(PREFIX.length);
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

      // Capture screenshot via IPC to main process
      let screenshotBase64 = '';
      try {
        const webContentsId = wv.getWebContentsId();
        screenshotBase64 = await window.forgepad.browser.captureScreenshot(webContentsId, data.boundingRect);
      } catch {
        // Screenshot capture may fail
      }

      openFeedbackModal(tab.id, { ...data, screenshotBase64 });
      setBrowserSelectMode(tab.id, false);
    };

    wv.addEventListener('console-message', handleConsoleMessage);
    return () => {
      wv.removeEventListener('console-message', handleConsoleMessage);
    };
  }, [selectMode, tab.id, openFeedbackModal, setBrowserSelectMode]);

  // ── Collect webview console messages via CDP ──────────────────────────
  const webContentsIdRef = useRef<number | null>(null);

  // Enable CDP console capture.
  // We enable once on dom-ready (earliest point webContentsId is available),
  // then re-enable on did-navigate to capture logs from new page contexts.
  // Main process guards against duplicate handlers, so double-calls are safe.
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const enableConsole = () => {
      try {
        const wcId = wv.getWebContentsId();
        webContentsIdRef.current = wcId;
        window.forgepad.browser.enableConsole(wcId).catch(() => {});
      } catch {
        // webContentsId may not be available yet
      }
    };

    // dom-ready: first time webContentsId becomes available
    const handleReady = () => {
      enableConsole();
    };

    // did-navigate: page navigated to a new URL — re-enable Runtime domain
    // for the new execution context so we capture logs from the start.
    const handleNavigate = () => {
      if (webContentsIdRef.current != null) {
        enableConsole();
      }
    };

    if (domReadyRef.current) enableConsole();
    wv.addEventListener('dom-ready', handleReady);
    wv.addEventListener('did-navigate', handleNavigate);

    return () => {
      wv.removeEventListener('dom-ready', handleReady);
      wv.removeEventListener('did-navigate', handleNavigate);
      const wcId = webContentsIdRef.current;
      if (wcId != null) {
        window.forgepad.browser.disableConsole(wcId).catch(() => {});
        webContentsIdRef.current = null;
      }
    };
  }, [tab.id]);

  // Listen for structured CDP console events
  useEffect(() => {
    const TYPE_MAP: Record<string, ConsoleEntry['level']> = {
      log: 'log',
      info: 'log',
      warning: 'warn',
      warn: 'warn',
      error: 'error',
      debug: 'debug',
      verbose: 'debug',
      dir: 'log',
      table: 'log',
      assert: 'error',
    };

    const cleanup = window.forgepad.browser.onConsoleEvent((raw: unknown) => {
      const evt = raw as {
        webContentsId: number;
        type: string;
        args: Array<{
          type: string;
          subtype?: string;
          value?: unknown;
          description?: string;
          className?: string;
          preview?: {
            type: string;
            subtype?: string;
            description?: string;
            properties?: Array<{
              name: string;
              type: string;
              value?: string;
              subtype?: string;
            }>;
          };
        }>;
        timestamp: number;
        stackTrace?: {
          callFrames: Array<{
            url: string;
            lineNumber: number;
            columnNumber: number;
          }>;
        };
      };

      // Only handle events for this tab's webContents
      if (evt.webContentsId !== webContentsIdRef.current) return;

      // Skip our internal element-selection messages
      if (
        evt.args.length > 0 &&
        evt.args[0].type === 'string' &&
        typeof evt.args[0].value === 'string' &&
        (evt.args[0].value as string).startsWith('__FORGEPAD_SELECT__:')
      ) {
        return;
      }

      const entry: ConsoleEntry = {
        id: ++consoleIdRef.current,
        level: TYPE_MAP[evt.type] ?? 'log',
        args: evt.args.map((arg) => ({
          type: arg.type,
          subtype: arg.subtype,
          value: arg.value,
          description: arg.description,
          className: arg.className,
          preview: arg.preview,
        })),
        timestamp: evt.timestamp ? evt.timestamp * 1000 : Date.now(),
      };
      setConsoleEntries((prev) => [...prev, entry]);
    });

    return cleanup;
  }, [tab.id]);

  // ── Send console logs to agent terminal ───────────────────────────────
  const handleSendToAgent = useCallback(
    (entries: ConsoleEntry[]) => {
      const state = useAppStore.getState();
      const agentTab =
        state.tabs.find(
          (t) => t.id === state.activeAgentTabId && t.type === 'terminal' && t.isAgent && t.workspaceId === tab.workspaceId,
        ) ?? state.tabs.find((t) => t.workspaceId === tab.workspaceId && t.type === 'terminal' && t.isAgent);

      if (!agentTab || agentTab.type !== 'terminal') {
        addToast('error', 'No active agent terminal. Please open an agent tab first.');
        return;
      }

      const prompt = [
        `[Browser Console — ${entries.length} log${entries.length > 1 ? 's' : ''}]`,
        '',
        ...entries.map((e) => `[${e.level.toUpperCase()}] ${stringifyConsoleArgs(e.args)}`),
        '',
      ].join('\n');

      window.forgepad.pty.write(agentTab.ptyId, prompt);
    },
    [tab.workspaceId, addToast],
  );

  const handleConsoleClear = useCallback(() => {
    setConsoleEntries([]);
  }, []);

  // ── Viewport mode: apply user-agent when toggling ──────────────────────
  // Touch emulation + scrollbar CSS are applied in the dom-ready handler above.
  // This effect only changes UA and triggers a reload.
  const viewportInitRef = useRef(true);
  useEffect(() => {
    if (viewportInitRef.current) {
      viewportInitRef.current = false;
      return;
    }
    const wv = webviewRef.current;
    if (!wv || !domReadyRef.current) return;

    const preset = VIEWPORT_PRESETS[viewportMode];
    try {
      wv.setUserAgent(preset.userAgent || '');
      const currentUrl = wv.getURL();
      if (currentUrl && currentUrl !== 'about:blank') {
        wv.reload();
      }
    } catch {
      // webview may not be ready
    }
  }, [viewportMode]);

  // ── Navigation handlers ───────────────────────────────────────────────
  const handleNavigate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const url = urlInput.trim();
      if (!url) return;
      setLoadError(null);
      webviewRef.current?.loadURL(normalizeUrl(url));
    },
    [urlInput],
  );

  const handleBack = useCallback(() => webviewRef.current?.goBack(), []);
  const handleForward = useCallback(() => webviewRef.current?.goForward(), []);
  const handleReloadOrStop = useCallback(() => {
    if (tab.isLoading) {
      webviewRef.current?.stop();
    } else {
      setLoadError(null);
      webviewRef.current?.reload();
    }
  }, [tab.isLoading]);

  const handleRetry = useCallback(() => {
    setLoadError(null);
    webviewRef.current?.reload();
  }, []);

  const handleToggleSelect = useCallback(() => {
    if (selectMode && domReadyRef.current) {
      webviewRef.current
        ?.executeJavaScript(
          `(() => {
          const o = document.getElementById('__forgepad_select_overlay__');
          if (o) o.remove();
          window.__forgepadSelectActive__ = false;
        })()`,
        )
        .catch(() => {});
    }
    setBrowserSelectMode(tab.id, !selectMode);
  }, [selectMode, tab.id, setBrowserSelectMode]);

  const handleToggleViewport = useCallback(() => {
    setViewportMode((prev) => (prev === 'desktop' ? 'mobile' : 'desktop'));
  }, []);

  // ── Webview sizing ────────────────────────────────────────────────────
  const isMobile = viewportMode === 'mobile';
  const mobilePreset = VIEWPORT_PRESETS.mobile;

  const errorInfo = loadError
    ? friendlyErrorMessage(loadError.errorCode, loadError.errorDescription, loadError.validatedURL)
    : null;

  return (
    <div className="flex h-full w-full flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-border border-b bg-panel px-2">
        {/* Back */}
        <button
          type="button"
          onClick={handleBack}
          disabled={!tab.canGoBack}
          title="Back"
          className="rounded p-1.5 text-subtle transition-colors hover:bg-panel-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Forward */}
        <button
          type="button"
          onClick={handleForward}
          disabled={!tab.canGoForward}
          title="Forward"
          className="rounded p-1.5 text-subtle transition-colors hover:bg-panel-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Reload / Stop */}
        <button
          type="button"
          onClick={handleReloadOrStop}
          title={tab.isLoading ? 'Stop' : 'Reload'}
          className="rounded p-1.5 text-subtle transition-colors hover:bg-panel-3 hover:text-text"
        >
          {tab.isLoading ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M12 7A5 5 0 1 1 7 2M7 2l2.5 2.5M7 2L4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {/* URL bar */}
        <form onSubmit={handleNavigate} className="min-w-0 flex-1">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Enter URL..."
            className="h-7 w-full rounded border border-border bg-panel-2 px-2.5 text-text text-xs transition-colors placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-accent/30 focus:ring-1"
          />
        </form>

        {/* Viewport mode toggle (PC / H5) */}
        <button
          type="button"
          onClick={handleToggleViewport}
          title={isMobile ? 'Switch to desktop view' : 'Switch to mobile view'}
          className={[
            'flex h-7 items-center gap-1 rounded px-2 font-medium text-xs transition-colors',
            isMobile ? 'bg-accent text-white' : 'border border-border bg-panel-2 text-muted hover:border-border hover:text-text',
          ].join(' ')}
        >
          {isMobile ? (
            // Phone icon
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="3" y="1" width="7" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="5.5" y1="10" x2="7.5" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          ) : (
            // Desktop icon
            <svg width="14" height="13" viewBox="0 0 14 13" fill="none">
              <rect x="1" y="1" width="12" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
              <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="7" y1="9" x2="7" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
          {isMobile ? 'H5' : 'PC'}
        </button>

        {/* Select Element toggle */}
        <button
          type="button"
          onClick={handleToggleSelect}
          title={selectMode ? 'Exit element selection' : 'Select element to comment'}
          className={[
            'flex h-7 items-center gap-1.5 rounded px-2.5 font-medium text-xs transition-colors',
            selectMode
              ? 'bg-accent text-white'
              : 'border border-border bg-panel-2 text-muted hover:border-border hover:text-text',
          ].join(' ')}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor" />
            <path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          {selectMode ? 'Selecting\u2026' : 'Inspect'}
        </button>

        {/* Console toggle */}
        <button
          type="button"
          onClick={() => setConsoleOpen((v) => !v)}
          title={consoleOpen ? 'Hide console' : 'Show console'}
          className={[
            'flex h-7 items-center gap-1 rounded px-2 font-medium text-xs transition-colors',
            consoleOpen
              ? 'bg-accent text-white'
              : 'border border-border bg-panel-2 text-muted hover:border-border hover:text-text',
          ].join(' ')}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="2" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3.5 5.5l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="7" y1="8.5" x2="9.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Console
          {consoleErrorCount > 0 && !consoleOpen && (
            <span
              key={consoleErrorCount}
              className="console-badge console-badge-pulse ml-0.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] text-white leading-none"
            >
              {consoleErrorCount > 99 ? '99+' : consoleErrorCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Loading bar ───────────────────────────────────────────────────── */}
      {tab.isLoading && (
        <div className="h-[2px] w-full shrink-0 overflow-hidden bg-panel-3">
          <div className="h-full animate-[browser-loading_1.4s_ease-in-out_infinite] bg-accent" />
        </div>
      )}

      {/* ── Webview + Console split ──────────────────────────────────────── */}
      <Allotment vertical className="min-h-0 flex-1">
        <Allotment.Pane minSize={100}>
          <div className={`relative size-full ${isMobile ? 'flex items-start justify-center bg-panel-2 pt-4' : ''}`}>
            {/* Mobile device frame */}
            {isMobile ? (
              <div
                className="relative shrink-0 overflow-hidden rounded-xl border border-border shadow-lg"
                style={{
                  width: mobilePreset.width,
                  height: mobilePreset.height,
                  maxHeight: '100%',
                }}
              >
                <webview
                  ref={webviewRef}
                  src={tab.url || 'about:blank'}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'inline-flex',
                  }}
                />
                {errorInfo && <ErrorOverlay error={errorInfo} errorCode={loadError!.errorCode} onRetry={handleRetry} />}
              </div>
            ) : (
              <>
                <webview
                  ref={webviewRef}
                  src={tab.url || 'about:blank'}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    display: 'inline-flex',
                  }}
                />
                {errorInfo && <ErrorOverlay error={errorInfo} errorCode={loadError!.errorCode} onRetry={handleRetry} />}
              </>
            )}

            {/* Select mode overlay hint */}
            {selectMode && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-4">
                <div className="rounded-full border border-accent/50 bg-panel/90 px-3 py-1.5 text-accent text-xs shadow backdrop-blur-sm">
                  Click any element on the page &bull; ESC to cancel
                </div>
              </div>
            )}
          </div>
        </Allotment.Pane>

        <Allotment.Pane preferredSize={200} minSize={consoleOpen ? 80 : 0} visible={consoleOpen}>
          <BrowserConsolePanel entries={consoleEntries} onClear={handleConsoleClear} onSendToAgent={handleSendToAgent} />
        </Allotment.Pane>
      </Allotment>

      {/* Feedback modal */}
      <BrowserFeedbackModal />
    </div>
  );
}

// ── Error Overlay Component ───────────────────────────────────────────────
function ErrorOverlay({
  error,
  errorCode,
  onRetry,
}: {
  error: { title: string; detail: string; canRetry: boolean };
  errorCode: number;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg">
      <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
        {/* Error icon */}
        <div className="flex size-12 items-center justify-center rounded-full bg-panel-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" className="text-subtle" />
            <path d="M12 8v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-subtle" />
            <circle cx="12" cy="16" r="0.5" fill="currentColor" stroke="currentColor" strokeWidth="0.5" className="text-subtle" />
          </svg>
        </div>

        {/* Title */}
        <h3 className="font-medium text-sm text-text">{error.title}</h3>

        {/* Detail */}
        <p className="text-xs leading-relaxed text-muted">{error.detail}</p>

        {/* Error code badge */}
        <span className="rounded bg-panel-2 px-2 py-0.5 font-mono text-[10px] text-subtle">ERR_{Math.abs(errorCode)}</span>

        {/* Retry button */}
        {error.canRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 flex h-8 items-center gap-1.5 rounded-md bg-accent px-4 font-medium text-white text-xs transition-colors hover:bg-accent/90 active:bg-accent/80"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path
                d="M12 7A5 5 0 1 1 7 2M7 2l2.5 2.5M7 2L4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
