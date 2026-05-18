import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useResolvedTheme } from '@renderer/app/theme-context';
import { eventMatchesCombo } from '@renderer/lib/shortcut-utils';
import { useAppStore } from '@renderer/store/app-store';
import type { ShortcutCombo, Tab, Workspace } from '@shared/types';
import { DEFAULT_SHORTCUTS } from '@shared/types';
import { FitAddon } from '@xterm/addon-fit';
import type { ISearchResultChangeEvent } from '@xterm/addon-search';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import type { ILink, ILinkProvider, ITheme } from '@xterm/xterm';
import { Terminal } from '@xterm/xterm';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

import clsx from 'clsx';

/**
 * Convert a mouse event's pixel coordinates to terminal cell (col, row).
 *
 * Uses xterm.js internal _core._renderService.dimensions for accurate cell
 * sizing — more reliable than dividing container width by column count,
 * which can be off when the terminal has padding or fractional scaling.
 * (This is the same approach used by Superset/Warp.)
 */
function getTerminalCoordsFromEvent(terminal: Terminal, event: MouseEvent): { col: number; row: number } | null {
  const core = (
    terminal as unknown as {
      _core?: {
        screenElement?: HTMLElement;
        _mouseService?: {
          getCoords: (
            event: { clientX: number; clientY: number },
            element: HTMLElement,
            colCount: number,
            rowCount: number,
            isSelection?: boolean,
          ) => [number, number] | undefined;
        };
        _renderService?: {
          dimensions?: { css: { cell: { width: number; height: number } } };
        };
      };
    }
  )._core;

  // Prefer xterm.js' own mouse coordinate service. This keeps the click mapping
  // identical to xterm's selection/link/mouse-report logic and avoids subtle
  // offsets between the agent column and the bottom terminal dock.
  const screenElement = core?.screenElement;
  const mouseCoords = screenElement
    ? core?._mouseService?.getCoords(event, screenElement, terminal.cols, terminal.rows)
    : undefined;
  if (mouseCoords) {
    return {
      col: Math.max(0, Math.min(terminal.cols - 1, mouseCoords[0] - 1)),
      row: Math.max(0, Math.min(terminal.rows - 1, mouseCoords[1] - 1)),
    };
  }

  const element = screenElement ?? terminal.element;
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const x = event.clientX - rect.left - paddingLeft;
  const y = event.clientY - rect.top - paddingTop;

  // Access internal xterm.js dimensions for precise cell size.
  const dimensions = core?._renderService?.dimensions;

  if (!dimensions?.css?.cell) return null;

  const { width: cellWidth, height: cellHeight } = dimensions.css.cell;
  if (cellWidth <= 0 || cellHeight <= 0) return null;

  const col = Math.max(0, Math.min(terminal.cols - 1, Math.floor(x / cellWidth)));
  const row = Math.max(0, Math.min(terminal.rows - 1, Math.floor(y / cellHeight)));

  return { col, row };
}

function getLineDisplayAwareArrowSteps(terminal: Terminal, bufferRow: number, fromCol: number, toCol: number): number {
  if (fromCol === toCol) return 0;

  const line = terminal.buffer.active.getLine(bufferRow);
  if (!line) return Math.abs(toCol - fromCol);

  const start = Math.max(0, Math.min(terminal.cols, Math.min(fromCol, toCol)));
  const end = Math.max(0, Math.min(terminal.cols, Math.max(fromCol, toCol)));
  let steps = 0;

  // Arrow keys move by logical characters/graphemes, not by display cells.
  // Wide CJK characters occupy two terminal cells but one Left/Right press,
  // and their second cell has width 0 in xterm's buffer. Count only leading
  // cells so click-to-move stays aligned for mixed English/Chinese input.
  const scratchCell = terminal.buffer.active.getNullCell();
  for (let col = start; col < end; col++) {
    const cell = line.getCell(col, scratchCell);
    if (!cell) continue;
    if (cell.getWidth() > 0) steps++;
  }

  return steps || Math.abs(toCol - fromCol);
}

