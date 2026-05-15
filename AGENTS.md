# ForgePad Agent Notes

This branch is moving ForgePad toward a Raycast-style native-feel desktop architecture.

Use the installed Codex skill `native-feel-cross-platform-desktop` when making architecture, desktop shell, WebView, IPC, or performance decisions for this repository.

## Architecture Direction

ForgePad should become a native app that uses a WebView for UI, not a web app wrapped by a desktop abstraction.

Target layers:

1. Native host shell
   - macOS: Swift/AppKit with WKWebView.
   - Windows: C# with WPF or WinUI and WebView2.
   - Owns windows, title bars, focus, menus, global hotkeys, app lifecycle, native dialogs, system integrations, and WebView lifecycle.
2. Shared WebView UI
   - React + TypeScript.
   - Multi-entry bundles for main workspace, browser popout, pet overlay, settings, and future focused windows.
   - No Electron or Tauri assumptions in component code.
3. Backend service
   - Long-lived Node or Bun process only if ForgePad keeps extension/browser-agent logic that benefits from JS.
   - Owns agent sessions, extension compatibility, hook server, persisted state, and business logic that should be shared across host shells.
4. Rust core
   - Owns PTY, git, file indexing, workspace scanning, path safety, context bundle generation, and performance-sensitive filesystem work.
   - Existing `src-tauri/src/lib.rs` is a useful migration source, not the final host shell.

## Rules For This Rewrite

- Do not deepen Electron dependency unless preserving current behavior during migration.
- Do not treat Tauri as the final native-feel shell; use its Rust commands as extraction candidates.
- Keep renderer-facing APIs behind one typed host contract. Avoid hand-writing divergent Electron, Tauri, Swift, and C# APIs.
- Native shell code owns native feel. React owns application UI, not window behavior.
- Prefer removing one runtime boundary before adding a new dependency.
- Keep current app behavior working while moving features behind the new contract.

## Native-Feel Checks

Before claiming a desktop change is ready, verify:

- No white flash or stale frame before a window appears.
- Menus, dialogs, popovers, emoji picker, file picker, traffic lights, and title bar behavior are platform-native.
- Hidden/prewarmed windows do not get throttled in a way that affects hot activation.
- WebView UI does not use web-only affordances such as `cursor: pointer` on ordinary controls.
- Memory measurements separate baseline framework cost from ForgePad-owned heap, caches, and leaks.
