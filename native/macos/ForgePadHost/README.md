# ForgePad macOS Native Host

This is the first Raycast-style host spike for ForgePad:

- Swift/AppKit owns the native window, menu bar, app lifecycle, and file panels.
- WKWebView is only the rendering surface for the shared React UI.
- A document-start bootstrap provides `window.forgepad` so the current renderer can start without Electron preload or Tauri globals.

Run the renderer in one terminal:

```sh
pnpm vite:dev
```

Run the native host in another:

```sh
pnpm native:mac
```

Optionally start the backend supervisor with a command:

```sh
FORGEPAD_BACKEND_COMMAND='pnpm backend:dev' pnpm native:mac
```

Build the host:

```sh
pnpm native:mac:build
```

This host is intentionally incomplete. The next work is to replace bootstrap no-ops with calls into `forgepad-core` and a supervised backend process.
