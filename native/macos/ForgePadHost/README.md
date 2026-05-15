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

Build a slim app bundle for local testing:

```sh
pnpm native:mac:package
```

The slim bundle does not include Node. It starts the bundled backend with a system Node found from the app environment, Homebrew, or common local Node paths.

Build a portable app bundle that also includes the current Node runtime:

```sh
pnpm native:mac:package:portable
```

Use the portable bundle only when the test machine cannot provide Node. It is roughly 120-130 MB larger because the Node binary is copied into `Contents/Resources/node`.

This host is intentionally incomplete, but the core path now runs through a supervised Rust daemon, a supervised backend process, and a Swift-owned `forgepad://` renderer scheme instead of Electron or Tauri shell loading.
