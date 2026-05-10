/**
 * Preload for extension popup windows.
 *
 * With contextIsolation DISABLED, this script runs in the SAME world
 * as the extension page — so we can directly patch chrome.tabs.query
 * and polyfill chrome.scripting BEFORE any extension JS executes.
 *
 * Receives activeTabId and extId via --additional-arguments.
 */
import { IPC } from '@shared/ipc';
import { ipcRenderer } from 'electron';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

// ── Read params from command-line arguments ──────────────────────────
function getArg(name: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? decodeURIComponent(arg.slice(prefix.length)) : '';
}

const TAB_ID = Number(getArg('active-tab-id')) || 0;
const EXT_ID = getArg('ext-id') || '';
const TAB_URL = getArg('active-tab-url') || '';

// Debug: log what we received so we can verify the preload is running
console.log('[forgepad-ext-preload] TAB_ID =', TAB_ID, '| EXT_ID =', EXT_ID, '| TAB_URL =', TAB_URL);

// ── Helper: build a fake tab object ──────────────────────────────────
function makeFakeTab(id: number, extra?: Record<string, unknown>) {
  return {
    id,
    active: true,
    windowId: 1,
    status: 'complete',
    url: TAB_URL,
    title: '',
    index: 0,
    pinned: false,
    highlighted: true,
    incognito: false,
    ...extra,
  };
}

// ── Helper: forcefully set a property on an object ──────────────────
function forceSet(obj: unknown, prop: string, value: unknown) {
  try {
    Object.defineProperty(obj, prop, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (obj as any)[prop] = value;
    } catch {
      /* truly immutable — give up */
    }
  }
}

// Stub event object for chrome.tabs.on* events
function stubEvent() {
  return {
    addListener: () => {},
    removeListener: () => {},
    hasListener: () => false,
    hasListeners: () => false,
  };
}

