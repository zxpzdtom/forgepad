# ForgePad

Terminal-first AI coding workspace built with Electron, React, `@pierre/trees`, and `@pierre/diffs`.

## Run

```bash
pnpm install
node node_modules/electron/install.js
pnpm exec electron-rebuild -f -w node-pty
pnpm dev
```

The renderer dev server runs at `http://localhost:5173/`, and Electron opens the desktop app.

## MVP Scope

- Left sidebar for projects, root workspace, and terminal creation.
- Center workspace with persistent terminal tabs, Monaco file editing, and Pierre diff viewing.
- Right panel with Pierre file tree, git changes, and an AI context basket.
- Multi-file context selection from the tree.
- Diff context selection from git changes.
- Diff line-range comments that are bundled with selected files and diffs.
- Context bundles written to `.forgepad/context/*.md` and pasted into the active terminal as an agent prompt.

See `AI_CODING_TOOL_PRODUCT_MANUAL.md` and `AI_CODING_TOOL_TODO.md` for the fuller product design and roadmap.
