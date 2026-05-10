import clsx from 'clsx';

/**
 * PopoutBrowser — Full-featured standalone browser window.
 *
 * Manages multiple tabs (show/hide, not mount/unmount) with local React state.
 * Does NOT depend on Zustand store or main-window i18n.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Allotment } from 'allotment';
import { arrayMove } from '@dnd-kit/sortable';

import type { BrowserHistoryEntry, ExtensionInfo } from '@shared/types';
import { BrowserConsolePanel } from '../BrowserConsolePanel';
import type { ConsoleEntry } from '../console-utils';
import { Tooltip } from '../Tooltip';
import { UrlBar } from '../UrlBar';
import { PopoutTabBar } from './PopoutTabBar';

// ── Types ──────────────────────────────────────────────────────────────────

export type PopoutTab = {
  id: string;
  url: string;
  title: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

type ViewportMode = 'desktop' | 'mobile';

const VIEWPORT_PRESETS: Record<ViewportMode, { width: number; height: number; userAgent?: string }> = {
  desktop: { width: 0, height: 0 },
  mobile: {
    width: 375,
    height: 812,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
};

// ── Standalone i18n (no Zustand) ──────────────────────────────────────────

const translations: Record<string, Record<string, string>> = {
  en: {
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    stop: 'Stop',
    switchDesktop: 'Switch to desktop view',
    switchMobile: 'Switch to mobile view',
    showConsole: 'Show console',
    hideConsole: 'Hide console',
    openDevTools: 'Open DevTools',
    newTab: 'New Tab',
    urlPlaceholder: 'Enter URL or search',
  },
  'zh-CN': {
    back: '后退',
    forward: '前进',
    reload: '刷新',
    stop: '停止',
    switchDesktop: '切换到桌面视图',
    switchMobile: '切换到移动端视图',
    showConsole: '显示控制台',
    hideConsole: '隐藏控制台',
    openDevTools: '打开开发者工具',
    newTab: '新标签页',
    urlPlaceholder: '输入网址或搜索',
  },
};

function usePopoutT() {
  const locale = window.forgepadBrowser?.init?.locale || 'en';
  return useCallback((key: string) => translations[locale]?.[key] ?? translations.en[key] ?? key, [locale]);
}

// ── Helpers ────────────────────────────────────────────────────────────────

let _tabCounter = 0;
function createTabId(): string {
  return `popout-tab-${++_tabCounter}-${Date.now()}`;
}

function normalizeUrl(url: string): string {
  if (url === 'about:blank') return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) return url;
  return `https://${url}`;
}

// ── WebviewPane — manages a single webview's lifecycle ─────────────────────

type WebviewPaneProps = {
  tab: PopoutTab;
  isActive: boolean;
  viewportMode: ViewportMode;
  onNavStateChange: (tabId: string, update: Partial<PopoutTab>) => void;
  onNewWindow: (url: string) => void;
  onConsoleEvent: (tabId: string, entry: ConsoleEntry) => void;
  onHistoryEntry: (entry: BrowserHistoryEntry) => void;
  webviewRefCallback: (tabId: string, wv: Electron.WebviewTag | null) => void;
  /** Called when dom-ready fires and webContentsId is available */
  onWebContentsReady?: (tabId: string, webContentsId: number) => void;
};

