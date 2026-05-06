import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Allotment } from 'allotment';

import { useTranslation } from '@renderer/i18n';
import { ChevronLeft, ChevronRight, RefreshCw, X as XIcon } from 'lucide-react';
import { getElementSelectionScript } from '../lib/element-selection-script';
import { useAppStore } from '../store/app-store';
import { BrowserConsolePanel } from './BrowserConsolePanel';
import { BrowserFeedbackModal } from './BrowserFeedbackModal';
import type { ConsoleEntry } from './console-utils';
import { stringifyConsoleArgs } from './console-utils';
import { Tooltip } from './Tooltip';
import { UrlBar } from './UrlBar';

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
function friendlyErrorMessage(code: number, desc: string, url: string, t: (key: string, params?: Record<string, string | number>) => string): { title: string; detail: string; canRetry: boolean } {
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
        title: t('browser.failedToLoad'),
        detail: t('browser.couldNotLoad', { host }),
        canRetry: true,
      };
    case -6: // ERR_FILE_NOT_FOUND
      return {
        title: t('browser.pageNotFound'),
        detail: t('browser.pageNotFoundDetail', { host }),
        canRetry: false,
      };
    case -7: // ERR_TIMED_OUT
      return {
        title: t('browser.connectionTimeout'),
        detail: t('browser.connectionTimeoutDetail', { host }),
        canRetry: true,
      };
    case -21: // ERR_NETWORK_CHANGED
      return {
        title: t('browser.networkChanged'),
        detail: t('browser.networkChangedDetail'),
        canRetry: true,
      };
    case -100: // ERR_CONNECTION_CLOSED
      return {
        title: t('browser.connectionClosed'),
        detail: t('browser.connectionClosedDetail', { host }),
        canRetry: true,
      };
    case -101: // ERR_CONNECTION_RESET
      return {
        title: t('browser.connectionReset'),
        detail: t('browser.connectionResetDetail', { host }),
        canRetry: true,
      };
    case -102: // ERR_CONNECTION_REFUSED
      return {
        title: t('browser.connectionRefused'),
        detail: t('browser.connectionRefusedDetail', { host }),
        canRetry: true,
      };
    case -103: // ERR_CONNECTION_ABORTED
      return {
        title: t('browser.connectionAborted'),
        detail: t('browser.connectionAbortedDetail', { host }),
        canRetry: true,
      };
    case -104: // ERR_CONNECTION_FAILED
      return {
        title: t('browser.connectionFailed'),
        detail: t('browser.connectionFailedDetail', { host }),
        canRetry: true,
      };
    case -105: // ERR_NAME_NOT_RESOLVED
      return {
        title: t('browser.addressNotFound'),
        detail: t('browser.addressNotFoundDetail', { host }),
        canRetry: true,
      };
    case -106: // ERR_INTERNET_DISCONNECTED
      return {
        title: t('browser.noInternet'),
        detail: t('browser.noInternetDetail'),
        canRetry: true,
      };
    case -109: // ERR_ADDRESS_UNREACHABLE
      return {
        title: t('browser.addressUnreachable'),
        detail: t('browser.addressUnreachableDetail', { host }),
        canRetry: true,
      };
    case -118: // ERR_CONNECTION_TIMED_OUT
      return {
        title: t('browser.connectionTimeout'),
        detail: t('browser.connectionTimeoutDetail', { host }),
        canRetry: true,
      };
    case -200: // ERR_CERT_COMMON_NAME_INVALID
    case -201: // ERR_CERT_DATE_INVALID
    case -202: // ERR_CERT_AUTHORITY_INVALID
      return {
        title: t('browser.certificateError'),
        detail: t('browser.certificateErrorDetail', { host }),
        canRetry: true,
      };
    case -501: // ERR_INSECURE_RESPONSE
      return {
        title: t('browser.insecureConnection'),
        detail: t('browser.insecureConnectionDetail', { host }),
        canRetry: true,
      };
    default:
      return {
        title: t('browser.failedToLoad'),
        detail: desc || `Error ${Math.abs(code)}`,
        canRetry: true,
      };
  }
}

/** Serialize a JS execution result into a ConsoleArg for display */
function serializeResult(value: unknown): import('./console-utils').ConsoleArg {
  if (value === null) return { type: 'object', subtype: 'null' };
  if (value === undefined) return { type: 'undefined' };
  const t = typeof value;
  if (t === 'string') return { type: 'string', value };
  if (t === 'number') return { type: 'number', value };
  if (t === 'boolean') return { type: 'boolean', value };
  if (t === 'object') {
    try {
      return { type: 'object', description: JSON.stringify(value, null, 2) };
    } catch {
      return { type: 'object', description: '[object Object]' };
    }
  }
  return { type: 'string', value: String(value) };
}