function getLineUsedEndCol(terminal: Terminal, bufferRow: number): number {
  const line = terminal.buffer.active.getLine(bufferRow);
  if (!line?.translateToString) return terminal.cols;

  const text = line.translateToString(true, 0, terminal.cols);
  if (!text) return 0;

  const scratchCell = terminal.buffer.active.getNullCell();
  for (let col = terminal.cols - 1; col >= 0; col--) {
    const cell = line.getCell(col, scratchCell);
    if (!cell) continue;
    if (cell.getWidth() === 0) continue;
    if (cell.getChars()) return Math.min(terminal.cols, col + cell.getWidth());
  }

  return text.length;
}

function isSameInputVisualBlock(terminal: Terminal, fromBufferRow: number, toBufferRow: number): boolean {
  if (fromBufferRow === toBufferRow) return true;

  const start = Math.min(fromBufferRow, toBufferRow);
  const end = Math.max(fromBufferRow, toBufferRow);
  const buffer = terminal.buffer.active;

  // Soft-wrap case (regular shell/readline wrapping): every continuation row is
  // flagged as wrapped by xterm.
  let allSoftWrapped = true;
  for (let row = start + 1; row <= end; row++) {
    if (!buffer.getLine(row)?.isWrapped) {
      allSoftWrapped = false;
      break;
    }
  }
  if (allSoftWrapped) return true;

  // Some agent TUIs render a multi-row input area by repainting individual rows
  // instead of letting xterm soft-wrap, so `isWrapped` is false even though Left
  // and Right still move through the visual input block. Keep this conservative:
  // only allow nearby rows in the live viewport, below the scrollback boundary.
  // Empty rows are allowed because a multi-line input can contain blank lines;
  // crossing them still consumes the hidden newline character.
  if (Math.abs(toBufferRow - fromBufferRow) > 8) return false;
  if (start < buffer.baseY) return false;

  for (let row = start; row <= end; row++) {
    if (!buffer.getLine(row)) return false;
  }

  return true;
}

function getLineMotionEndCol(terminal: Terminal, bufferRow: number): number {
  const line = terminal.buffer.active.getLine(bufferRow);
  // xterm soft-wrap rows are display-full even if the final character is a wide
  // glyph whose placeholder cell is empty.
  if (line?.isWrapped) return terminal.cols;
  return Math.max(0, Math.min(terminal.cols, getLineUsedEndCol(terminal, bufferRow)));
}

function getHardLineBreakStep(terminal: Terminal, nextBufferRow: number): number {
  // Soft-wrapped continuation rows are the same logical line, so crossing the
  // visual boundary does not consume an extra readline/TUI cursor step. Rows
  // that are not marked as wrapped usually represent an explicit newline in a
  // multi-line input editor; count that newline as one logical arrow step. This
  // is especially important for empty lines, whose visible cell count is 0 but
  // whose newline still exists in the input buffer.
  return terminal.buffer.active.getLine(nextBufferRow)?.isWrapped ? 0 : 1;
}

function getClickableTargetCol(terminal: Terminal, bufferRow: number, clickedCol: number): number {
  const line = terminal.buffer.active.getLine(bufferRow);
  if (!line) return clickedCol;

  // For hard multiline input rows, clicking past visible content should land at
  // that row's logical EOL. For an empty line, that means column 0 regardless of
  // where the user clicks in the blank area. Soft-wrapped rows still use the
  // full terminal width because the visual row is a slice of one long line.
  if (!line.isWrapped) {
    return Math.min(clickedCol, getLineUsedEndCol(terminal, bufferRow));
  }

  return clickedCol;
}

