# ForgePad macOS Native Host

This is the first Raycast-style host spike for ForgePad:

- Swift/AppKit owns the native window, menu bar, app lifecycle, and file panels.
- WKWebView is only the rendering surface for the shared React UI.
- A document-start bootstrap provides `window.forgepad` from the typed host contract.

For normal development from the repository root:

```sh
pnpm dev
```

For a local test bundle from the repository root:

```sh
pnpm build
```

The bundle does not include Node or the legacy JS backend. Core backend behavior runs in the bundled Rust `forgepad-core-daemon`.
The native package builds only the main renderer entry. Browser actions open Swift-owned `WKWebView` windows.

The core path runs through a supervised Rust daemon and a Swift-owned `forgepad://` renderer scheme.
