/**
 * Extension tab creation bridge.
 *
 * When an extension popup calls chrome.tabs.create, the main process relays
 * the request to the renderer via IPC. The renderer creates a new browser tab,
 * and once its webview fires dom-ready, we reply with the webContentsId so the
 * main process can resolve the extension's promise.
 *
 * This module provides a simple pending-request map that both App.tsx (the
 * listener) and BrowserTab.tsx (the reporter) can share without going through
 * the Zustand store.
 */

/** Maps a React tab id → the IPC requestId that created it */
const pendingRequests = new Map<string, string>();

/** Register a pending extension tab create request */
export function registerPendingExtTabCreate(
  reactTabId: string,
  requestId: string,
): void {
  pendingRequests.set(reactTabId, requestId);
}

/**
 * Called when a BrowserTab's webview fires dom-ready with the webContentsId.
 * If this tab was created by an extension, replies to main process and cleans up.
 * Returns true if it was a pending extension tab.
 */
export function resolvePendingExtTabCreate(
  reactTabId: string,
  webContentsId: number,
): boolean {
  const requestId = pendingRequests.get(reactTabId);
  if (!requestId) return false;
  pendingRequests.delete(reactTabId);
  window.forgepad.extension.sendTabCreated(requestId, webContentsId);
  return true;
}