function getDisplayAwareArrowMotion(
  terminal: Terminal,
  fromBufferRow: number,
  fromCol: number,
  toBufferRow: number,
  toCol: number,
): { direction: -1 | 1; steps: number } | null {
  const rowDelta = toBufferRow - fromBufferRow;
  const colDelta = toCol - fromCol;
  if (rowDelta === 0 && colDelta === 0) return null;
  if (!isSameInputVisualBlock(terminal, fromBufferRow, toBufferRow)) return null;

  const direction: -1 | 1 = rowDelta < 0 || (rowDelta === 0 && colDelta < 0) ? -1 : 1;

  if (fromBufferRow === toBufferRow) {
    return {
      direction,
      steps: getLineDisplayAwareArrowSteps(terminal, fromBufferRow, fromCol, toCol),
    };
  }

  let steps = 0;

  if (direction < 0) {
    // Move left from cursor to a click on an earlier visual row. Count chars in
    // [target, cursor) across either a soft-wrapped row range or a TUI-painted
    // multi-row input block.
    steps += getLineDisplayAwareArrowSteps(terminal, toBufferRow, toCol, getLineMotionEndCol(terminal, toBufferRow));
    for (let row = toBufferRow + 1; row <= fromBufferRow; row++) {
      steps += getHardLineBreakStep(terminal, row);
      if (row < fromBufferRow) {
        steps += getLineDisplayAwareArrowSteps(terminal, row, 0, getLineMotionEndCol(terminal, row));
      }
    }
    steps += getLineDisplayAwareArrowSteps(terminal, fromBufferRow, 0, fromCol);
  } else {
    // Move right from cursor to a click on a later visual row. Count chars in
    // [cursor, target) across either a soft-wrapped row range or a TUI-painted
    // multi-row input block.
    steps += getLineDisplayAwareArrowSteps(terminal, fromBufferRow, fromCol, getLineMotionEndCol(terminal, fromBufferRow));
    for (let row = fromBufferRow + 1; row <= toBufferRow; row++) {
      steps += getHardLineBreakStep(terminal, row);
      if (row < toBufferRow) {
        steps += getLineDisplayAwareArrowSteps(terminal, row, 0, getLineMotionEndCol(terminal, row));
      }
    }
    steps += getLineDisplayAwareArrowSteps(terminal, toBufferRow, 0, toCol);
  }

  return steps > 0 ? { direction, steps } : null;
}

/**
 * Attach click-to-move-cursor to a terminal instance.
 *
 * Clicking on the current prompt line sends arrow-key sequences to move
 * the cursor to the clicked column. Works for both the shell prompt and
 * TUI apps like Claude Code (Ink) that run in the normal buffer.
 *
 * Skipped when:
 * - Not a left-click, or modifier keys are held
 * - User has an active text selection (drag-to-copy)
 * - Terminal is in the alternate screen buffer (vim, less, htop, etc.)
 * - Click is not on the cursor's current row
 *
 * Returns a cleanup function.
 */
function setupClickToMoveCursor(
  terminal: Terminal,
  writeToPty: (data: string) => void,
  syncLayoutBeforeClick?: () => void,
): () => void {
  const EDGE_CLICK_COLS = 2;

  const handleMouseUp = (event: MouseEvent) => {
    // Skip alternate-screen apps (vim, less, htop…) — they handle mouse themselves.
    if (terminal.buffer.active !== terminal.buffer.normal) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (terminal.hasSelection()) return;

    // The bottom terminal dock can be resized independently from the agent
    // column. Force xterm's layout to settle before mapping mouse pixels to
    // rows/cols, otherwise the click target can be off by a fraction of a row.
    syncLayoutBeforeClick?.();

    const coords = getTerminalCoordsFromEvent(terminal, event);
    if (!coords) return;

    const buffer = terminal.buffer.active;
    // Reconcile viewport-relative cursor row with buffer-absolute click row.
    const clickBufferRow = coords.row + buffer.viewportY;
    const cursorBufferRow = buffer.cursorY + buffer.viewportY;
    const targetCol = getClickableTargetCol(terminal, clickBufferRow, coords.col);
    const motion = getDisplayAwareArrowMotion(terminal, cursorBufferRow, buffer.cursorX, clickBufferRow, targetCol);
    if (!motion) return;

    // Fast path for common readline motions: click near the left/right edge of
    // the current input line to jump to command start/end. For arbitrary middle
    // columns we still use arrow-key deltas because prompt width, soft wraps and
    // full-width CJK cells make Ctrl+A/Ctrl+E + offset error-prone without shell
    // cooperation (OSC 133/prompt marks).
    if (clickBufferRow === cursorBufferRow && targetCol <= EDGE_CLICK_COLS) {
      writeToPty('\x01'); // Ctrl+A — beginning of input in readline/zle
      return;
    }
    if (clickBufferRow === cursorBufferRow && targetCol >= terminal.cols - 1 - EDGE_CLICK_COLS) {
      writeToPty('\x05'); // Ctrl+E — end of input in readline/zle
      return;
    }

    const arrow = motion.direction > 0 ? '\x1b[C' : '\x1b[D';
    writeToPty(arrow.repeat(motion.steps));
  };

  terminal.element?.addEventListener('mouseup', handleMouseUp);
  return () => terminal.element?.removeEventListener('mouseup', handleMouseUp);
}

