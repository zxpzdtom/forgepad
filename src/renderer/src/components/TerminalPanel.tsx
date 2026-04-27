import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { Tab, Workspace } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";

type TerminalTab = Extract<Tab, { type: "terminal" }>;

type TerminalPanelProps = {
  tab: TerminalTab;
  workspace: Workspace;
  active: boolean;
};

const SESSION_ID_PATTERNS = [
  /session\s*(?:id)?[:\s]+([a-f0-9-]{36})/i,
  /resuming\s+(?:conversation|session)\s+([a-f0-9-]{36})/i,
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
      theme: {
        background: "#0d0f13",
        foreground: "#d8dee9",
        cursor: "#67d5b5",
        selectionBackground: "#31545b",
      },
      allowProposedApi: false,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Let Cmd/Ctrl shortcuts bubble to the window so app-level
    // keybindings (Cmd+J, Cmd+P, Cmd+T, etc.) still work while
    // the terminal is focused.
    terminal.attachCustomKeyEventHandler((event) => {
      if ((event.metaKey || event.ctrlKey) && event.type === "keydown") {
        // Allow copy / paste / select-all to stay inside xterm
        const key = event.key.toLowerCase();
        if (key === "c" || key === "v" || key === "a") return true;
        return false;
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
  }, [fontSize, tab.ptyId, workspace.name]);

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
