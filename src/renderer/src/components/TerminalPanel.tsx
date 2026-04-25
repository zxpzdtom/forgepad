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

export function TerminalPanel({ tab, workspace, active }: TerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
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
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
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
    const removeDataListener = window.forgepad.pty.onData(tab.ptyId, (data) => terminal.write(data));
    const removeExitListener = window.forgepad.pty.onExit(tab.ptyId, (exitCode) => {
      terminal.writeln("");
      terminal.writeln(`[process exited with code ${exitCode}]`);
    });

    window.forgepad.pty
      .reattach(tab.ptyId)
      .then((result) => {
        if (result.replay) terminal.write(result.replay);
      })
      .catch((error) => {
        useAppStore
          .getState()
          .addToast("error", error instanceof Error ? error.message : `Could not reattach ${workspace.name}.`);
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
