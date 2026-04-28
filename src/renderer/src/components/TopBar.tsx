import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  TerminalSquare,
} from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";
import { ideIcon, appIcon } from "./AgentIcons";

/* ── Types ── */

type DetectedIde = {
  id: string;
  label: string;
  command: string;
  appName?: string;
};

type DetectedTerminal = {
  id: string;
  label: string;
  appName: string;
};

const ICON_SIZE = 16;

function resolveIcon(id: string, size: number): ReactNode {
  return ideIcon(id, size) ?? appIcon(id, size) ?? <Code2 size={size} />;
}

/* ── Shared menu-item button ── */

function MenuItem({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-text transition-colors hover:bg-panel-3${selected ? " bg-panel-3/60" : ""}`}
      type="button"
      onClick={onClick}
    >
      <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
      <span className="grid size-4 shrink-0 place-items-center text-accent">
        {selected && <Check size={13} />}
      </span>
    </button>
  );
}

/* ── Submenu (shared for IDE / Terminal) ── */

function Submenu({
  parentLabel,
  parentIcon,
  items,
  selectedId,
  onSelect,
  anchorName,
}: {
  parentLabel: string;
  parentIcon: ReactNode;
  items: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  anchorName: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleEnter = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const isChildSelected =
    selectedId !== null && items.some((i) => i.id === selectedId);

  return (
    <div onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {/* Parent row */}
      <div
        className={`flex h-8 w-full cursor-default items-center gap-2.5 rounded-md px-2 text-[13px] text-text transition-colors hover:bg-panel-3${isChildSelected ? " bg-panel-3/60" : ""}`}
        style={{ anchorName } as CSSProperties}
      >
        <span className="grid size-4 shrink-0 place-items-center">
          {parentIcon}
        </span>
        <span className="min-w-0 flex-1">{parentLabel}</span>
        <span className="grid size-4 shrink-0 place-items-center text-accent">
          {isChildSelected && <Check size={13} />}
        </span>
        <ChevronRight size={13} className="shrink-0 text-subtle" />
      </div>

      {/* Submenu popover */}
      <div
        className="anchor-submenu"
        style={
          {
            positionAnchor: anchorName,
            top: "anchor(top)",
            left: "anchor(right)",
            marginLeft: "4px",
            positionTryFallbacks: "flip-inline",
          } as CSSProperties
        }
        hidden={!open}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {items.length > 0 ? (
          items.map((item) => (
            <MenuItem
              key={item.id}
              icon={resolveIcon(item.id, ICON_SIZE)}
              label={item.label}
              selected={item.id === selectedId}
              onClick={() => onSelect(item.id)}
            />
          ))
        ) : (
          <div className="px-3 py-2 text-xs text-subtle">None detected</div>
        )}
      </div>
    </div>
  );
}

/* ── TopBar ── */

type TopBarProps = {
  onOpenSearch: () => void;
};

/** IDE ids that map to a known category */
const IDE_IDS = new Set(["zed", "vscode", "cursor", "windsurf", "intellij"]);
/** Terminal ids */
const TERMINAL_IDS = new Set(["terminal", "iterm", "iterm2", "ghostty"]);

export function TopBar({ onOpenSearch }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [ides, setIdes] = useState<DetectedIde[]>([]);
  const [terminals, setTerminals] = useState<DetectedTerminal[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaces = useAppStore((state) => state.workspaces);
  const defaultOpenWith = useAppStore(
    (state) => state.settings.defaultOpenWith,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const addToast = useAppStore((state) => state.addToast);

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );

  // Detect IDEs + terminals on mount and when menu opens
  useEffect(() => {
    window.forgepad.shell
      .detectIdes()
      .then(setIdes)
      .catch(() => setIdes([]));
    window.forgepad.shell
      .detectTerminals()
      .then(setTerminals)
      .catch(() => setTerminals([]));
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    window.forgepad.shell
      .detectIdes()
      .then(setIdes)
      .catch(() => setIdes([]));
    window.forgepad.shell
      .detectTerminals()
      .then(setTerminals)
      .catch(() => setTerminals([]));
  }, [menuOpen]);

  // Click-outside + Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

  // Determine which category the current selection belongs to
  const selectedIsIde = IDE_IDS.has(defaultOpenWith);
  const selectedIsTerminal = TERMINAL_IDS.has(defaultOpenWith);

  // Resolve the icon for the selected IDE / Terminal within the submenu parent row
  const ideParentIcon = selectedIsIde
    ? resolveIcon(defaultOpenWith, ICON_SIZE)
    : resolveIcon("vscode", ICON_SIZE); // default icon: VSCode
  const terminalParentIcon = selectedIsTerminal
    ? resolveIcon(defaultOpenWith, ICON_SIZE)
    : resolveIcon("terminal", ICON_SIZE); // default icon: Terminal.app

  // Main button icon: always the selected item's icon
  const selectedIcon = resolveIcon(defaultOpenWith, ICON_SIZE);

  // Resolve action for selected option
  const resolveAction = useCallback(
    (id: string): ((path: string) => Promise<void>) | null => {
      if (id === "finder") return window.forgepad.shell.openPath;
      if (TERMINAL_IDS.has(id))
        return (path: string) =>
          window.forgepad.shell.openWithTerminal(path, id);
      if (IDE_IDS.has(id))
        return (path: string) => window.forgepad.shell.openWithIde(path, id);
      // Legacy fallback
      if (id === "terminal") return window.forgepad.shell.openInTerminal;
      return null;
    },
    [],
  );

  const handleOpen = async () => {
    if (!activeWorkspace) return;
    const action = resolveAction(defaultOpenWith);
    if (!action) return;
    try {
      await action(activeWorkspace.worktreePath);
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : "Failed to open.",
      );
    }
  };

  const handleSelect = (id: string) => {
    updateSettings({ defaultOpenWith: id });
    setMenuOpen(false);
  };

  return (
    <header className="app-topbar relative flex h-12 shrink-0 items-center border-b border-border bg-surface-toolbar px-3">
      <div className="flex items-center pl-[80px]">
        <button
          className="icon-button border-transparent"
          type="button"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          onClick={() => useAppStore.setState({ sidebarOpen: !sidebarOpen })}
        >
          {sidebarOpen ? (
            <PanelLeftClose size={17} />
          ) : (
            <PanelLeftOpen size={17} />
          )}
        </button>
      </div>

      <button
        className="absolute left-1/2 flex h-8 w-[min(460px,40vw)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-surface-search px-3 text-left text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-subtle hover:text-text"
        type="button"
        title="Search ForgePad"
        onClick={onOpenSearch}
      >
        <Search size={17} />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
          Search ForgePad
          {activeWorkspace ? ` - ${activeWorkspace.name}` : ""}
        </span>
        <kbd className="grid size-[20px] place-items-center rounded border border-border bg-panel-2 text-[11px] leading-none text-subtle">
          ⌘
        </kbd>
        <kbd className="grid size-[20px] place-items-center rounded border border-border bg-panel-2 text-[11px] leading-none text-subtle">
          P
        </kbd>
      </button>

      {/* ── Open-with split button + dropdown ── */}
      <div className="ml-auto flex items-center gap-2" ref={menuRef}>
        <button
          className="icon-button border-transparent"
          type="button"
          title={rightPanelOpen ? "Close side panel" : "Open side panel"}
          onClick={() =>
            useAppStore.setState({ rightPanelOpen: !rightPanelOpen })
          }
        >
          {rightPanelOpen ? (
            <PanelRightClose size={17} />
          ) : (
            <PanelRightOpen size={17} />
          )}
        </button>
        <div className="relative">
          <div className="flex overflow-hidden rounded-lg border border-border bg-surface-search">
            {/* Left: execute default action */}
            <button
              className="flex h-8 items-center gap-2 px-2.5 text-sm text-text disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspace}
              title={`Open with ${defaultOpenWith}`}
              onClick={handleOpen}
            >
              <span className="grid size-4 place-items-center">
                {selectedIcon}
              </span>
              <span className="font-semibold">Open</span>
            </button>

            {/* Right: chevron trigger (anchor for dropdown) */}
            <button
              className="grid h-8 w-8 place-items-center border-l border-border text-muted hover:text-text disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspace}
              title="Default open with"
              onClick={() => setMenuOpen((v) => !v)}
              style={{ anchorName: "--open-with-trigger" } as CSSProperties}
            >
              <ChevronDown size={15} />
            </button>
          </div>

          {/* ── Dropdown menu (anchor-positioned) ── */}
          <div
            className="anchor-menu"
            style={
              {
                positionAnchor: "--open-with-trigger",
                top: "anchor(bottom)",
                right: "anchor(right)",
                marginTop: "7px",
                positionTryFallbacks: "flip-block",
              } as CSSProperties
            }
            hidden={!menuOpen || !activeWorkspace}
          >
            <div className="px-2 py-1.5 text-[11px] text-subtle">
              Default open with
            </div>

            {/* Finder */}
            <MenuItem
              icon={appIcon("finder", ICON_SIZE) ?? <Folder size={ICON_SIZE} />}
              label="Finder"
              selected={defaultOpenWith === "finder"}
              onClick={() => handleSelect("finder")}
            />

            {/* IDE submenu */}
            <Submenu
              parentLabel="IDE"
              parentIcon={ideParentIcon}
              items={ides}
              selectedId={selectedIsIde ? defaultOpenWith : null}
              onSelect={handleSelect}
              anchorName="--ide-submenu-anchor"
            />

            {/* Terminal submenu */}
            <Submenu
              parentLabel="Terminal"
              parentIcon={terminalParentIcon}
              items={terminals}
              selectedId={selectedIsTerminal ? defaultOpenWith : null}
              onSelect={handleSelect}
              anchorName="--terminal-submenu-anchor"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
