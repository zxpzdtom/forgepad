/**
 * Session-level preload for Chrome extension API polyfills.
 *
 * Registered via session.registerPreloadScript(), this runs in ALL frames
 * of the default session — including chrome-extension:// popup pages — before
 * any extension JavaScript executes.
 *
 * Uses contextBridge to expose an IPC bridge to the main world, then injects
 * polyfill code that patches chrome.tabs, chrome.scripting, chrome.storage,
 * and chrome.windows.
 *
 * Inspired by electron-browser-shell's electron-chrome-extensions package.
 */
import { contextBridge, ipcRenderer } from "electron";

// Only activate in extension page contexts
if (location.protocol === "chrome-extension:") {
  // Expose a minimal IPC bridge to the main world.
  // The main-world polyfill code will call window.__forgepadExt.invoke().
  const bridge = {
    invoke: (method: string, ...args: unknown[]) =>
      ipcRenderer.invoke("extension:msg", method, ...args),
  };

  contextBridge.exposeInMainWorld("__forgepadExt", bridge);

  // Inject the polyfill code into the main world where the chrome global lives.
  // IMPORTANT: This function must be self-contained — no closure variables.
  function mainWorldScript() {
    const bridge = (
      globalThis as unknown as {
        __forgepadExt?: { invoke: (method: string, ...args: unknown[]) => Promise<unknown> };
      }
    ).__forgepadExt;

    if (!bridge) {
      console.error("[forgepad-ext-polyfill] IPC bridge not available");
      return;
    }

    const chrome = globalThis.chrome as Record<string, unknown> | undefined;
    if (!chrome) return;

    // ── Utilities ──────────────────────────────────────────────────────

    function forceSet(obj: Record<string, unknown>, prop: string, value: unknown) {
      if (!obj) return;
      try {
        Object.defineProperty(obj, prop, {
          value,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        try {
          obj[prop] = value;
        } catch {
          /* truly immutable */
        }
      }
    }

    function stubEvent() {
      return {
        addListener: () => {},
        removeListener: () => {},
        hasListener: () => false,
        hasListeners: () => false,
      };
    }

    function settleCallback<T>(
      promise: Promise<T>,
      callback: ((result: T) => void) | undefined,
    ): Promise<T> | undefined {
      if (typeof callback === "function") {
        promise
          .then((value) => callback(value))
          .catch((err) => {
            console.warn("[forgepad-ext-polyfill] callback error:", err);
            callback(undefined as T);
          });
        return undefined;
      }
      return promise;
    }

    // ── Patch chrome.tabs ──────────────────────────────────────────────

    function patchTabs(chromeObj: Record<string, unknown>) {
      if (!chromeObj.tabs) {
        forceSet(chromeObj, "tabs", {});
      }
      const tabs = chromeObj.tabs as Record<string, unknown>;
      if (!tabs) return;

      const origQuery =
        typeof tabs.query === "function" && !(tabs.query as Record<string, unknown>).__forgepad
          ? (tabs.query as (...args: unknown[]) => unknown).bind(tabs)
          : null;

      function query(
        queryInfo: { active?: boolean; currentWindow?: boolean } | null,
        callback?: (tabs: unknown[]) => void,
      ) {
        const p = bridge.invoke("tabs.query", queryInfo) as Promise<unknown[]>;
        return settleCallback(p, callback);
      }
      (query as Record<string, unknown>).__forgepad = true;

      function get(tabId: number, callback?: (tab: unknown) => void) {
        const p = bridge.invoke("tabs.get", tabId) as Promise<unknown>;
        return settleCallback(p, callback);
      }
      (get as Record<string, unknown>).__forgepad = true;

      function create(
        createProperties: { url?: string; active?: boolean },
        callback?: (tab: unknown) => void,
      ) {
        const p = bridge.invoke("tabs.create", createProperties) as Promise<unknown>;
        return settleCallback(p, callback);
      }
      (create as Record<string, unknown>).__forgepad = true;

      function update(
        tabId: number | { url?: string },
        updateProperties?: { url?: string; active?: boolean },
        callback?: (tab: unknown) => void,
      ) {
        const p = bridge.invoke(
          "tabs.update",
          typeof tabId === "object" ? undefined : tabId,
          typeof tabId === "object" ? tabId : updateProperties,
        ) as Promise<unknown>;
        return settleCallback(p, callback);
      }
      (update as Record<string, unknown>).__forgepad = true;

      function remove(_tabId: number, callback?: () => void) {
        const p = bridge.invoke("tabs.remove", _tabId) as Promise<void>;
        return settleCallback(p, callback);
      }
      (remove as Record<string, unknown>).__forgepad = true;

      function sendMessage(
        tabId: number,
        message: unknown,
        options?: unknown,
        callback?: (response: unknown) => void,
      ) {
        const p = bridge.invoke("tabs.sendMessage", tabId, message, options) as Promise<unknown>;
        const cb = typeof options === "function" ? (options as (r: unknown) => void) : callback;
        return settleCallback(p, cb);
      }
      (sendMessage as Record<string, unknown>).__forgepad = true;

      forceSet(tabs, "query", query);
      forceSet(tabs, "get", get);
      forceSet(tabs, "create", create);
      forceSet(tabs, "update", update);
      forceSet(tabs, "remove", remove);
      forceSet(tabs, "sendMessage", sendMessage);

      if (!tabs.onUpdated) forceSet(tabs, "onUpdated", stubEvent());
      if (!tabs.onCreated) forceSet(tabs, "onCreated", stubEvent());
      if (!tabs.onRemoved) forceSet(tabs, "onRemoved", stubEvent());
      if (!tabs.onActivated) forceSet(tabs, "onActivated", stubEvent());
    }

    // ── Patch chrome.scripting ─────────────────────────────────────────

    function patchScripting(chromeObj: Record<string, unknown>) {
      if (!chromeObj.scripting) {
        forceSet(chromeObj, "scripting", {});
      }
      const scripting = chromeObj.scripting as Record<string, unknown>;
      if (!scripting) return;

      function executeScript(
        injection: {
          target?: { tabId?: number };
          func?: (...args: unknown[]) => unknown;
          function?: (...args: unknown[]) => unknown;
          args?: unknown[];
          files?: string[];
        },
        callback?: (results: unknown[]) => void,
      ) {
        const target = injection?.target ?? {};
        const tabId = target.tabId;
        const fn = injection?.func || (injection as Record<string, unknown>)?.function;
        let func: string | undefined;
        if (typeof fn === "function") {
          const fnArgs = Array.isArray(injection?.args) ? injection!.args : [];
          func = `(${fn.toString()}).apply(null, ${JSON.stringify(fnArgs)})`;
        }
        const p = bridge.invoke("scripting.executeScript", {
          tabId,
          func,
          files: injection?.files,
        }) as Promise<unknown[]>;
        return settleCallback(p, callback);
      }
      (executeScript as Record<string, unknown>).__forgepad = true;

      function insertCSS(
        injection: { target?: { tabId?: number }; css?: string },
        callback?: () => void,
      ) {
        const target = injection?.target ?? {};
        const p = bridge.invoke("scripting.insertCSS", {
          tabId: target.tabId,
          css: injection?.css ?? "",
        }) as Promise<void>;
        return settleCallback(p, callback);
      }
      (insertCSS as Record<string, unknown>).__forgepad = true;

      function removeCSS(
        _injection: unknown,
        callback?: () => void,
      ) {
        if (typeof callback === "function") {
          callback();
          return;
        }
        return Promise.resolve();
      }
      (removeCSS as Record<string, unknown>).__forgepad = true;

      forceSet(scripting, "executeScript", executeScript);
      forceSet(scripting, "insertCSS", insertCSS);
      forceSet(scripting, "removeCSS", removeCSS);
    }

    // ── Patch chrome.storage.sync → local ──────────────────────────────

    function patchStorage(chromeObj: Record<string, unknown>) {
      const storage = chromeObj.storage as Record<string, unknown> | undefined;
      if (!storage) return;
      if (storage.local && !storage.sync) {
        forceSet(storage, "sync", storage.local);
      } else if (storage.sync && storage.local) {
        // Wrap sync to fall back to local on error
        const origSync = storage.sync as Record<string, unknown>;
        const local = storage.local as Record<string, unknown>;
        const wrapped: Record<string, unknown> = {};
        for (const method of ["get", "set", "remove", "clear", "getBytesInUse"]) {
          if (typeof local[method] === "function") {
            wrapped[method] = function (...args: unknown[]) {
              try {
                return (origSync[method] as (...a: unknown[]) => unknown)(...args);
              } catch {
                return (local[method] as (...a: unknown[]) => unknown)(...args);
              }
            };
          }
        }
        if (origSync.onChanged) wrapped.onChanged = origSync.onChanged;
        else if (local.onChanged) wrapped.onChanged = local.onChanged;
        forceSet(storage, "sync", wrapped);
      }
    }

    // ── Patch chrome.windows ───────────────────────────────────────────

    function patchWindows(chromeObj: Record<string, unknown>) {
      if (!chromeObj.windows) {
        forceSet(chromeObj, "windows", {});
      }
      const windows = chromeObj.windows as Record<string, unknown>;
      if (!windows) return;

      forceSet(windows, "WINDOW_ID_CURRENT", -2);
      forceSet(windows, "getCurrent", function (
        options?: unknown,
        callback?: (win: unknown) => void,
      ) {
        const win = { id: 1, focused: true, type: "normal", state: "normal" };
        const cb = typeof options === "function" ? (options as (w: unknown) => void) : callback;
        if (typeof cb === "function") {
          cb(win);
          return;
        }
        return Promise.resolve(win);
      });
    }

    // ── Apply all patches ──────────────────────────────────────────────

    function patchChrome(chromeObj: Record<string, unknown> | undefined) {
      if (!chromeObj) return;
      patchTabs(chromeObj);
      patchScripting(chromeObj);
      patchStorage(chromeObj);
      patchWindows(chromeObj);
      console.info("[forgepad-ext-polyfill] installed");
    }

    // Intercept globalThis.chrome reassignment (Electron may re-inject)
    let chromeValue = chrome;
    try {
      Object.defineProperty(globalThis, "chrome", {
        configurable: true,
        enumerable: true,
        get() {
          return chromeValue;
        },
        set(value: Record<string, unknown>) {
          chromeValue = value;
          patchChrome(value);
        },
      });
    } catch {
      // Native bindings may already own window.chrome
    }

    // Patch immediately, then re-patch on deferred ticks
    patchChrome(chromeValue);
    Promise.resolve().then(() => patchChrome(chromeValue));
    setTimeout(() => patchChrome(chromeValue), 0);
    setTimeout(() => patchChrome(chromeValue), 50);
    setTimeout(() => patchChrome(chromeValue), 250);
  }

  // Execute polyfill in main world via contextBridge
  if ("executeInMainWorld" in contextBridge) {
    (contextBridge as unknown as { executeInMainWorld: (opts: { func: (...args: unknown[]) => void }) => void }).executeInMainWorld({
      func: mainWorldScript,
    });
  } else {
    // Fallback for older Electron versions
    const { webFrame } = require("electron") as { webFrame: { executeJavaScript: (code: string) => Promise<void> } };
    void webFrame.executeJavaScript(`(${mainWorldScript.toString()})();`);
  }
}
