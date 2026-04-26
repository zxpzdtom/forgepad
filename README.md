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

- Left sidebar for projects, root workspace, task creation, and terminal creation.
- Center workspace with persistent shell/agent terminal tabs, Pierre-powered file viewing, Pierre diff viewing, and context bundle preview.
- Right panel with Pierre file tree, git changes, and an AI context basket.
- Multi-file and folder context selection from the tree.
- File context can include full contents or reference the path only.
- Diff context selection from git changes.
- Diff line-range comments that are bundled with selected files and diffs.
- Task context selection from the sidebar, including task title, status, description, and optional notes.
- Workspace file watching refreshes file tree, git changes, and open diffs after external edits.
- Agent terminals launch the Context panel's Agent command (`codex` by default) in the active workspace.
- Context bundles written to `.forgepad/context/*.md` and pasted into the active terminal as an agent prompt.

## Task Workflow

- Open a project, then use the sidebar Tasks section to create a task for the active project/workspace.
- Use the task status selector to move tasks through `backlog`, `ready`, `running`, `review`, and `done`.
- Click the send/context action on a task to add it to the AI context basket.
- Send the context basket to the active terminal to generate a bundle containing the prompt, selected task details, files, diffs, and comments.
- Use Preview Bundle from the Context panel after sending to inspect the generated markdown.

## Shortcuts

- `Cmd/Ctrl+T`: create a new terminal.
- `Shift+Cmd/Ctrl+T`: create a new agent terminal.
- `Cmd/Ctrl+W`: close the active tab.
- `Cmd/Ctrl+J`: focus the terminal workflow by creating a terminal for the active workspace.
- `Shift+Cmd/Ctrl+E`: switch the right panel to Files.
- `Shift+Cmd/Ctrl+G`: switch the right panel to Changes.
- `Shift+Cmd/Ctrl+C`: switch the right panel to Context.

See `AI_CODING_TOOL_PRODUCT_MANUAL.md` and `AI_CODING_TOOL_TODO.md` for the fuller product design and roadmap.