function macTerminalEditSequence(event: KeyboardEvent): string | null {
  if (event.type !== 'keydown') return null;
  if (event.shiftKey || event.ctrlKey) return null;

  const key = event.key.toLowerCase();

  if (event.metaKey && !event.altKey) {
    if (key === 'arrowleft' || key === 'home') return '\x01'; // Ctrl+A
    if (key === 'arrowright' || key === 'end') return '\x05'; // Ctrl+E
    if (key === 'backspace') return '\x15'; // Ctrl+U
    if (key === 'delete') return '\x0b'; // Ctrl+K
    return null;
  }

  if (event.altKey && !event.metaKey) {
    if (key === 'arrowleft') return '\x1bb'; // Esc+b
    if (key === 'arrowright') return '\x1bf'; // Esc+f
    if (key === 'backspace') return '\x1b\x7f'; // Esc+Backspace
    if (key === 'delete') return '\x1bd'; // Esc+d
  }

  return null;
}

const TERMINAL_THEMES: Record<'dark' | 'light', ITheme> = {
  dark: {
    background: '#0d0f13',
    foreground: '#d8dee9',
    cursor: '#67d5b5',
    cursorAccent: '#0d0f13',
    selectionBackground: '#31545b',
    selectionForeground: '#d8dee9',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#697393',
    brightRed: '#d08770',
    brightGreen: '#b4d195',
    brightYellow: '#f0d8a8',
    brightBlue: '#8caece',
    brightMagenta: '#c7a4c0',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
  },
  light: {
    background: '#f8f9fa',
    foreground: '#1e293b',
    cursor: '#0e8a6d',
    cursorAccent: '#f8f9fa',
    selectionBackground: '#bae6fd',
    selectionForeground: '#1e293b',
    black: '#1e293b',
    red: '#dc2626',
    green: '#15803d',
    yellow: '#b45309',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0e7490',
    white: '#e2e8f0',
    brightBlack: '#64748b',
    brightRed: '#dc2626',
    brightGreen: '#15803d',
    brightYellow: '#b45309',
    brightBlue: '#2563eb',
    brightMagenta: '#7c3aed',
    brightCyan: '#0e7490',
    brightWhite: '#f8fafc',
  },
};

type TerminalTab = Extract<Tab, { type: 'terminal' }>;

type TerminalPanelProps = {
  tab: TerminalTab;
  workspace: Workspace;
  active: boolean;
};

const SESSION_ID_PATTERNS = [
  // Claude: "Session: abc12345-..." or "session id: abc..."
  /session\s*(?:id)?[:\s]+([a-f0-9-]{36})/i,
  // Claude: "Resuming conversation abc12345-..."
  /resuming\s+(?:conversation|session)\s+([a-f0-9-]{36})/i,
  // Codex: "Session ID: <any-id>"
  /session\s+id[:\s]+(\S+)/i,
  // Gemini: "Session: <name>" or similar
  /session[:\s]+([a-zA-Z0-9_-]+)/i,
];

const DEFAULT_TERMINAL_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

const LOCAL_URL_RE = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d{1,5})?(?:\/[^\s\x1b]*)?/g;

function stripTrailingUrlPunctuation(url: string): string {
  return url.replace(/[.,);\]]+$/, '');
}

function normalizeSearchSelection(selection: string): string {
  return selection.replace(/\r?\n/g, ' ').trim();
}

function normalizeLocalPreviewUrl(url: string): string {
  // 0.0.0.0 is a bind address printed by dev servers, not a useful browser
  // destination. Open it through localhost instead.
  return url.replace(/^(https?:\/\/)0\.0\.0\.0(?=[:/]|$)/, '$1localhost');
}

