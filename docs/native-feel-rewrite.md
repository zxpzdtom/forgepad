# Native-Feel Rewrite Plan

ForgePad is currently too heavy because it carries two desktop shell strategies at once:

- Electron is the primary packaged app (`src/main`, `src/preload`, `electron-vite`, `electron-builder`).
- Tauri v2 is partially implemented (`src-tauri`) with a large Rust command surface mirroring the Electron preload API.
- The renderer already has a useful abstraction point: `window.forgepad` plus `src/renderer/src/tauri-api.ts`.

This branch turns that mixed state into a deliberate Raycast-style architecture.

## Decision

ForgePad fits the `native-feel-cross-platform-desktop` decision tree:

- It is a developer productivity workspace that users keep open all day.
- It needs deep OS behavior: PTY, file dialogs, file watching, browser windows, notifications, app focus, custom menus, drag-and-drop, and possibly global hotkeys.
- It benefits from shared React UI for macOS and Windows.
- Its heavy paths are a good match for Rust: PTY, git, filesystem scanning, file indexing, context bundles, and path safety.

The target is not Electron, and it is not Tauri as the final shell. The target is:

```text
Native shell        Swift/AppKit on macOS, C#/WPF or WinUI on Windows
System WebView      WKWebView / WebView2 rendering React entry points
Backend service     Node/Bun only where JS extension or agent orchestration pays for itself
Rust core           PTY, git, filesystem, indexing, context, shared schemas
```

Skill tenet: T1, "put the boundary at the WebView rendering surface." The OS owns windows and system behavior; React owns the app surface.

## Current Inventory

### Keep

- `src/renderer`: main React workspace, terminal panels, files, diffs, browser UI, settings, pet overlay.
- `src/shared/types.ts`: domain types worth preserving while the host contract is formalized.
- `src-tauri/src/lib.rs`: Rust implementations for PTY, git, file IO, watching, context generation, app commands.
- `vite.config.ts`: already builds multi-entry renderer bundles (`index`, `pet`, `browser`).

### Extract

- `src/main/services/pty-service.ts` and Tauri PTY code -> Rust core PTY service.
- `src/main/services/git-service.ts` and Tauri git commands -> Rust core git service.
- `src/main/services/file-service.ts`, `path-guard.ts`, and Tauri FS commands -> Rust core filesystem service.
- `src/main/services/context-service.ts` -> Rust core or backend service depending on template/agent coupling.
- `HookServer` and `AgentHooksService` -> backend service if they remain JS-heavy.
- Browser extension compatibility -> likely backend + native shell support, because WebView2/WKWebView will not behave like Electron `<webview>`.

### Retire

- Electron as the production shell.
- Electron preload as the source of truth for app APIs.
- Tauri as a cross-platform desktop abstraction once native shells exist.
- Renderer code that depends directly on Electron `<webview>` semantics.

## Target Repository Shape

```text
native/
  macos/                 Swift/AppKit host, WKWebView lifecycle, windows, menus
  windows/               C# host, WebView2 lifecycle, windows, tray/taskbar
backend/
  src/                   JS runtime for agents, extensions, hook server, state
crates/
  forgepad-core/         Rust PTY/git/fs/index/context core
schema/
  host-bridge.v1.json    single host contract, codegenerated clients
src/
  renderer/              React UI, no shell-specific imports
  shared/                generated and manually maintained shared TS types
```

## Migration Phases

1. Freeze the renderer API.
   - Introduce one host contract that covers `window.forgepad`.
   - Generate or mechanically derive TS client types from that contract.
   - Stop adding raw Electron/Tauri channels.

2. Move command implementations out of host shells.
   - Convert Tauri Rust commands into `crates/forgepad-core`.
   - Keep Electron and Tauri adapters thin while the app still runs.
   - Make path safety and serialization tests live with Rust core.

3. Create the macOS native shell spike.
   - Swift/AppKit app with one `NSWindow` and one `WKWebView`.
   - Load existing Vite renderer.
   - Implement only app lifecycle, open project, state load/save, and shell open path.
   - Add WebView survival fixes before expanding scope: prewarm, no white flash, titlebar/native material ownership.

4. Add the backend supervisor only where needed.
   - Start JS backend from native shell.
   - Move hook server, agent lifecycle events, and extension compatibility into it.
   - Keep Rust core available to both shell and backend through one bridge.

5. Replace Electron-only browser behavior.
   - Electron `<webview>` is the largest portability risk.
   - Decide whether ForgePad needs a full embedded browser, a reduced preview surface, or OS browser handoff.
   - Rebuild popout/browser tabs against WKWebView/WebView2 windows instead of Electron webContents IDs.

6. Remove Electron.
   - Delete `src/main`, `src/preload`, `electron.vite.config.ts`, Electron package scripts, and Electron packaging.
   - Keep the old app runnable until the macOS shell reaches feature parity for the core workspace.

