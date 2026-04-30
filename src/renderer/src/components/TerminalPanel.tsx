import { useEffect, useMemo, useRef } from 'react';
import { useResolvedTheme } from '@renderer/App';
import { eventMatchesCombo } from '@renderer/lib/shortcut-utils';
import { useAppStore } from '@renderer/store/app-store';
import type { ShortcutCombo, Tab, Workspace } from '@shared/types';
import { DEFAULT_SHORTCUTS } from '@shared/types';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { ITheme } from '@xterm/xterm';
import { Terminal } from '@xterm/xterm';

/**
 * Convert a mouse event's pixel coordinates to terminal cell (col, row).
 *
 * Uses xterm.js internal _core._renderService.dimensions for accurate cell
 * sizing — more reliable than dividing container width by column count,
 * which can be off when the terminal has padding or fractional scaling.
 * (This is the same approach used by Superset/Warp.)
 */
function getTerminalCoordsFromEvent(
  terminal: Terminal,
  event: MouseEvent,
): { col: number; row: number } | null {
  const element = terminal.element;
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Access internal xterm.js dimensions for precise cell size.
  const dimensions = (
    terminal as unknown as {
      _core?: {
        _renderService?: {
          dimensions?: { css: { cell: { width: number; height: number } } };
        };
      };
    }
  )._core?._renderService?.dimensions;

  if (!dimensions?.css?.cell) return null;

  const { width: cellWidth, height: cellHeight } = dimensions.css.cell;
  if (cellWidth <= 0 || cellHeight <= 0) return null;

  const col = Math.max(0, Math.min(terminal.cols - 1, Math.floor(x / cellWidth)));
  const row = Math.max(0, Math.min(terminal.rows - 1, Math.floor(y / cellHeight)));

  return { col, row };
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
): () => void {
  const handleClick = (event: MouseEvent) => {
    // Skip alternate-screen apps (vim, less, htop…) — they handle mouse themselves.
    if (terminal.buffer.active !== terminal.buffer.normal) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (terminal.hasSelection()) return;

    const coords = getTerminalCoordsFromEvent(terminal, event);
    if (!coords) return;

    const buffer = terminal.buffer.active;
    // Reconcile viewport-relative cursor row with buffer-absolute click row.
    const clickBufferRow = coords.row + buffer.viewportY;
    if (clickBufferRow !== buffer.cursorY + buffer.viewportY) return;

    const delta = coords.col - buffer.cursorX;
    if (delta === 0) return;

    const arrow = delta > 0 ? '\x1b[C' : '\x1b[D';
    writeToPty(arrow.repeat(Math.abs(delta)));
  };

  terminal.element?.addEventListener('click', handleClick);
  return () => terminal.element?.removeEventListener('click', handleClick);
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

function tryExtractSessionId(data: string): string | null {
  for (const pattern of SESSION_ID_PATTERNS) {
    const match = data.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function TerminalPanel({ tab, workspace, active }: TerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const sessionIdDetectedRef = useRef(false);
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const appShortcuts = useMemo(() => ({ ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) }), [keyboardShortcuts]);
  const shortcutsRef = useRef<Record<string, ShortcutCombo>>(appShortcuts);
  shortcutsRef.current = appShortcuts;
  const fontSize = useAppStore((state) => state.settings.terminalFontSize);
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
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize,
      lineHeight: 1.18,
      scrollback: 8000,
      theme: TERMINAL_THEMES[effectiveTerminalTheme],
      allowProposedApi: false,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Let Cmd/Ctrl shortcuts bubble to the window so app-level
    // keybindings still work while the terminal is focused.
    // Uses the live shortcuts ref so user-customised bindings are respected
    // without needing to recreate the terminal instance.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      if (!event.metaKey && !event.ctrlKey) return true;

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

    const fitAndResize = () => {
      if (!host.isConnected) return;
      fitAddon.fit();
      window.forgepad.pty.resize(tab.ptyId, terminal.cols, terminal.rows);
    };
    const resizeObserver = new ResizeObserver(() => fitAndResize());
    resizeObserver.observe(host);
    window.setTimeout(fitAndResize, 0);

    const dataDisposable = terminal.onData((data) => window.forgepad.pty.write(tab.ptyId, data));

    // Click-to-move-cursor: clicking on the prompt line sends arrow-key sequences.
    // Works for shell prompts and TUIs like Claude Code (Ink uses normal buffer).
    // Automatically skips alternate-screen apps (vim, htop, etc.).
    const cleanupClickToMove = setupClickToMoveCursor(
      terminal,
      (data) => window.forgepad.pty.write(tab.ptyId, data),
    );

    const removeDataListener = window.forgepad.pty.onData(tab.ptyId, (data) => {
      terminal.write(data);
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
      dataDisposable.dispose();
      cleanupClickToMove();
      removeDataListener();
      removeExitListener();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // NOTE: effectiveTerminalTheme is intentionally excluded — theme changes
    // are handled by the live-update effect below without recreating the
    // terminal instance (which would trigger an expensive 8MB history replay).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize, tab.ptyId, workspace.name, tab.sessionId, tab.isAgent, tab.id, effectiveTerminalTheme]);

  // Live-update terminal theme when effective theme changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = TERMINAL_THEMES[effectiveTerminalTheme];
  }, [effectiveTerminalTheme]);

  return (
    <section className={`terminal-panel ${active ? 'active' : ''}`} aria-hidden={!active} data-tab-id={tab.id}>
      <div ref={hostRef} className="terminal-host" />
    </section>
  );
}