// ── Patch chrome.tabs ────────────────────────────────────────────────
// Must happen here (preload) so it's in place before the extension's
// bundle.js calls chrome.tabs.* during initial load.
// Use forceSet() because Electron's native bindings may be non-writable.
if (typeof chrome !== 'undefined' && chrome.tabs) {
  // ── chrome.tabs.query ──
  const _origQuery = chrome.tabs.query ? chrome.tabs.query.bind(chrome.tabs) : null;
  forceSet(
    chrome.tabs,
    'query',
    function (queryInfo: { active?: boolean; currentWindow?: boolean }, callback?: (tabs: unknown[]) => void) {
      if (queryInfo && (queryInfo.active || queryInfo.currentWindow)) {
        const tab = makeFakeTab(TAB_ID);
        if (typeof callback === 'function') {
          callback([tab]);
          return;
        }
        return Promise.resolve([tab]);
      }
      if (_origQuery) return _origQuery(queryInfo, callback);
      const tab = makeFakeTab(TAB_ID);
      if (typeof callback === 'function') {
        callback([tab]);
        return;
      }
      return Promise.resolve([tab]);
    },
  );

  // ── chrome.tabs.get ──
  forceSet(chrome.tabs, 'get', function (tabId: number, callback?: (tab: unknown) => void) {
    const tab = makeFakeTab(tabId || TAB_ID);
    if (typeof callback === 'function') {
      callback(tab);
      return;
    }
    return Promise.resolve(tab);
  });

  // ── chrome.tabs.create — opens a new tab in the browser window ──
  forceSet(chrome.tabs, 'create', function (opts: { url?: string; active?: boolean }, callback?: (tab: unknown) => void) {
    const p = ipcRenderer
      .invoke(IPC.EXTENSION_TAB_CREATE, {
        url: opts?.url || 'about:blank',
        active: opts?.active,
      })
      .then((result: { id: number }) => {
        const tab = makeFakeTab(result.id, { url: opts?.url || '' });
        return tab;
      });

    if (typeof callback === 'function') {
      p.then((tab: unknown) => callback(tab)).catch(() => callback(makeFakeTab(0)));
      return;
    }
    return p;
  });

  // ── chrome.tabs.update — navigate an existing tab ──
  forceSet(
    chrome.tabs,
    'update',
    function (
      tabId: number | { url?: string; active?: boolean },
      opts?: { url?: string; active?: boolean },
      callback?: (tab: unknown) => void,
    ) {
      let _tabId = TAB_ID;
      let _opts = opts;
      let _callback = callback;
      if (typeof tabId === 'object') {
        _opts = tabId;
        _callback = opts as unknown as ((tab: unknown) => void) | undefined;
      } else {
        _tabId = tabId;
      }
      const tab = makeFakeTab(_tabId, { url: _opts?.url || '' });
      if (typeof _callback === 'function') {
        _callback(tab);
        return;
      }
      return Promise.resolve(tab);
    },
  );

  // ── chrome.tabs.remove ── (no-op stub)
  forceSet(chrome.tabs, 'remove', function (_tabId: number | number[], callback?: () => void) {
    if (typeof callback === 'function') {
      callback();
      return;
    }
    return Promise.resolve();
  });

  // ── chrome.tabs.sendMessage ── (stub — relay not needed for most extensions)
  forceSet(
    chrome.tabs,
    'sendMessage',
    function (_tabId: number, _message: unknown, _opts?: unknown, callback?: (response: unknown) => void) {
      if (typeof _opts === 'function') {
        (_opts as (r: unknown) => void)(undefined);
        return;
      }
      if (typeof callback === 'function') {
        callback(undefined);
        return;
      }
      return Promise.resolve(undefined);
    },
  );

  // ── Stub event listeners ──
  if (!chrome.tabs.onUpdated) forceSet(chrome.tabs, 'onUpdated', stubEvent());
  if (!chrome.tabs.onCreated) forceSet(chrome.tabs, 'onCreated', stubEvent());
  if (!chrome.tabs.onRemoved) forceSet(chrome.tabs, 'onRemoved', stubEvent());
  if (!chrome.tabs.onActivated) forceSet(chrome.tabs, 'onActivated', stubEvent());

  // ── Also apply deferred patching for chrome.tabs ──
  // Electron may re-inject native chrome.tabs after preload completes.
  const _tabsQuery = chrome.tabs.query;
  const _tabsGet = chrome.tabs.get;
  const _tabsCreate = chrome.tabs.create;
  const _tabsUpdate = chrome.tabs.update;
  const _tabsRemove = chrome.tabs.remove;
  const _tabsSendMessage = chrome.tabs.sendMessage;

  function rePatchTabs() {
    if (!chrome.tabs) return;
    // Only re-patch if our functions were replaced by native ones
    if (chrome.tabs.query !== _tabsQuery) forceSet(chrome.tabs, 'query', _tabsQuery);
    if (chrome.tabs.get !== _tabsGet) forceSet(chrome.tabs, 'get', _tabsGet);
    if (chrome.tabs.create !== _tabsCreate) forceSet(chrome.tabs, 'create', _tabsCreate);
    if (chrome.tabs.update !== _tabsUpdate) forceSet(chrome.tabs, 'update', _tabsUpdate);
    if (chrome.tabs.remove !== _tabsRemove) forceSet(chrome.tabs, 'remove', _tabsRemove);
    if (chrome.tabs.sendMessage !== _tabsSendMessage) forceSet(chrome.tabs, 'sendMessage', _tabsSendMessage);
  }
  Promise.resolve().then(rePatchTabs);
  setTimeout(rePatchTabs, 0);
}

// ── Polyfill chrome.windows ──────────────────────────────────────────
if (typeof chrome !== 'undefined') {
  if (!chrome.windows) {
    try {
      chrome.windows = {};
    } catch {
      /* */
    }
  }
  if (chrome.windows) {
    forceSet(chrome.windows, 'getCurrent', function (_opts?: unknown, callback?: (win: unknown) => void) {
      const win = { id: 1, focused: true, type: 'normal', state: 'normal' };
      if (typeof _opts === 'function') {
        (_opts as (w: unknown) => void)(win);
        return;
      }
      if (typeof callback === 'function') {
        callback(win);
        return;
      }
      return Promise.resolve(win);
    });
    if (!chrome.windows.WINDOW_ID_CURRENT) {
      forceSet(chrome.windows, 'WINDOW_ID_CURRENT', -2);
    }
  }
}

// ── Redirect chrome.storage.sync → chrome.storage.local ─────────────
// Electron doesn't support chrome.storage.sync. Many extensions use sync
// storage for settings — redirect to local storage transparently.
if (typeof chrome !== 'undefined' && chrome.storage) {
  if (!chrome.storage.sync && chrome.storage.local) {
    forceSet(chrome.storage, 'sync', chrome.storage.local);
  } else if (chrome.storage.sync) {
    // sync exists but may throw — wrap it to fall back to local
    const origSync = chrome.storage.sync;
    const localFallback = chrome.storage.local;
    if (localFallback) {
      const wrappedSync: Record<string, unknown> = {};
      for (const method of ['get', 'set', 'remove', 'clear', 'getBytesInUse'] as const) {
        if (typeof localFallback[method] === 'function') {
          wrappedSync[method] = function (...args: unknown[]) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (origSync as any)[method](...args);
            } catch {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (localFallback as any)[method](...args);
            }
          };
        }
      }
      // Copy event listeners
      if (origSync.onChanged) wrappedSync.onChanged = origSync.onChanged;
      else if (localFallback.onChanged) wrappedSync.onChanged = localFallback.onChanged;
      forceSet(chrome.storage, 'sync', wrappedSync);
    }
  }
}

