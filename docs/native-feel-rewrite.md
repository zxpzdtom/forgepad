# Native-Feel Rewrite

ForgePad now targets a Raycast-style native desktop architecture:

- macOS shell: Swift/AppKit owns windows, menus, title-bar behavior, native dialogs, app lifecycle, and WKWebView lifecycle.
- Renderer: React + TypeScript runs as the shared WebView UI and talks only through `src/shared/host-bridge.ts`.
- Core: `crates/forgepad-core` owns PTY, Git, file scanning, context bundles, state, and performance-sensitive filesystem work.
- Browser surfaces: opened as native `WKWebView` windows through the host bridge.

The production macOS package is built with:

```sh
pnpm build
```

The package script builds the renderer, Rust daemon, and Swift host, then writes:

```text
dist/native-mac/ForgePad.app
```

Keep new native behavior behind the typed host contract. React owns application UI; the native shell owns platform behavior.
