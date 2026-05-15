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

Build the host:

```sh
pnpm native:mac:build
```

Build a slim app bundle for local testing:

```sh
pnpm native:mac:package
```

The bundle does not include Node or the legacy JS backend. Core backend behavior runs in the bundled Rust `forgepad-core-daemon`.
The native package also builds only the main renderer entry. Browser actions open Swift-owned `WKWebView` windows instead of packaging the Electron browser/pet entries.

This host is intentionally incomplete, but the core path now runs through a supervised Rust daemon and a Swift-owned `forgepad://` renderer scheme instead of Electron or Tauri shell loading.