// ── Polyfill chrome.scripting ────────────────────────────────────────
// Electron may provide a partial native chrome.scripting whose methods
// validate parameters via C++ native bindings (throwing "Missing required
// property tabId" BEFORE our JS code can intercept). Simple property
// assignment and Object.defineProperty both fail because Electron may
// re-inject the native binding after preload or because the binding
// is on a native prototype.
//
// Strategy: try multiple approaches in order of increasing aggressiveness:
// 1. Object.defineProperty on the existing chrome.scripting
// 2. Replace chrome.scripting entirely with a Proxy
// 3. Use a deferred approach that patches on the first tick
if (typeof chrome !== 'undefined') {
  const _executeScript = function (
    injection: {
      target?: { tabId?: number };
      func?: (...args: unknown[]) => unknown;
      function?: (...args: unknown[]) => unknown;
      args?: unknown[];
      files?: string[];
    },
    callback?: (results: unknown[]) => void,
  ) {
    const tabId = injection?.target?.tabId ?? TAB_ID;
    let funcStr = '';
    const fn = injection.func || injection.function;
    if (typeof fn === 'function') {
      const argsStr = injection.args ? JSON.stringify(injection.args) : '';
      funcStr = `(${fn.toString()})(${argsStr ? argsStr.slice(1, -1) : ''})`;
    }

    const p = ipcRenderer.invoke(IPC.EXTENSION_SCRIPTING_EXECUTE, {
      tabId,
      func: funcStr || undefined,
      files: injection.files || undefined,
      extId: EXT_ID,
    });

    if (typeof callback === 'function') {
      p.then((r: unknown) => callback(r as unknown[])).catch((e: unknown) => callback([{ error: e }]));
      return;
    }
    return p;
  };

  const _insertCSS = function (injection: { target?: { tabId?: number }; css?: string }, callback?: () => void) {
    const tabId = injection?.target?.tabId ?? TAB_ID;
    const p = ipcRenderer.invoke(IPC.EXTENSION_SCRIPTING_INSERT_CSS, {
      tabId,
      css: injection.css || '',
    });
    if (typeof callback === 'function') {
      p.then(() => callback()).catch(() => callback());
      return;
    }
    return p;
  };

  const _removeCSS = function (_injection: unknown, callback?: () => void) {
    if (typeof callback === 'function') {
      callback();
      return;
    }
    return Promise.resolve();
  };

  const scriptingImpl: Record<string, unknown> = {
    executeScript: _executeScript,
    insertCSS: _insertCSS,
    removeCSS: _removeCSS,
  };

  /**
   * Apply polyfill on the current chrome.scripting object.
   * Called immediately and also deferred (in case Electron re-injects after preload).
   */
  function patchScripting() {
    if (!chrome.scripting) {
      try {
        chrome.scripting = { ...scriptingImpl };
      } catch {
        /* */
      }
      return;
    }

    // Try defineProperty for each method
    for (const [name, fn] of Object.entries(scriptingImpl)) {
      try {
        Object.defineProperty(chrome.scripting, name, {
          value: fn,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        try {
          chrome.scripting[name] = fn;
        } catch {
          /* */
        }
      }
    }
  }

  // Apply immediately
  patchScripting();

  // Also apply on next microtask and next macrotask in case Electron
  // re-injects native bindings after the preload script completes.
  Promise.resolve().then(patchScripting);
  setTimeout(patchScripting, 0);

  // Replace the entire chrome.scripting with a Proxy as a nuclear option.
  // The Proxy intercepts property reads and returns our polyfill functions
  // regardless of what the native binding provides.
  try {
    const proxyHandler: ProxyHandler<Record<string, unknown>> = {
      get(target, prop: string) {
        if (prop in scriptingImpl) return scriptingImpl[prop];
        return target[prop];
      },
    };
    const original = chrome.scripting || {};
    const proxy = new Proxy(original, proxyHandler);
    Object.defineProperty(chrome, 'scripting', {
      get: () => proxy,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Proxy approach also failed — the deferred patching is our last hope
  }
}
