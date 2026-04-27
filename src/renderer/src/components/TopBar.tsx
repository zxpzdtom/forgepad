import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  TerminalSquare,
} from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";

type DetectedIde = {
  id: string;
  label: string;
  command: string;
  appName?: string;
};

function IdeIcon({ ideId }: { ideId: string }) {
  const size = 15;
  switch (ideId) {
    case "zed":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 22h20L12 2z" fill="#007ACC" />
          <path d="M12 6L6 20h12L12 6z" fill="#0098FF" />
          <path d="M12 10L9 18h6L12 10z" fill="#fff" opacity="0.9" />
        </svg>
      );
    case "vscode":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M17.583 2.322l-4.93 4.614L7.124 2.865 2 5.567v12.866l5.124 2.702 5.529-4.071 4.93 4.614L22 19.238V4.762l-4.417-2.44z" fill="#0065A9" />
          <path d="M17.583 21.576l-4.93-4.614V6.936l4.93-4.614L22 4.762v14.476l-4.417 2.338z" fill="#007ACC" />
          <path d="M7.124 21.135L2 18.433V5.567l5.124-2.702v18.27z" fill="#1F9CF0" />
        </svg>
      );
    case "cursor":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="#000" />
          <path d="M8 6l8 6-8 6V6z" fill="#fff" />
        </svg>
      );
    case "windsurf":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#7C3AED" />
          <path d="M8 8l4 4-4 4M13 8l4 4-4 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return <Code2 size={size} />;
  }
}

type TopBarProps = {
  onOpenSearch: () => void;
};

export function TopBar({ onOpenSearch }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [ides, setIdes] = useState<DetectedIde[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaces = useAppStore((state) => state.workspaces);
  const addToast = useAppStore((state) => state.addToast);

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );

  useEffect(() => {
    if (!menuOpen) return undefined;
    window.forgepad.shell.detectIdes().then(setIdes).catch(() => setIdes([]));
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const runShellAction = async (
    label: string,
    action: (path: string) => Promise<void>,
  ) => {
    if (!activeWorkspace) return;
    setMenuOpen(false);
    try {
      await action(activeWorkspace.worktreePath);
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : `Failed to open ${label}.`,
      );
    }
  };

  return (
    <header className="app-topbar relative flex h-12 shrink-0 items-center border-b border-border bg-[#141414] px-3">
      <div className="flex items-center pl-[148px]">
        <button
          className="icon-button border-transparent"
          type="button"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          onClick={() => useAppStore.setState({ sidebarOpen: !sidebarOpen })}
        >
          {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
      </div>

      <button
        className="absolute left-1/2 flex h-8 w-[min(460px,40vw)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-[#1a1a1a] px-3 text-left text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-subtle hover:text-text"
        type="button"
        title="Search ForgePad"
        onClick={onOpenSearch}
      >
        <Search size={17} />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
          Search ForgePad
          {activeWorkspace ? ` - ${activeWorkspace.name}` : ""}
        </span>
        <kbd className="rounded border border-border bg-panel-2 px-1.5 py-0.5 text-[11px] text-subtle">⌘</kbd>
        <kbd className="rounded border border-border bg-panel-2 px-1.5 py-0.5 text-[11px] text-subtle">P</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2" ref={menuRef}>
        <div className="relative">
          <div className="flex overflow-hidden rounded-lg border border-border bg-[#1a1a1a]">
            <button
              className="flex h-8 max-w-[230px] items-center gap-2 px-2.5 text-sm text-text disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspace}
              title="Open workspace folder"
              onClick={() => runShellAction("folder", window.forgepad.shell.openPath)}
            >
              <span className="grid size-5 place-items-center rounded bg-[#2f72ff]/18 text-[#83b6ff]">
                <Folder size={13} />
              </span>
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {activeWorkspace
                  ? `/${activeWorkspace.name}`
                  : "Open with"}
              </span>
              <span className="font-semibold">Open</span>
            </button>
            <button
              className="grid h-8 w-8 place-items-center border-l border-border text-muted hover:text-text disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspace}
              title="Open with"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <ChevronDown size={15} />
            </button>
          </div>

          {menuOpen && activeWorkspace ? (
            <div className="absolute right-0 top-[calc(100%+7px)] z-50 grid min-w-[210px] gap-1 rounded-lg border border-border bg-panel-2 p-1.5 shadow-[0_18px_38px_rgba(0,0,0,0.38)]">
              <button
                className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-sm text-text hover:bg-panel-3"
                type="button"
                onClick={() =>
                  runShellAction("Finder", window.forgepad.shell.openPath)
                }
              >
                <span className="grid size-6 place-items-center rounded bg-[#2f72ff]/18 text-[#83b6ff]">
                  <Folder size={15} />
                </span>
                Finder
              </button>

              {ides.length > 0 && (
                <div className="grid gap-[2px] pl-2">
                  <div className="flex h-6 items-center gap-1.5 px-2 text-[11px] text-subtle">
                    <ChevronRight size={11} />
                    IDE
                  </div>
                  {ides.map((ide) => (
                    <button
                      key={ide.id}
                      className="flex h-8 items-center gap-2 rounded-md px-2.5 pl-5 text-left text-sm text-text hover:bg-panel-3"
                      type="button"
                      onClick={() =>
                        runShellAction(ide.label, (path) =>
                          window.forgepad.shell.openWithIde(path, ide.id),
                        )
                      }
                    >
                      <span className="grid size-5 place-items-center">
                        <IdeIcon ideId={ide.id} />
                      </span>
                      {ide.label}
                    </button>
                  ))}
                </div>
              )}

              {ides.length === 0 && (
                <button
                  className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-sm text-text hover:bg-panel-3"
                  type="button"
                  onClick={() =>
                    runShellAction("IDE", window.forgepad.shell.openInIde)
                  }
                >
                  <span className="grid size-6 place-items-center rounded bg-[#0ea5e9]/18 text-[#7dd3fc]">
                    <Code2 size={15} />
                  </span>
                  IDE
                </button>
              )}

              <button
                className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-sm text-text hover:bg-panel-3"
                type="button"
                onClick={() =>
                  runShellAction("Terminal", window.forgepad.shell.openInTerminal)
                }
              >
                <span className="grid size-6 place-items-center rounded bg-black text-[#d8dee9]">
                  <TerminalSquare size={15} />
                </span>
                Terminal
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
