# Browser And Extension Migration

ForgePad currently has a strongly Electron-shaped browser surface:

- Renderer components use `<webview>`.
- Browser APIs pass Electron `webContentsId` values.
- Extension popups and tab creation rely on Electron session/preload behavior.
- Screenshot, touch emulation, console forwarding, and DevTools are Electron IPC handlers.

This is the largest portability risk in the native-feel rewrite. WKWebView and WebView2 do not share Electron's `webContents` model.

## Target

Browser windows should become native-host-owned WebView windows:

- macOS host owns each `WKWebView` and its `NSWindow`.
- Windows host owns each WebView2 and its native window.
- React renders browser chrome and asks the host for browser operations through the host bridge.
- Host returns stable ForgePad browser tab IDs, not Electron `webContentsId`.

## Interim Compatibility

The Swift host currently injects a compatibility `window.forgepad.browser` object:

- `popout` and `openWindow` route to the native host bridge.
- Electron-only operations return safe no-ops or empty values.
- This lets the existing renderer boot while native browser APIs are rebuilt.

## Migration Steps

1. Introduce ForgePad browser IDs.
   - Replace renderer assumptions that a tab is identified by `webContentsId`.
   - Use `browserId: string` in host bridge calls.

2. Move browser lifecycle into host bridge.
   - `browser.createTab`
   - `browser.closeTab`
   - `browser.navigate`
   - `browser.goBack`
   - `browser.goForward`
   - `browser.reload`
   - `browser.captureScreenshot`
   - `browser.openDevTools`

3. Split extension support from browser rendering.
   - Extension registry belongs in backend service.
   - Popup windows belong to native host.
   - Content-script injection must be rethought per platform.

4. Delete Electron `<webview>` dependencies.
   - Remove JSX intrinsic `webview` once BrowserTab no longer renders it.
   - Remove Electron session preload scripts.
   - Remove webContents IDs from shared types and renderer state.

## Decision Point

Before rebuilding full Chrome-extension compatibility, decide whether ForgePad truly needs it in the native version.

Options:

- Full compatibility: most work, highest power.
- Reduced browser preview: lighter, more native, likely enough for agent inspection.
- External browser handoff: lightest, but loses integrated inspection and screenshot workflows.
