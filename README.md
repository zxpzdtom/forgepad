<p align="center">
  <img src="./build/icon.png" alt="ForgePad icon" width="96" height="96">
</p>

<h1 align="center">ForgePad</h1>

<p align="center">
  A native-feel desktop workspace for AI-assisted coding, bringing terminals, files, diffs, context, and agent sessions into one focused app.
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文文档</a>
</p>

## Highlights

- **Native host shell**: macOS runs through a Swift/AppKit host with WKWebView; React is the shared UI surface.
- **Rust core**: PTY, Git, file scanning, context generation, and filesystem work live in `crates/forgepad-core`.
- **AI coding workspace**: Manage projects, worktrees, regular terminals, and AI coding tool terminals in one interface.
- **Files and changes**: Browse files and Git changes through `@pierre/trees`, inspect diffs, and select context directly.
- **Typed host contract**: Renderer APIs are kept behind `src/shared/host-bridge.ts`.

## Requirements

- Node.js 22 or newer.
- pnpm.
- Rust toolchain.
- Xcode command line tools for the macOS native host.

## Install

```bash
pnpm install
```

## Development

Run the full local app: Vite renderer plus the Swift/AppKit host.

```bash
pnpm dev
```

## Build

Build the native macOS app bundle:

```bash
pnpm build
```

The app is written to:

```text
dist/native-mac/ForgePad.app
```

## Useful Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run the Vite renderer and Swift/AppKit host for local development |
| `pnpm build` | Type-check, test the Rust core, and build the native macOS bundle |
| `pnpm typecheck` | Type-check the renderer and shared TypeScript |
| `pnpm lint` | Check source files with Biome |
| `pnpm format` | Format source files with Biome |

## Project Structure

```text
native/macos/    Swift/AppKit host shell
crates/          Rust core services
src/renderer/    React renderer app
src/shared/      Shared TypeScript types and host contract
schema/          Host bridge schema
build/           App icons and packaging resources
dist/            Build output
```

## Notes

ForgePad is private application code. Keep generated build output, local worktrees, machine-specific config, and temporary files out of commits unless they are intentionally part of a release artifact.