function WebviewPane({
  tab,
  isActive,
  viewportMode,
  onNavStateChange,
  onNewWindow,
  onConsoleEvent,
  onHistoryEntry,
  webviewRefCallback,
  onWebContentsReady,
}: WebviewPaneProps) {
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const domReadyRef = useRef(false);
  const viewportModeRef = useRef(viewportMode);
  viewportModeRef.current = viewportMode;
  const webContentsIdRef = useRef<number | null>(null);
  const consoleIdRef = useRef(0);

  // Register/unregister the webview ref with the parent
  useEffect(() => {
    const wv = webviewRef.current;
    webviewRefCallback(tab.id, wv);
    return () => webviewRefCallback(tab.id, null);
  }, [tab.id, webviewRefCallback]);

  // ── Webview event listeners ──
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

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
        onNavStateChange(tab.id, {
          url: wv.getURL(),
          title: wv.getTitle() || wv.getURL(),
          isLoading: wv.isLoading(),
          canGoBack: wv.canGoBack(),
          canGoForward: wv.canGoForward(),
        });
      } catch {
        // webview not ready
      }
    };

    const handleDomReady = () => {
      domReadyRef.current = true;
      sendNavState();
      const isMobile = viewportModeRef.current === 'mobile';
      try {
        const preset = VIEWPORT_PRESETS[viewportModeRef.current];
        wv.setUserAgent(preset.userAgent || '');
      } catch {
        /* */
      }
      try {
        const wcId = wv.getWebContentsId();
        webContentsIdRef.current = wcId;
        window.forgepadBrowser.browser.setTouchEmulation(wcId, isMobile).catch(() => {});
        // Enable console capture
        window.forgepadBrowser.browser.enableConsole(wcId).catch(() => {});
        // Notify parent that webContentsId is available (used for extension tab creation)
        onWebContentsReady?.(tab.id, wcId);
      } catch {
        /* */
      }
      if (isMobile) injectMobileScrollbar();
    };

    const handleDidStartLoading = () => {
      sendNavState();
    };

    const handleDidStopLoading = () => {
      sendNavState();
      // Capture favicon
      const url = (() => {
        try {
          return wv.getURL();
        } catch {
          return '';
        }
      })();
      if (!url || url === 'about:blank') return;
      const faviconScript = `
        (() => {
          const links = [...document.querySelectorAll('link[rel~="icon"], link[rel~="shortcut"]')].sort((a, b) => {
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
      const title = (() => {
        try {
          return wv.getTitle();
        } catch {
          return '';
        }
      })();
      wv.executeJavaScript(faviconScript)
        .then((dataUrl: unknown) => {
          const favicon = typeof dataUrl === 'string' ? dataUrl : '';
          onNavStateChange(tab.id, { favicon });
          onHistoryEntry({ url, title, favicon, visitedAt: Date.now() });
        })
        .catch(() => {
          onHistoryEntry({ url, title, favicon: '', visitedAt: Date.now() });
        });
    };

    const handleDidNavigate = () => {
      sendNavState();
      // Re-enable console for new page
      try {
        const wcId = wv.getWebContentsId();
        if (wcId) window.forgepadBrowser.browser.enableConsole(wcId).catch(() => {});
      } catch {
        /* */
      }
    };

    const handleDidFailLoad = (e: Event) => {
      const ev = e as Event & { errorCode: number };
      if (ev.errorCode === -3) return; // ERR_ABORTED
      sendNavState();
    };

    const handleNewWindow = (e: Event) => {
      e.preventDefault();
      const ev = e as Event & { url: string };
      onNewWindow(ev.url);
    };

    wv.addEventListener('dom-ready', handleDomReady);
    wv.addEventListener('did-start-loading', handleDidStartLoading);
    wv.addEventListener('did-stop-loading', handleDidStopLoading);
    wv.addEventListener('did-navigate', handleDidNavigate);
    wv.addEventListener('did-navigate-in-page', sendNavState);
    wv.addEventListener('page-title-updated', sendNavState);
    wv.addEventListener('did-fail-load', handleDidFailLoad);
    wv.addEventListener('new-window', handleNewWindow);

    return () => {
      domReadyRef.current = false;
      wv.removeEventListener('dom-ready', handleDomReady);
      wv.removeEventListener('did-start-loading', handleDidStartLoading);
      wv.removeEventListener('did-stop-loading', handleDidStopLoading);
      wv.removeEventListener('did-navigate', handleDidNavigate);
      wv.removeEventListener('did-navigate-in-page', sendNavState);
      wv.removeEventListener('page-title-updated', sendNavState);
      wv.removeEventListener('did-fail-load', handleDidFailLoad);
      wv.removeEventListener('new-window', handleNewWindow);
      // Disable console capture on unmount
      const wcId = webContentsIdRef.current;
      if (wcId != null) {
        window.forgepadBrowser.browser.disableConsole(wcId).catch(() => {});
      }
    };
  }, [tab.id, onNavStateChange, onNewWindow, onHistoryEntry, onWebContentsReady]);

  // ── Listen for CDP console events ──
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

    const cleanup = window.forgepadBrowser.browser.onConsoleEvent((raw: unknown) => {
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
      };

      if (evt.webContentsId !== webContentsIdRef.current) return;

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
      onConsoleEvent(tab.id, entry);
    });

    return cleanup;
  }, [tab.id, onConsoleEvent]);

  const isMobile = viewportMode === 'mobile';
  const mobilePreset = VIEWPORT_PRESETS.mobile;

  return (
    <div style={{ display: isActive ? 'flex' : 'none' }} className="size-full flex-col">
      <div className={clsx('relative size-full', isMobile ? 'flex items-start justify-center bg-panel-2 pt-4' : 'bg-white')}>
        {isMobile ? (
          <div
            className="relative shrink-0 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
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
              style={{ width: '100%', height: '100%', display: 'inline-flex' }}
            />
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}

// ── PopoutBrowser (main component) ────────────────────────────────────────

export function PopoutBrowser() {
  const t = usePopoutT();
  const api = window.forgepadBrowser;
  const defaultHomepage = api.init.defaultHomepage || 'https://www.google.com';
  const initialUrl = api.init.initialUrl || defaultHomepage;

  // ── Tab state ──
  const [tabs, setTabs] = useState<PopoutTab[]>(() => [
    {
      id: createTabId(),
      url: initialUrl,
      title: '',
      favicon: '',
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [urlInput, setUrlInput] = useState(initialUrl === 'about:blank' ? '' : initialUrl);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<Map<string, ConsoleEntry[]>>(new Map());
  const [extensionActions, setExtensionActions] = useState<ExtensionInfo[]>([]);
  const [browsingHistory, setBrowsingHistory] = useState<BrowserHistoryEntry[]>([]);

  // Webview refs map
  const webviewRefs = useRef<Map<string, Electron.WebviewTag>>(new Map());
  const urlBarWrapperRef = useRef<HTMLDivElement>(null);

  // ── Extension tab creation tracking ──
  // Maps React tab id → { requestId, resolved } for pending extension tab create requests
  const pendingExtTabCreates = useRef<Map<string, string>>(new Map());

  /** Focus the URL bar input element (finds it inside the UrlBar wrapper) */
  const focusUrlBar = useCallback(() => {
    const input = urlBarWrapperRef.current?.querySelector('input');
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  // Active tab
  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);

  // Active tab's console entries
  const activeConsoleEntries = useMemo(() => consoleEntries.get(activeTabId) ?? [], [consoleEntries, activeTabId]);

  const consoleErrorCount = useMemo(() => activeConsoleEntries.filter((e) => e.level === 'error').length, [activeConsoleEntries]);

  // Load extensions
  useEffect(() => {
    api.extension
      .list()
      .then((exts) => {
        setExtensionActions(exts.filter((e) => e.popupPath));
      })
      .catch(() => {});
  }, []);

  // Sync URL bar when active tab changes or navigates
  useEffect(() => {
    if (activeTab.url && activeTab.url !== 'about:blank') {
      setUrlInput(activeTab.url);
    } else {
      setUrlInput('');
    }
  }, [activeTab.url, activeTab.id]);

  // ── Tab management ──

  const addTab = useCallback(
    (url?: string) => {
      const tabUrl = url || defaultHomepage;
      const id = createTabId();
      const newTab: PopoutTab = {
        id,
        url: tabUrl,
        title: '',
        favicon: '',
        isLoading: tabUrl !== 'about:blank',
        canGoBack: false,
        canGoForward: false,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(id);
      // Focus URL bar for new empty tabs
      if (!url && tabUrl === 'about:blank') {
        setTimeout(() => focusUrlBar(), 50);
      }
    },
    [defaultHomepage, focusUrlBar],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) {
          // Last tab — close the window
          window.close();
          return prev;
        }
        const idx = prev.findIndex((t) => t.id === tabId);
        const next = prev.filter((t) => t.id !== tabId);
        if (tabId === activeTabId) {
          // Switch to adjacent tab
          const newIdx = Math.min(idx, next.length - 1);
          setActiveTabId(next[newIdx].id);
        }
        return next;
      });
      // Clean up console entries for this tab
      setConsoleEntries((prev) => {
        const next = new Map(prev);
        next.delete(tabId);
        return next;
      });
      webviewRefs.current.delete(tabId);
    },
    [activeTabId],
  );

  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const nextTab = useCallback(() => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === activeTabId);
      const nextIdx = (idx + 1) % prev.length;
      setActiveTabId(prev[nextIdx].id);
      return prev;
    });
  }, [activeTabId]);

  const prevTab = useCallback(() => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === activeTabId);
      const nextIdx = (idx - 1 + prev.length) % prev.length;
      setActiveTabId(prev[nextIdx].id);
      return prev;
    });
  }, [activeTabId]);

  // ── Tab reorder (dnd-kit) ──
  const reorderTabs = useCallback((activeId: string, overId: string) => {
    setTabs((prev) => {
      const oldIdx = prev.findIndex((t) => t.id === activeId);
      const newIdx = prev.findIndex((t) => t.id === overId);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  // ── Select tab by index (Cmd+1~9, Cmd+0) ──
  const selectTabByIndex = useCallback((index: number) => {
    setTabs((prev) => {
      // index 0 or 9 means last tab; 1~8 means tab at that position
      const targetIdx = index === 0 || index === 9 ? prev.length - 1 : index - 1;
      if (targetIdx >= 0 && targetIdx < prev.length) {
        setActiveTabId(prev[targetIdx].id);
      }
      return prev;
    });
  }, []);

  // ── Menu accelerator listeners ──
  useEffect(() => {
    const cleanups = [
      api.onNewTab(() => addTab()),
      api.onCloseTab(() => closeTab(activeTabId)),
      api.onFocusUrl(() => focusUrlBar()),
      api.onNextTab(() => nextTab()),
      api.onPrevTab(() => prevTab()),
      api.onSelectTabByIndex((index: number) => selectTabByIndex(index)),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, [api, addTab, closeTab, activeTabId, nextTab, prevTab, selectTabByIndex, focusUrlBar]);

  // ── Extension tab creation listener ──
  // When the extension popup asks to create a tab (chrome.tabs.create),
  // main process relays the request here. We create a new tab,
  // then once its webview fires dom-ready and we know the webContentsId,
  // we reply back so main process can resolve the extension's promise.
  useEffect(() => {
    const cleanup = api.onExtensionTabCreate((data) => {
      const { requestId, url, active } = data;
      // Create a new tab with the requested URL
      const tabUrl = url || defaultHomepage;
      const id = createTabId();
      const newTab: PopoutTab = {
        id,
        url: tabUrl,
        title: '',
        favicon: '',
        isLoading: tabUrl !== 'about:blank',
        canGoBack: false,
        canGoForward: false,
      };
      setTabs((prev) => [...prev, newTab]);
      if (active) setActiveTabId(id);
      // Store the mapping: when this tab's webview fires dom-ready,
      // handleWebContentsReady will find the requestId and reply.
      pendingExtTabCreates.current.set(id, requestId);
    });
    return cleanup;
  }, [api, defaultHomepage]);

  // When a webview fires dom-ready, check if it was created by an extension tab request
  const handleWebContentsReady = useCallback(
    (tabId: string, webContentsId: number) => {
      const requestId = pendingExtTabCreates.current.get(tabId);
      if (requestId) {
        pendingExtTabCreates.current.delete(tabId);
        api.sendExtensionTabCreated(requestId, webContentsId);
      }
    },
    [api],
  );

  // ── Webview callbacks ──

  const handleNavStateChange = useCallback((tabId: string, update: Partial<PopoutTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...update } : t)));
  }, []);

  const handleNewWindow = useCallback(
    (url: string) => {
      addTab(url);
    },
    [addTab],
  );

  const handleConsoleEvent = useCallback((tabId: string, entry: ConsoleEntry) => {
    setConsoleEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(tabId) ?? [];
      next.set(tabId, [...existing, entry]);
      return next;
    });
  }, []);

  const handleHistoryEntry = useCallback((entry: BrowserHistoryEntry) => {
    setBrowsingHistory((prev) => {
      // Deduplicate by URL — update existing or prepend
      const existing = prev.findIndex((h) => h.url === entry.url);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = entry;
        return next;
      }
      // Keep most recent 200 entries
      return [entry, ...prev].slice(0, 200);
    });
  }, []);

  const handleWebviewRef = useCallback((tabId: string, wv: Electron.WebviewTag | null) => {
    if (wv) {
      webviewRefs.current.set(tabId, wv);
    } else {
      webviewRefs.current.delete(tabId);
    }
  }, []);

  // ── Navigation handlers ──

  const handleBack = useCallback(() => {
    webviewRefs.current.get(activeTabId)?.goBack();
  }, [activeTabId]);

  const handleForward = useCallback(() => {
    webviewRefs.current.get(activeTabId)?.goForward();
  }, [activeTabId]);

  const handleReloadOrStop = useCallback(() => {
    const wv = webviewRefs.current.get(activeTabId);
    if (!wv) return;
    if (activeTab.isLoading) {
      wv.stop();
    } else {
      wv.reload();
    }
  }, [activeTabId, activeTab.isLoading]);

  const handleNavigate = useCallback(
    (url: string) => {
      const normalized = normalizeUrl(url);
      const wv = webviewRefs.current.get(activeTabId);
      if (wv) {
        wv.loadURL(normalized);
      }
    },
    [activeTabId],
  );

  const handleToggleViewport = useCallback(() => {
    setViewportMode((prev) => {
      const next = prev === 'desktop' ? 'mobile' : 'desktop';
      // Apply UA change + reload to the active webview
      const wv = webviewRefs.current.get(activeTabId);
      if (wv) {
        try {
          const preset = VIEWPORT_PRESETS[next];
          wv.setUserAgent(preset.userAgent || '');
          const currentUrl = wv.getURL();
          if (currentUrl && currentUrl !== 'about:blank') {
            wv.reload();
          }
        } catch {
          /* */
        }
      }
      return next;
    });
  }, [activeTabId]);

  // ── Console handlers ──

  const handleConsoleClear = useCallback(() => {
    setConsoleEntries((prev) => {
      const next = new Map(prev);
      next.set(activeTabId, []);
      return next;
    });
  }, [activeTabId]);

  // No "Send to Agent" in popout — provide a no-op
  const handleSendToAgent = useCallback(() => {}, []);

  const handleExecuteScript = useCallback(
    async (script: string) => {
      const wv = webviewRefs.current.get(activeTabId);
      if (!wv) return;

      // Add input entry
      const inputId = Date.now();
      const inputEntry: ConsoleEntry = {
        id: inputId,
        level: 'log',
        args: [{ type: 'string', value: script }],
        timestamp: Date.now(),
        source: 'input',
      };
      setConsoleEntries((prev) => {
        const next = new Map(prev);
        const existing = next.get(activeTabId) ?? [];
        next.set(activeTabId, [...existing, inputEntry]);
        return next;
      });

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
            try {
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

        let entry: ConsoleEntry;
        if (envelope?.__error) {
          const desc = `${envelope.__name ?? 'Error'}: ${envelope.__message ?? String(envelope)}`;
          entry = {
            id: Date.now() + 1,
            level: 'error',
            args: [{ type: 'object', subtype: 'error', description: desc }],
            timestamp: Date.now(),
            source: 'error',
          };
        } else {
          let arg: import('../console-utils').ConsoleArg;
          switch (envelope?.__type) {
            case 'null':
              arg = { type: 'object', subtype: 'null' };
              break;
            case 'undefined':
              arg = { type: 'undefined' };
              break;
            case 'string':
              arg = { type: 'string', value: envelope.__value };
              break;
            case 'number':
              arg = { type: 'number', value: envelope.__value };
              break;
            case 'boolean':
              arg = { type: 'boolean', value: envelope.__value };
              break;
            case 'function':
              arg = {
                type: 'function',
                description: envelope.__desc ?? 'function()',
              };
              break;
            case 'object':
              arg = {
                type: 'object',
                description: envelope.__json ?? envelope.__desc ?? '[object Object]',
              };
              break;
            default:
              arg = { type: 'string', value: String(envelope) };
              break;
          }
          entry = {
            id: Date.now() + 1,
            level: 'log',
            args: [arg],
            timestamp: Date.now(),
            source: 'result',
          };
        }

        setConsoleEntries((prev) => {
          const next = new Map(prev);
          const existing = next.get(activeTabId) ?? [];
          next.set(activeTabId, [...existing, entry]);
          return next;
        });
      } catch (err) {
        const errorEntry: ConsoleEntry = {
          id: Date.now() + 2,
          level: 'error',
          args: [{ type: 'object', subtype: 'error', description: String(err) }],
          timestamp: Date.now(),
          source: 'error',
        };
        setConsoleEntries((prev) => {
          const next = new Map(prev);
          const existing = next.get(activeTabId) ?? [];
          next.set(activeTabId, [...existing, errorEntry]);
          return next;
        });
      }
    },
    [activeTabId],
  );

  const isMobile = viewportMode === 'mobile';

  return (
    <div className="flex h-screen w-screen flex-col bg-bg text-text">
      {/* ── Tab Bar ──────────────────────────────────────── */}
      <PopoutTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
        onNewTab={() => addTab()}
        onReorderTabs={reorderTabs}
      />

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-border border-b bg-panel px-2">
        {/* Back */}
        <Tooltip label={t('back')} position="bottom">
          <button
            type="button"
            onClick={handleBack}
            disabled={!activeTab.canGoBack}
            className="rounded p-1.5 text-subtle transition-[color,background-color,scale] duration-150 hover:bg-panel-3 hover:text-text active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </Tooltip>

        {/* Forward */}
        <Tooltip label={t('forward')} position="bottom">
          <button
            type="button"
            onClick={handleForward}
            disabled={!activeTab.canGoForward}
            className="rounded p-1.5 text-subtle transition-[color,background-color,scale] duration-150 hover:bg-panel-3 hover:text-text active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </Tooltip>

        {/* Reload / Stop */}
        <Tooltip label={activeTab.isLoading ? t('stop') : t('reload')} position="bottom">
          <button
            type="button"
            onClick={handleReloadOrStop}
            className="rounded p-1.5 text-subtle transition-[color,background-color,scale] duration-150 hover:bg-panel-3 hover:text-text active:scale-[0.96]"
          >
            {activeTab.isLoading ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            )}
          </button>
        </Tooltip>

        {/* URL bar */}
        <div ref={urlBarWrapperRef} className="min-w-0 flex-1">
          <UrlBar value={urlInput} onChange={setUrlInput} onNavigate={handleNavigate} history={browsingHistory} />
        </div>

        {/* Extension action buttons */}
        {extensionActions.length > 0 && (
          <>
            <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
            {extensionActions.map((ext) => (
              <Tooltip key={ext.id} label={ext.name} position="bottom">
                <button
                  type="button"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-subtle transition-[color,background-color,scale] duration-150 hover:bg-panel-3 hover:text-text active:scale-[0.96]"
                  onClick={(e) => {
                    if (!ext.popupPath) return;
                    const wv = webviewRefs.current.get(activeTabId);
                    if (!wv) return;
                    try {
                      const activeWcId = wv.getWebContentsId();
                      const currentUrl = (() => {
                        try {
                          return wv.getURL();
                        } catch {
                          return '';
                        }
                      })();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      api.extension.openPopup(
                        ext.id,
                        ext.popupPath,
                        Math.round(rect.left + window.screenX),
                        Math.round(rect.bottom + window.screenY),
                        activeWcId,
                        currentUrl,
                      );
                    } catch {
                      /* */
                    }
                  }}
                >
                  {ext.iconUrl ? (
                    <img src={ext.iconUrl} alt={ext.name} width={16} height={16} className="rounded-sm" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                  )}
                </button>
              </Tooltip>
            ))}
            <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
          </>
        )}

        {/* Viewport mode toggle */}
        <Tooltip label={isMobile ? t('switchDesktop') : t('switchMobile')} position="bottom">
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

        {/* Console toggle */}
        <Tooltip label={consoleOpen ? t('hideConsole') : t('showConsole')} position="bottom">
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
              <path
                d="M3.5 5.5l2 1.5-2 1.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line x1="7" y1="8.5" x2="9.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {consoleErrorCount > 0 && !consoleOpen && (
              <span className="absolute -top-1 -right-1 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-danger px-0.5 font-mono text-[9px] text-white leading-none">
                {consoleErrorCount > 99 ? '99+' : consoleErrorCount}
              </span>
            )}
          </button>
        </Tooltip>

        {/* DevTools */}
        <Tooltip label={t('openDevTools')} position="bottom">
          <button
            type="button"
            onClick={() => {
              const wv = webviewRefs.current.get(activeTabId);
              if (!wv) return;
              try {
                const wcId = wv.getWebContentsId();
                api.browser.openDevTools(wcId);
              } catch {
                /* */
              }
            }}
            className="grid h-7 w-7 place-items-center rounded-md text-subtle transition-[color,background-color,scale] duration-150 hover:bg-panel-3 hover:text-text active:scale-[0.96]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {/* ── Loading bar ─────────────────────────────────── */}
      {activeTab.isLoading && (
        <div className="h-[2px] w-full shrink-0 overflow-hidden bg-panel-3">
          <div className="h-full animate-[browser-loading_1.4s_ease-in-out_infinite] bg-accent" />
        </div>
      )}

      {/* ── Webview + Console split ─────────────────────── */}
      <Allotment vertical className="min-h-0 flex-1">
        <Allotment.Pane minSize={100}>
          <div className="relative size-full">
            {tabs.map((tab) => (
              <WebviewPane
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                viewportMode={viewportMode}
                onNavStateChange={handleNavStateChange}
                onNewWindow={handleNewWindow}
                onConsoleEvent={handleConsoleEvent}
                onHistoryEntry={handleHistoryEntry}
                webviewRefCallback={handleWebviewRef}
                onWebContentsReady={handleWebContentsReady}
              />
            ))}
          </div>
        </Allotment.Pane>

        <Allotment.Pane preferredSize={200} minSize={consoleOpen ? 80 : 0} visible={consoleOpen}>
          <BrowserConsolePanel
            entries={activeConsoleEntries}
            onClear={handleConsoleClear}
            onSendToAgent={handleSendToAgent}
            onExecuteScript={handleExecuteScript}
            hideSendToAgent
          />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