function tryExtractSessionId(data: string): string | null {
  for (const pattern of SESSION_ID_PATTERNS) {
    const match = data.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

// ── File-path link provider ─────────────────────────────────────────────
// Detects file paths in terminal output and makes them Cmd+Click-able
// to open in the app's built-in editor.

const FILE_EXT =
  'ts|tsx|js|jsx|mjs|cjs|json|jsonc|css|scss|less|html|htm|md|mdx|py|go|rs|toml|yaml|yml|sh|bash|zsh|vue|svelte|rb|java|kt|c|cpp|h|hpp|cs|swift|php|sql|graphql|gql|xml|svg|txt|env|lock|cfg|ini|conf|dockerfile|makefile';

// Match file paths with known extensions, optionally followed by :line or :line:col
// Supports: src/foo.ts, ./foo/bar.tsx, ../utils.js, /abs/path/file.go, foo.ts:42, foo.ts:42:10
const FILE_PATH_RE = new RegExp(
  `(?:^|[\\s"'(\`[{,;=])` + // boundary before path
    `((?:\\./|\\.\\.(?:/|(?=[^.]))|/|[a-zA-Z0-9@_])` + // path start: ./ ../ / or word char
    `[^\\s"'()\`\\]},;:]*\\.(?:${FILE_EXT})` + // path body with known extension (excludes parens)
    `(?::\\d+(?::\\d+)?)?)` + // optional :line:col
    `(?=[\\s"'()\`\\]},;:]|$)`, // boundary after path
  'gi',
);

/**
 * Strip ANSI escape sequences from a string so regex matching works on
 * the visible text only.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x1b\\|\x07)|\x1b[()][AB012]/g, '');
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

async function resolveWorkspaceRelPath(worktreePath: string, candidate: string): Promise<string> {
  const normalized = candidate.replace(/^\.\//, '');
  if (normalized.includes('/')) {
    const files = await window.forgepad.fs.listFiles(worktreePath).catch(() => []);
    if (files.includes(normalized)) return normalized;
    const suffixMatches = files.filter((file) => file.endsWith(`/${normalized}`));
    if (suffixMatches.length > 0) return suffixMatches.sort((a, b) => a.length - b.length)[0];
    return normalized;
  }

  // Agent/tool logs often print only a basename, e.g. "Read FileEditor.tsx".
  // Resolve that against the workspace file list so Cmd+Click still opens the
  // real file instead of a non-existent root-level FileEditor.tsx tab.
  const files = await window.forgepad.fs.listFiles(worktreePath).catch(() => []);
  const matches = files.filter((file) => basename(file) === normalized);
  if (matches.length > 0) return matches.sort((a, b) => a.length - b.length)[0];
  return normalized;
}

function createFilePathLinkProvider(terminal: Terminal, workspaceId: string, worktreePath: string): ILinkProvider {
  return {
    provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void): void {
      const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }

      const lineText = line.translateToString(true);
      if (!lineText.trim()) {
        callback(undefined);
        return;
      }

      // Match against ANSI-stripped text to get correct visual positions
      const cleanText = stripAnsi(lineText);
      const links: ILink[] = [];
      FILE_PATH_RE.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = FILE_PATH_RE.exec(cleanText)) !== null) {
        const filePath = match[1];
        if (!filePath) continue;

        // Find the position of the captured group in the clean text
        const startIndex = match.index + match[0].indexOf(filePath);
        const endIndex = startIndex + filePath.length;

        // Strip :line:col suffix to get the actual file path
        const pathOnly = filePath.replace(/:\d+(?::\d+)?$/, '');

        // Resolve to relative path within the workspace
        let relPath: string;
        let absPath: string | undefined;
        if (pathOnly.startsWith('/')) {
          // Absolute path — check if it's within the workspace
          if (pathOnly.startsWith(worktreePath + '/')) {
            relPath = pathOnly.slice(worktreePath.length + 1);
          } else {
            absPath = pathOnly;
            relPath = pathOnly.split('/').pop() ?? pathOnly;
          }
        } else {
          // Relative path — strip leading ./ if present
          relPath = pathOnly.replace(/^\.\//, '');
        }

        links.push({
          range: {
            start: { x: startIndex + 1, y: bufferLineNumber },
            end: { x: endIndex, y: bufferLineNumber },
          },
          text: filePath,
          decorations: { pointerCursor: true, underline: true },
          async activate(event: MouseEvent) {
            // Only open on Cmd+Click (Mac) or Ctrl+Click (Windows/Linux)
            if (!event.metaKey && !event.ctrlKey) return;
            const store = useAppStore.getState();
            if (absPath) {
              store.openExternalFileTab(workspaceId, absPath);
            } else {
              const lineMatch = filePath.match(/:(\d+)(?::\d+)?$/);
              const lineNumber = lineMatch?.[1] ? Number.parseInt(lineMatch[1], 10) : undefined;
              const resolvedRelPath = await resolveWorkspaceRelPath(worktreePath, relPath);
              store.openFileTab(workspaceId, resolvedRelPath, lineNumber);
            }
          },
        });
      }

      callback(links.length > 0 ? links : undefined);
    },
  };
}

export function TerminalPanel({ tab, workspace, active }: TerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const activeRef = useRef(active);
  const sessionIdDetectedRef = useRef(false);
  const detectedLocalUrlsRef = useRef<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<ISearchResultChangeEvent>({ resultIndex: -1, resultCount: 0 });
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const appShortcuts = useMemo(() => ({ ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) }), [keyboardShortcuts]);
  const shortcutsRef = useRef<Record<string, ShortcutCombo>>(appShortcuts);
  shortcutsRef.current = appShortcuts;
  const fontSize = useAppStore((state) => state.settings.terminalFontSize);
  const configuredFontFamily = useAppStore((state) => state.settings.terminalFontFamily);
  const terminalThemeMode = useAppStore((state) => state.settings.terminalThemeMode);
  const agentThemeMode = useAppStore((state) => state.settings.agentThemeMode);
  const resolvedTheme = useResolvedTheme();
  // Compute the effective terminal theme: agent and shell can have independent overrides
  const themeMode = tab.isAgent ? agentThemeMode : terminalThemeMode;
  const effectiveTerminalTheme: 'dark' | 'light' = themeMode === 'follow' ? resolvedTheme : themeMode;

  useEffect(() => {
    activeRef.current = active;
    if (active) {
      window.setTimeout(() => fitRef.current?.fit(), 0);
    }
  }, [active]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: configuredFontFamily.trim() || DEFAULT_TERMINAL_FONT_FAMILY,
      fontSize,
      lineHeight: 1.18,
      scrollback: 8000,
      theme: TERMINAL_THEMES[effectiveTerminalTheme],
      allowProposedApi: true,
    });
    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = '11';

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    const searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    searchRef.current = searchAddon;
    const searchResultsDisposable = searchAddon.onDidChangeResults((result) => {
      setSearchResult(result);
    });

    terminal.loadAddon(
      new WebLinksAddon((event, url) => {
        // Only open links on Cmd+Click (Mac) or Ctrl+Click (Windows/Linux)
        if (event.metaKey || event.ctrlKey) {
          void window.forgepad.shell.openExternal(url);
        }
      }),
    );

    // File-path link provider: Cmd+Click on file paths opens them in the editor
    const filePathLinkDisposable = terminal.registerLinkProvider(
      createFilePathLinkProvider(terminal, workspace.id, workspace.worktreePath),
    );

    const writeUserInputToPty = (data: string) => {
      window.forgepad.pty.write(tab.ptyId, data);
      if (tab.isAgent) {
        useAppStore.getState().notifyAgentInput(tab.ptyId);
      }
    };

    // Let Cmd/Ctrl shortcuts bubble to the window so app-level
    // keybindings still work while the terminal is focused.
    // Uses the live shortcuts ref so user-customised bindings are respected
    // without needing to recreate the terminal instance.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;

      // macOS native terminal editing gestures are not automatically translated
      // by the WebView. Map them to readline/zle sequences while ordinary shell
      // control keys (Ctrl+U/K/W/A/E, etc.) continue to pass through normally.
      if (terminal.buffer.active === terminal.buffer.normal) {
        const editSequence = macTerminalEditSequence(event);
        if (editSequence) {
          writeUserInputToPty(editSequence);
          return false;
        }
      }

      if (!event.metaKey && !event.ctrlKey) return true;

      // Cmd/Ctrl+F — open terminal-local search. The SearchAddon only provides
      // the buffer search engine, so we render the small find bar below.
      if (event.key.toLowerCase() === 'f') {
        const selectedText = normalizeSearchSelection(terminal.getSelection());
        if (selectedText) setSearchQuery(selectedText);
        setSearchOpen(true);
        window.setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 0);
        return false;
      }

      // Cmd+K — clear terminal scrollback (macOS Terminal / iTerm2 convention)
      if (event.metaKey && event.key.toLowerCase() === 'k') {
        terminal.clear();
        return false;
      }

      // Let all registered app-level shortcuts bubble up.
      // Everything else (readline Ctrl+U/K/W/A/E, etc.) passes through to the PTY.
      for (const combo of Object.values(shortcutsRef.current)) {
        if (eventMatchesCombo(event, combo)) return false;
      }

      return true;
    });

    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon?.dispose());
      terminal.loadAddon(webglAddon);
    } catch (error) {
      console.warn('WebGL terminal renderer unavailable:', error);
    }

    const FIT_DEBOUNCE_MS = 8;
    const PTY_RESIZE_DEBOUNCE_MS = 256;
    let fitTimer: ReturnType<typeof setTimeout> | null = null;
    let ptyResizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSentCols = terminal.cols;
    let lastSentRows = terminal.rows;
    let lastWidth = host.clientWidth;
    let lastHeight = host.clientHeight;

    const flushPtyResize = () => {
      ptyResizeTimer = null;
      if (!host.isConnected) return;
      if (terminal.cols === lastSentCols && terminal.rows === lastSentRows) return;
      lastSentCols = terminal.cols;
      lastSentRows = terminal.rows;
      window.forgepad.pty.resize(tab.ptyId, terminal.cols, terminal.rows);
    };

    const fitAndResize = (immediatePtyResize = false) => {
      if (!host.isConnected) return;
      fitAddon.fit();
      if (immediatePtyResize) {
        if (ptyResizeTimer) clearTimeout(ptyResizeTimer);
        flushPtyResize();
        return;
      }
      if (ptyResizeTimer) clearTimeout(ptyResizeTimer);
      ptyResizeTimer = setTimeout(flushPtyResize, PTY_RESIZE_DEBOUNCE_MS);
    };

    const resizeObserver = new ResizeObserver(() => {
      if (fitTimer) clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        fitTimer = null;
        if (!host.isConnected) return;
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        fitAndResize(false);
      }, FIT_DEBOUNCE_MS);
    });
    resizeObserver.observe(host);
    window.setTimeout(() => fitAndResize(true), 0);

    const dataDisposable = terminal.onData((data) => {
      // When the user types into an agent terminal, notify the store so it can
      // start a cancel-detection timer (handles ESC / Ctrl+C interrupts where
      // the Stop hook may not fire).
      writeUserInputToPty(data);
    });

    // Click-to-move-cursor: clicking on the prompt line sends arrow-key sequences.
    // Works for shell prompts and TUIs like Claude Code (Ink uses normal buffer).
    // Automatically skips alternate-screen apps (vim, htop, etc.).
    const cleanupClickToMove = setupClickToMoveCursor(
      terminal,
      (data) => window.forgepad.pty.write(tab.ptyId, data),
      () => fitAndResize(true),
    );

    const removeDataListener = window.forgepad.pty.onData(tab.ptyId, (data) => {
      terminal.write(data);

      LOCAL_URL_RE.lastIndex = 0;
      const matches = data.match(LOCAL_URL_RE);
      if (matches?.length) {
        const url = normalizeLocalPreviewUrl(stripTrailingUrlPunctuation(matches[matches.length - 1]));
        if (url && !detectedLocalUrlsRef.current.has(url)) {
          detectedLocalUrlsRef.current.add(url);
          useAppStore.getState().openBrowserPreview(url, workspace.id);
        }
      }

      if (tab.isAgent && !tab.sessionId && !sessionIdDetectedRef.current) {
        const sessionId = tryExtractSessionId(data);
        if (sessionId) {
          sessionIdDetectedRef.current = true;
          useAppStore.getState().updateTerminalSessionId(tab.id, sessionId);
        }
      }
    });
    const removeExitListener = window.forgepad.pty.onExit(tab.ptyId, (exitCode) => {
      terminal.writeln('');
      terminal.writeln(`[process exited with code ${exitCode}]`);
      useAppStore.getState().markPtyExited(tab.ptyId);
    });

    window.forgepad.pty
      .reattach(tab.ptyId)
      .then((result) => {
        if (result.replay) terminal.write(result.replay);
      })
      .catch((error) => {
        useAppStore
          .getState()
          .addToast('error', error instanceof Error ? error.message : `Could not reattach ${workspace.name}.`);
      });

    return () => {
      resizeObserver.disconnect();
      if (fitTimer) clearTimeout(fitTimer);
      if (ptyResizeTimer) clearTimeout(ptyResizeTimer);
      dataDisposable.dispose();
      searchResultsDisposable.dispose();
      filePathLinkDisposable.dispose();
      cleanupClickToMove();
      removeDataListener();
      removeExitListener();
      webglAddon?.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
    // NOTE: effectiveTerminalTheme is intentionally excluded — theme changes
    // are handled by the live-update effect below without recreating the
    // terminal instance (which would trigger an expensive 8MB history replay).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize, configuredFontFamily, tab.ptyId, workspace.name, tab.sessionId, tab.isAgent, tab.id, effectiveTerminalTheme]);

  // Live-update terminal theme when effective theme changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = TERMINAL_THEMES[effectiveTerminalTheme];
  }, [effectiveTerminalTheme]);

  useEffect(() => {
    if (!searchOpen) return;
    window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
  }, [searchOpen]);

  useEffect(() => {
    const search = searchRef.current;
    if (!search) return;

    const query = searchQuery.trim();
    if (!searchOpen || !query) {
      search.clearDecorations();
      setSearchResult({ resultIndex: -1, resultCount: 0 });
      return;
    }

    search.findNext(query, {
      incremental: true,
      decorations: {
        matchBackground: '#5f4b16',
        matchBorder: '#d8a657',
        matchOverviewRuler: '#d8a657',
        activeMatchBackground: '#0e8a6d',
        activeMatchBorder: '#67d5b5',
        activeMatchColorOverviewRuler: '#67d5b5',
      },
    });
  }, [searchOpen, searchQuery]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResult({ resultIndex: -1, resultCount: 0 });
    searchRef.current?.clearDecorations();
    window.getSelection()?.removeAllRanges();
    terminalRef.current?.focus();
  };

  const findNext = () => {
    const query = searchQuery.trim();
    if (!query) return;
    searchRef.current?.findNext(query, {
      decorations: {
        matchBackground: '#5f4b16',
        matchBorder: '#d8a657',
        matchOverviewRuler: '#d8a657',
        activeMatchBackground: '#0e8a6d',
        activeMatchBorder: '#67d5b5',
        activeMatchColorOverviewRuler: '#67d5b5',
      },
    });
  };

  const findPrevious = () => {
    const query = searchQuery.trim();
    if (!query) return;
    searchRef.current?.findPrevious(query, {
      decorations: {
        matchBackground: '#5f4b16',
        matchBorder: '#d8a657',
        matchOverviewRuler: '#d8a657',
        activeMatchBackground: '#0e8a6d',
        activeMatchBorder: '#67d5b5',
        activeMatchColorOverviewRuler: '#67d5b5',
      },
    });
  };

  const searchLabel = searchQuery.trim()
    ? searchResult.resultCount > 0 && searchResult.resultIndex >= 0
      ? `${searchResult.resultIndex + 1}/${searchResult.resultCount}`
      : '0/0'
    : '';
  const terminalBackground = TERMINAL_THEMES[effectiveTerminalTheme].background;

  return (
    <section
      className={clsx('terminal-panel', active && 'active')}
      aria-hidden={!active}
      data-tab-id={tab.id}
      style={{ '--terminal-background': terminalBackground } as CSSProperties}
    >
      <div className="terminal-host">
        <div ref={hostRef} className="terminal-fit-host" />
      </div>
      {searchOpen ? (
        <div className="floating-search-bar">
          <Search size={14} className="text-muted" />
          <input
            ref={searchInputRef}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={searchQuery}
            placeholder="Search terminal"
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeSearch();
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (event.shiftKey) findPrevious();
                else findNext();
              }
            }}
          />
          <span className="floating-search-count">{searchLabel}</span>
          <button type="button" title="Previous match" disabled={!searchQuery.trim()} onClick={findPrevious}>
            <ChevronUp size={14} />
          </button>
          <button type="button" title="Next match" disabled={!searchQuery.trim()} onClick={findNext}>
            <ChevronDown size={14} />
          </button>
          <button type="button" title="Close search" onClick={closeSearch}>
            <X size={14} />
          </button>
        </div>
      ) : null}
    </section>
  );
}