function normalizeUrl(url: string): string {
  if (url === 'about:blank') return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) return url;
  return `https://${url}`;
}

export function BrowserTab({ tab }: BrowserTabProps) {
  const { t } = useTranslation();
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const [urlInput, setUrlInput] = useState(tab.url === 'about:blank' ? '' : tab.url);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const selectMode = useAppStore((s) => s.browserSelectMode[tab.id] ?? false);
  const setBrowserSelectMode = useAppStore((s) => s.setBrowserSelectMode);
  const updateBrowserNavState = useAppStore((s) => s.updateBrowserNavState);
  const openFeedbackModal = useAppStore((s) => s.openFeedbackModal);
  const addToast = useAppStore((s) => s.addToast);
  const browserHistory = useAppStore((s) => s.browserHistory);
  const addBrowserHistoryEntry = useAppStore((s) => s.addBrowserHistoryEntry);

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
      // Ensure UA is in sync (covers cases where setUserAgent was called before dom-ready)
      try {
        const preset = VIEWPORT_PRESETS[viewportModeRef.current];
        wv.setUserAgent(preset.userAgent || '');
      } catch {
        // webview may not be ready
      }
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

    // On load complete: sync nav state AND capture favicon as data URL
    const handleDidStopLoading = () => {
      sendNavState();
      const url = (() => { try { return wv.getURL(); } catch { return ''; } })();
      const title = (() => { try { return wv.getTitle(); } catch { return ''; } })();
      if (!url || url === 'about:blank') return;

      // Run inside the webview to grab the best favicon <link> and convert to data URL
      const faviconScript = `
        (() => {
          const links = [
            ...document.querySelectorAll('link[rel~="icon"], link[rel~="shortcut"]'),
          ].sort((a, b) => {
            // Prefer apple-touch-icon > icon > shortcut icon; prefer larger sizes
            const score = (el) => {
              const rel = el.rel || '';
              const s = rel.includes('apple') ? 3 : rel.includes('shortcut') ? 1 : 2;
              const size = parseInt((el.sizes && el.sizes[0]) || '0', 10) || 0;
              return s * 1000 + size;
            };
            return score(b) - score(a);
          });
          const href = links[0]?.href || '/favicon.ico';
          return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || 16;
                canvas.height = img.naturalHeight || 16;
                canvas.getContext('2d').drawImage(img, 0, 0);
                resolve(canvas.toDataURL());
              } catch { resolve(''); }
            };
            img.onerror = () => resolve('');
            img.src = href;
          });
        })()
      `;
      wv.executeJavaScript(faviconScript)
        .then((dataUrl: unknown) => {
          addBrowserHistoryEntry(url, title, typeof dataUrl === 'string' ? dataUrl : '');
        })
        .catch(() => {
          addBrowserHistoryEntry(url, title, '');
        });
    };

    wv.addEventListener('dom-ready', handleDomReady);
    wv.addEventListener('did-start-loading', handleDidStartLoading);
    wv.addEventListener('did-stop-loading', handleDidStopLoading);
    wv.addEventListener('did-navigate', sendNavState);
    wv.addEventListener('did-navigate-in-page', sendNavState);
    wv.addEventListener('page-title-updated', sendNavState);
    wv.addEventListener('did-fail-load', handleDidFailLoad);
    wv.addEventListener('new-window', handleNewWindow);

    return () => {
      domReadyRef.current = false;
      wv.removeEventListener('dom-ready', handleDomReady);
      wv.removeEventListener('did-start-loading', handleDidStartLoading);
      wv.removeEventListener('did-stop-loading', handleDidStopLoading);
      wv.removeEventListener('did-navigate', sendNavState);
      wv.removeEventListener('did-navigate-in-page', sendNavState);
      wv.removeEventListener('page-title-updated', sendNavState);
      wv.removeEventListener('did-fail-load', handleDidFailLoad);
      wv.removeEventListener('new-window', handleNewWindow);
    };
  }, [tab.id, updateBrowserNavState, addBrowserHistoryEntry]);

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
        addToast('error', t('browser.noActiveAgent'));
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

  const handleExecuteScript = useCallback(async (script: string) => {
    const wv = webviewRef.current;
    if (!wv) return;

    // Show input line immediately
    const inputEntry: ConsoleEntry = {
      id: ++consoleIdRef.current,
      level: 'log',
      args: [{ type: 'string', value: script }],
      timestamp: Date.now(),
      source: 'input',
    };
    setConsoleEntries((prev) => [...prev, inputEntry]);

    // Wrap the user script inside the webview so that:
    // 1. JS errors are caught and returned as { __error } — not thrown into Electron IPC
    // 2. Uncloneable values (window, DOM nodes, functions) are serialized to strings
    //    before crossing the IPC boundary, avoiding "object could not be cloned"
    const wrapped = `
      (() => {
        try {
          const __result = eval(${JSON.stringify(script)});
          const __t = typeof __result;
          if (__result === null)      return { __type: 'null' };
          if (__result === undefined) return { __type: 'undefined' };
          if (__t === 'string')   return { __type: 'string',  __value: __result };
          if (__t === 'number')   return { __type: 'number',  __value: __result };
          if (__t === 'boolean')  return { __type: 'boolean', __value: __result };
          if (__t === 'function') return { __type: 'function', __desc: __result.toString().slice(0, 200) };
          // Object / Array — try structured-clone-safe path first, fallback to JSON
          try {
            // Test if it can survive structured clone by round-tripping through JSON
            const __json = JSON.stringify(__result, null, 2);
            return { __type: 'object', __json: __json };
          } catch {
            return { __type: 'object', __desc: String(__result) };
          }
        } catch (e) {
          return { __error: true, __message: e instanceof Error ? e.message : String(e), __name: e instanceof Error ? e.name : 'Error' };
        }
      })()
    `;

    try {
      const envelope = await wv.executeJavaScript(wrapped);

      if (envelope?.__error) {
        // JS runtime error inside the page
        const desc = `${envelope.__name ?? 'Error'}: ${envelope.__message ?? String(envelope)}`;
        const errorEntry: ConsoleEntry = {
          id: ++consoleIdRef.current,
          level: 'error',
          args: [{ type: 'object', subtype: 'error', description: desc }],
          timestamp: Date.now(),
          source: 'error',
        };
        setConsoleEntries((prev) => [...prev, errorEntry]);
        return;
      }

      // Deserialize the envelope back into a ConsoleArg
      let arg: import('./console-utils').ConsoleArg;
      switch (envelope?.__type) {
        case 'null':      arg = { type: 'object', subtype: 'null' }; break;
        case 'undefined': arg = { type: 'undefined' }; break;
        case 'string':    arg = { type: 'string', value: envelope.__value }; break;
        case 'number':    arg = { type: 'number', value: envelope.__value }; break;
        case 'boolean':   arg = { type: 'boolean', value: envelope.__value }; break;
        case 'function':  arg = { type: 'function', description: envelope.__desc ?? 'function()' }; break;
        case 'object':    arg = { type: 'object', description: envelope.__json ?? envelope.__desc ?? '[object Object]' }; break;
        default:          arg = serializeResult(envelope); break;
      }

      const resultEntry: ConsoleEntry = {
        id: ++consoleIdRef.current,
        level: 'log',
        args: [arg],
        timestamp: Date.now(),
        source: 'result',
      };
      setConsoleEntries((prev) => [...prev, resultEntry]);
    } catch (err) {
      // Unexpected Electron/IPC-level error (should be rare after wrapping)
      const errorEntry: ConsoleEntry = {
        id: ++consoleIdRef.current,
        level: 'error',
        args: [{ type: 'object', subtype: 'error', description: String(err) }],
        timestamp: Date.now(),
        source: 'error',
      };
      setConsoleEntries((prev) => [...prev, errorEntry]);
    }
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
    ? friendlyErrorMessage(loadError.errorCode, loadError.errorDescription, loadError.validatedURL, t)
    : null;

  return (
    <div className="flex h-full w-full flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-border border-b bg-panel px-2">
        {/* Back */}
        <Tooltip label={t('browser.back')} position="bottom">
          <button
            type="button"
            onClick={handleBack}
            disabled={!tab.canGoBack}
            className="rounded p-1.5 text-subtle transition-[color,background-color,scale] duration-150 hover:bg-panel-3 hover:text-text active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
        </Tooltip>

        {/* Forward */}
        <Tooltip label={t('browser.forward')} position="bottom">
          <button
            type="button"
            onClick={handleForward}
            disabled={!tab.canGoForward}
            className="rounded p-1.5 text-subtle transition-[color,background-color,scale] duration-150 hover:bg-panel-3 hover:text-text active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </Tooltip>

        {/* Reload / Stop */}
        <Tooltip label={tab.isLoading ? t('browser.stop') : t('common.reload')} position="bottom">
          <button
            type="button"
            onClick={handleReloadOrStop}
            className="rounded p-1.5 text-subtle transition-[color,background-color,scale] duration-150 hover:bg-panel-3 hover:text-text active:scale-[0.96]"
          >
            {tab.isLoading ? <XIcon size={14} /> : <RefreshCw size={14} />}
          </button>
        </Tooltip>

        {/* URL bar */}
        <UrlBar
          value={urlInput}
          onChange={setUrlInput}
          onNavigate={(url) => {
            setLoadError(null);
            webviewRef.current?.loadURL(normalizeUrl(url));
          }}
          history={browserHistory}
        />

        {/* Viewport mode toggle */}
        <Tooltip label={isMobile ? t('browser.switchDesktop') : t('browser.switchMobile')} position="bottom">
          <button
            type="button"
            onClick={handleToggleViewport}
            className={[
              'grid h-7 w-7 place-items-center rounded-md transition-[color,background-color,scale] duration-150 active:scale-[0.96]',
              isMobile ? 'bg-accent text-white' : 'text-subtle hover:bg-panel-3 hover:text-text',
            ].join(' ')}
          >
            {isMobile ? (
              <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
                <rect x="3" y="1" width="7" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <line x1="5.5" y1="10" x2="7.5" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 13" fill="none">
                <rect x="1" y="1" width="12" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
                <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="7" y1="9" x2="7" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </Tooltip>

        {/* Select Element toggle */}
        <Tooltip label={selectMode ? t('browser.exitElementSelection') : t('browser.selectElement')} position="bottom">
          <button
            type="button"
            onClick={handleToggleSelect}
            className={[
              'grid h-7 w-7 place-items-center rounded-md transition-[color,background-color,scale] duration-150 active:scale-[0.96]',
              selectMode ? 'bg-accent text-white' : 'text-subtle hover:bg-panel-3 hover:text-text',
            ].join(' ')}
          >
            <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="6.5" cy="6.5" r="1.5" fill="currentColor" />
              <path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </Tooltip>

        {/* Console toggle */}
        <Tooltip label={consoleOpen ? t('browser.hideConsole') : t('browser.showConsole')} position="bottom">
          <button
            type="button"
            onClick={() => setConsoleOpen((v) => !v)}
            className={[
              'relative grid h-7 w-7 place-items-center rounded-md transition-[color,background-color,scale] duration-150 active:scale-[0.96]',
              consoleOpen ? 'bg-accent text-white' : 'text-subtle hover:bg-panel-3 hover:text-text',
            ].join(' ')}
          >
            <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="2" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M3.5 5.5l2 1.5-2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="7" y1="8.5" x2="9.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {consoleErrorCount > 0 && !consoleOpen && (
              <span
                key={consoleErrorCount}
                className="console-badge console-badge-pulse absolute -top-1 -right-1 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-danger px-0.5 font-mono text-[9px] text-white leading-none"
              >
                {consoleErrorCount > 99 ? '99+' : consoleErrorCount}
              </span>
            )}
          </button>
        </Tooltip>
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
                  useragent={VIEWPORT_PRESETS[viewportMode].userAgent || ''}
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
                  useragent={VIEWPORT_PRESETS[viewportMode].userAgent || ''}
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
                  {t('browser.selectHint')}
                </div>
              </div>
            )}
          </div>
        </Allotment.Pane>

        <Allotment.Pane preferredSize={200} minSize={consoleOpen ? 80 : 0} visible={consoleOpen}>
          <BrowserConsolePanel entries={consoleEntries} onClear={handleConsoleClear} onSendToAgent={handleSendToAgent} onExecuteScript={handleExecuteScript} />
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
  const { t } = useTranslation();
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
            className="mt-1 flex h-8 items-center gap-1.5 rounded-md bg-accent px-4 font-medium text-white text-xs transition-[background-color,scale] duration-150 hover:bg-accent/90 active:scale-[0.96]"
          >
            <RefreshCw size={13} />
            {t('common.retry')}
          </button>
        )}
      </div>
    </div>
  );
}
