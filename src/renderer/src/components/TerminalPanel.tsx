import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ITheme } from "@xterm/xterm";
import type { Tab, Workspace } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";
import { useResolvedTheme } from "@renderer/App";

const TERMINAL_THEMES: Record<"dark" | "light", ITheme> = {
  dark: {
    background: "#0d0f13",
    foreground: "#d8dee9",
    cursor: "#67d5b5",
    cursorAccent: "#0d0f13",
    selectionBackground: "#31545b",
    selectionForeground: "#d8dee9",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  light: {
    background: "#f8f9fa",
    foreground: "#1e293b",
    cursor: "#0e8a6d",
    cursorAccent: "#f8f9fa",
    selectionBackground: "#bae6fd",
    selectionForeground: "#1e293b",
    black: "#1e293b",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#b45309",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#e2e8f0",
    brightBlack: "#64748b",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#d97706",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#f8fafc",
  },
};

type TerminalTab = Extract<Tab, { type: "terminal" }>;

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
  const fontSize = useAppStore((state) => state.settings.terminalFontSize);
  const resolvedTheme = useResolvedTheme();

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
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize,
      lineHeight: 1.18,
      scrollback: 8000,
      theme: TERMINAL_THEMES[resolvedTheme],
      allowProposedApi: false,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Let Cmd/Ctrl shortcuts bubble to the window so app-level
    // keybindings (Cmd+J, Cmd+P, Cmd+T, etc.) still work while
    // the terminal is focused.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      if (!event.metaKey && !event.ctrlKey) return true;

      const key = event.key.toLowerCase();

      // Intercept only the app-level shortcuts that need to bubble up.
      // Everything else (readline shortcuts like Ctrl+U/K/W/A/E, etc.) passes
      // through to the PTY.
      if (event.ctrlKey && key === "tab") return false; // cycle tabs
      if (key === "p" && !event.shiftKey && !event.altKey) return false; // quick search
      if (key === "t") return false; // new terminal
      if (key === "w") return false; // close tab
      if (key === "j") return false; // toggle terminal panel
      if (event.shiftKey && (key === "e" || key === "g" || key === "c"))
        return false; // panel switchers
      if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(key))
        return false; // tab/workspace switch

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

    const dataDisposable = terminal.onData((data) =>
      window.forgepad.pty.write(tab.ptyId, data),
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
    const removeExitListener = window.forgepad.pty.onExit(
      tab.ptyId,
      (exitCode) => {
        terminal.writeln("");
        terminal.writeln(`[process exited with code ${exitCode}]`);
        const store = useAppStore.getState();
        store.markPtyExited(tab.ptyId);
      },
    );

    window.forgepad.pty
      .reattach(tab.ptyId)
      .then((result) => {
        if (result.replay) terminal.write(result.replay);
      })
      .catch((error) => {
        useAppStore
          .getState()
          .addToast(
            "error",
            error instanceof Error
              ? error.message
              : `Could not reattach ${workspace.name}.`,
          );
      });

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      removeDataListener();
      removeExitListener();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [fontSize, tab.ptyId, workspace.name, resolvedTheme]);

  // Live-update terminal theme when resolved theme changes
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = TERMINAL_THEMES[resolvedTheme];
  }, [resolvedTheme]);

  return (
    <section
      className={`terminal-panel ${active ? "active" : ""}`}
      aria-hidden={!active}
      data-tab-id={tab.id}
    >
      <div ref={hostRef} className="terminal-host" />
    </section>
  );
}