7. Add Windows host.
   - Reuse renderer, schema, backend, and Rust core.
   - Implement platform-native windowing and WebView2 lifecycle separately.

## First Milestone

The first milestone is not "feature parity." It is a native macOS shell that proves the architecture:

- Starts ForgePad with a prewarmed WKWebView.
- Shows the main React workspace without white flash.
- Loads and saves persisted state.
- Opens a project folder.
- Starts one terminal through Rust core.
- Has native menu items for Settings, Open Project, Hide, Quit, Copy/Paste, and Reload in development.

## Current Branch Progress

This branch has started the split without breaking the existing app:

- `src/shared/host-bridge.ts` is now the renderer-facing TypeScript contract.
- Electron preload and the Tauri adapter both conform to `HostBridgeApi`.
- `schema/host-bridge.v1.json` records ownership metadata for native shell, Rust core, and migration risks.
- `crates/forgepad-core` exists as the extraction target for host-independent Rust services.
- The first extracted Rust modules cover command execution, path safety, file tree/list/read/write helpers, Git/worktree operations, PTY lifecycle/replay/event callbacks, context bundle generation, and persisted state load/save.
- `native/macos/ForgePadHost` is a compiling Swift/AppKit + WKWebView host spike with native menu wiring, delayed WebView reveal, and a document-start `window.forgepad` compatibility bridge.
- `backend/src/index.ts` is the first supervised backend process entry. The Swift host can start it with `FORGEPAD_BACKEND_COMMAND`, capture stdout/stderr, send JSON commands over stdin, and terminate it with the app.
- `backend/src/hook-server.ts` is an Electron-free HookServer migration. It owns hook HTTP endpoints, permission hold/resolve, prompt/stop parsing, and emits agent lifecycle events as JSON lines.
- `pnpm backend:smoke` verifies backend startup, hook server readiness, and graceful shutdown without Electron.
- `forgepad-core-daemon` is a JSON-lines Rust core coordinator. The Swift host supervises it with `CoreSupervisor`, sends host bridge commands over stdio, and forwards PTY events back to React.
- Native browser popout now uses AppKit `NSWindow` + `WKWebView` through `BrowserWindowController`, replacing Electron popout for that path.
- `crates/forgepad-core/src/lsp.rs` now owns text definition search parsing, further shrinking host responsibilities.
- The macOS host loads bundled renderer assets through a Swift-owned `forgepad://` URL scheme. This avoids WKWebView `file://` ES module failure while keeping the WebView as a rendering surface.
- `pnpm native:mac:package` now builds a slim local-test bundle. It excludes Node and relies on a system Node for the JS backend.
- `pnpm native:mac:package:portable` builds a self-contained bundle with the current Node binary copied into `Contents/Resources/node`.

## Native Binding Strategy

The current Swift host uses small local implementations for state/open-project while the Rust core extraction stabilizes. The next binding step is one of:

- UniFFI dylib: best long-term match for Raycast-style Swift/C#/Rust typed boundaries.
- Rust subprocess over stdio: faster to wire, easier crash isolation, slightly higher IPC overhead.

The active implementation now uses the Rust subprocess route first. This keeps the native host thin, gives crash isolation, and lets the WebView bridge call Git/FS/PTY/context/LSP through one JSON-lines protocol. Use UniFFI later if profiling shows stdio overhead on high-frequency paths.

## Weight Targets

Initial targets are intentionally practical:

- Packaged app should remove bundled Chromium by removing Electron.
- Current slim macOS bundle is about 39 MB. The portable bundle is about 120-130 MB larger because it includes Node.
- Current renderer assets are about 34 MB. The biggest remaining frontend chunks are Mermaid, Shiki language/theme assets, terminal/browser UI, and syntax-heavy editor paths.
- Idle memory should be measured in three buckets: native shell, WebView renderer, backend/Rust services.
- Baseline target after Electron removal: under current Electron idle usage by at least 30%.
- Sustained idle target after cleanup: below 500 MB for a typical workspace, excluding shared framework accounting.

## Open Risks

- Browser tabs and extension APIs are currently Electron-shaped.
- See `docs/browser-migration.md` for the plan to replace Electron `<webview>` and `webContentsId`.
- `node-pty` and `portable-pty` need one chosen owner; the target is Rust core.
- IPC contract generation is not implemented yet.
- A real native shell needs Xcode and Visual Studio project scaffolding, not just Rust/Tauri.
- Some "lightness" gains may come from removing features or lazy-loading windows, not only changing frameworks.
- Renderer slimming still needs feature-level migration: reduce always-packaged Mermaid/Shiki assets, split browser/editor-heavy paths more aggressively, and remove Electron-shaped browser compatibility once native browser tabs land.
