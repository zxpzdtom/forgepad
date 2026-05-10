import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/app-store';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Folder,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Play,
  Search,
  TerminalSquare,
} from 'lucide-react';

import { appIcon, ideIcon } from './AgentIcons';
import { RunSetupDialog } from './RunSetupDialog';
import { Tooltip } from './Tooltip';

import clsx from 'clsx';

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
      className={clsx(
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-text transition-colors hover:bg-panel-3',
        selected && 'bg-panel-3/60',
      )}
      type="button"
      onClick={onClick}
    >
      <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
      <span className="grid size-4 shrink-0 place-items-center text-accent">{selected && <Check size={13} />}</span>
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
  const { t } = useTranslation();
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

  const isChildSelected = selectedId !== null && items.some((i) => i.id === selectedId);

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {/* Parent row */}
      <div
        className={clsx(
          'flex h-8 w-full cursor-default items-center gap-2.5 rounded-md px-2 text-[13px] text-text transition-colors hover:bg-panel-3',
          isChildSelected && 'bg-panel-3/60',
        )}
        style={{ anchorName } as CSSProperties}
      >
        <span className="grid size-4 shrink-0 place-items-center">{parentIcon}</span>
        <span className="min-w-0 flex-1">{parentLabel}</span>
        <span className="grid size-4 shrink-0 place-items-center text-accent">{isChildSelected && <Check size={13} />}</span>
        <ChevronRight size={13} className="shrink-0 text-subtle" />
      </div>

      {/* Submenu popover */}
      <div
        className="anchor-submenu"
        style={
          {
            positionAnchor: anchorName,
            top: 'anchor(top)',
            left: 'anchor(right)',
            marginLeft: '4px',
            positionTryFallbacks: 'flip-inline',
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
          <div className="px-3 py-2 text-subtle text-xs">{t('topbar.noneDetected')}</div>
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
const IDE_IDS = new Set(['zed', 'vscode', 'cursor', 'windsurf', 'intellij']);
/** Terminal ids */
const TERMINAL_IDS = new Set(['terminal', 'iterm', 'iterm2', 'ghostty']);

export function TopBar({ onOpenSearch }: TopBarProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ides, setIdes] = useState<DetectedIde[]>([]);
  const [terminals, setTerminals] = useState<DetectedTerminal[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaces = useAppStore((state) => state.workspaces);
  const projects = useAppStore((state) => state.projects);
  const defaultOpenWith = useAppStore((state) => state.settings.defaultOpenWith);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const addToast = useAppStore((state) => state.addToast);
  const settings = useAppStore((state) => state.settings);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const createBrowserTab = useAppStore((state) => state.createBrowserTab);
  const projectActiveRunIndex = useAppStore((state) => state.projectActiveRunIndex);
  const setProjectActiveRunIndex = useAppStore((state) => state.setProjectActiveRunIndex);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeProject = activeWorkspace ? projects.find((p) => p.id === activeWorkspace.projectId) : undefined;

  // ── Run button state ──
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const [runFocusIndex, setRunFocusIndex] = useState(-1);
  const [runSetupOpen, setRunSetupOpen] = useState(false);
  const [pkgScripts, setPkgScripts] = useState<{ name: string; command: string }[]>([]);
  const runMenuRef = useRef<HTMLDivElement>(null);

  const runCommands = activeProject?.runCommands ?? [];
  const activeRunIndex = activeProject ? (projectActiveRunIndex[activeProject.id] ?? 0) : 0;
  const setActiveRunIndex = useCallback(
    (index: number) => {
      if (activeProject) setProjectActiveRunIndex(activeProject.id, index);
    },
    [activeProject, setProjectActiveRunIndex],
  );

  const clampedRunIndex = Math.min(activeRunIndex, runCommands.length - 1);
  const activeRunEntry = runCommands.length > 0 ? runCommands[Math.max(0, clampedRunIndex)] : undefined;
  const runMenuEntries = runCommands;
  const runTotalItems = runMenuEntries.length + 1;

  const runLabel = activeRunEntry
    ? activeRunEntry.name.length > 18
      ? `${activeRunEntry.name.slice(0, 18)}…`
      : activeRunEntry.name
    : t('agent.runCommand');

  // Detect package.json scripts
  useEffect(() => {
    if (!activeWorkspace) {
      setPkgScripts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await window.forgepad.fs.readFile(activeWorkspace.worktreePath, 'package.json');
        const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
        if (!cancelled && pkg.scripts) {
          let pm = 'npm run';
          try {
            await window.forgepad.fs.readFile(activeWorkspace.worktreePath, 'bun.lockb');
            pm = 'bun run';
          } catch {
            try {
              await window.forgepad.fs.readFile(activeWorkspace.worktreePath, 'bun.lock');
              pm = 'bun run';
            } catch {
              try {
                await window.forgepad.fs.readFile(activeWorkspace.worktreePath, 'pnpm-lock.yaml');
                pm = 'pnpm run';
              } catch {
                try {
                  await window.forgepad.fs.readFile(activeWorkspace.worktreePath, 'yarn.lock');
                  pm = 'yarn';
                } catch {
                  /* default npm */
                }
              }
            }
          }
          setPkgScripts(
            Object.entries(pkg.scripts).map(([name]) => ({
              name,
              command: `${pm} ${name}`,
            })),
          );
        }
      } catch {
        if (!cancelled) setPkgScripts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace]);

  // Run menu outside click
  useEffect(() => {
    if (!runMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (runMenuRef.current && !runMenuRef.current.contains(e.target as Node)) setRunMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [runMenuOpen]);

  // Run menu keyboard navigation
  const handleRunKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!runMenuOpen) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setRunFocusIndex((i) => (i + 1) % runTotalItems);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setRunFocusIndex((i) => (i - 1 + runTotalItems) % runTotalItems);
          break;
        case 'Enter':
          e.preventDefault();
          if (runFocusIndex >= 0 && runFocusIndex < runMenuEntries.length) {
            setActiveRunIndex(runFocusIndex);
            setRunMenuOpen(false);
          } else if (runFocusIndex === runMenuEntries.length) {
            setRunMenuOpen(false);
            setRunSetupOpen(true);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setRunMenuOpen(false);
          break;
      }
    },
    [activeWorkspaceId, runFocusIndex, runMenuEntries, runMenuOpen, runTotalItems],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleRunKeyDown);
    return () => document.removeEventListener('keydown', handleRunKeyDown);
  }, [handleRunKeyDown]);

  useEffect(() => {
    if (!runMenuOpen) setRunFocusIndex(-1);
  }, [runMenuOpen]);

  const handleRun = () => {
    if (activeRunEntry) {
      void createTerminal(activeWorkspaceId ?? undefined, activeRunEntry.command);
    } else {
      setRunSetupOpen(true);
    }
  };

  const setProjectRunCommands = useAppStore((state) => state.setProjectRunCommands);
  const handleRunSetupSave = (commands: { name: string; command: string }[]) => {
    if (activeProject) {
      setProjectRunCommands(activeProject.id, commands);
    }
    setRunSetupOpen(false);
  };

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
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Determine which category the current selection belongs to
  const selectedIsIde = IDE_IDS.has(defaultOpenWith);
  const selectedIsTerminal = TERMINAL_IDS.has(defaultOpenWith);

  // Resolve the icon for the selected IDE / Terminal within the submenu parent row
  const ideParentIcon = selectedIsIde ? resolveIcon(defaultOpenWith, ICON_SIZE) : resolveIcon('vscode', ICON_SIZE); // default icon: VSCode
  const terminalParentIcon = selectedIsTerminal ? resolveIcon(defaultOpenWith, ICON_SIZE) : resolveIcon('terminal', ICON_SIZE); // default icon: Terminal.app

  // Main button icon: always the selected item's icon
  const selectedIcon = resolveIcon(defaultOpenWith, ICON_SIZE);

  // Resolve action for selected option
  const resolveAction = useCallback((id: string): ((path: string) => Promise<void>) | null => {
    if (id === 'finder') return window.forgepad.shell.openPath;
    if (TERMINAL_IDS.has(id)) return (path: string) => window.forgepad.shell.openWithTerminal(path, id);
    if (IDE_IDS.has(id)) return (path: string) => window.forgepad.shell.openWithIde(path, id);
    // Legacy fallback
    if (id === 'terminal') return window.forgepad.shell.openInTerminal;
    return null;
  }, []);

  const handleOpen = async () => {
    if (!activeWorkspace) return;
    const action = resolveAction(defaultOpenWith);
    if (!action) return;
    try {
      await action(activeWorkspace.worktreePath);
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : t('topbar.failedToOpen'));
    }
  };

  const handleSelect = (id: string) => {
    updateSettings({ defaultOpenWith: id });
    setMenuOpen(false);
  };

  return (
    <header
      className="app-topbar relative flex h-12 shrink-0 items-center border-border border-b bg-surface-toolbar px-3"
      data-tauri-drag-region
    >
      <div className="flex items-center pl-[80px]">
        <Tooltip label={sidebarOpen ? t('topbar.collapseSidebar') : t('topbar.expandSidebar')} position="bottom">
          <button
            className="icon-button border-transparent"
            type="button"
            onClick={() => useAppStore.setState({ sidebarOpen: !sidebarOpen })}
          >
            {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
        </Tooltip>
      </div>

      <button
        className="absolute left-1/2 flex h-8 w-[min(460px,40vw)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-surface-search px-3 text-left text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-subtle hover:text-text"
        type="button"
        title={t('topbar.searchForgePad')}
        onClick={onOpenSearch}
      >
        <Search size={17} />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
          {t('topbar.searchForgePad')}
          {activeWorkspace ? ` - ${activeWorkspace.name}` : ''}
        </span>
        <kbd className="grid size-[20px] place-items-center rounded border border-border bg-panel-2 text-[11px] text-subtle leading-none">
          ⌘
        </kbd>
        <kbd className="grid size-[20px] place-items-center rounded border border-border bg-panel-2 text-[11px] text-subtle leading-none">
          P
        </kbd>
      </button>

      {/* ── Right toolbar: Run / Terminal / Browser / Panel / Open With ── */}
      <div className="ml-auto flex items-center gap-2" ref={menuRef}>
        {/* ── Run split button ── */}
        <div className="relative" ref={runMenuRef}>
          <div className="flex overflow-hidden rounded-lg border border-border bg-surface-search">
            <button
              className="flex h-8 items-center gap-1.5 px-2.5 text-[13px] text-text transition-colors hover:bg-panel-3 disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspaceId}
              title={
                activeRunEntry
                  ? t('agent.runCommandDetail', {
                      name: activeRunEntry.name,
                      command: activeRunEntry.command,
                    })
                  : t('agent.configureRun')
              }
              onClick={handleRun}
            >
              <Play size={14} className="text-ok" />
              <span className="max-w-[120px] truncate font-[510]">{runLabel}</span>
            </button>
            <button
              className="grid h-8 w-7 place-items-center border-border border-l text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspaceId}
              title={t('agent.defaultRunCommand')}
              onClick={() => setRunMenuOpen((v) => !v)}
              style={{ anchorName: '--topbar-run-trigger' } as CSSProperties}
            >
              <ChevronDown size={13} />
            </button>
          </div>

          {/* Run dropdown menu */}
          <div
            className="anchor-menu"
            style={
              {
                positionAnchor: '--topbar-run-trigger',
                top: 'anchor(bottom)',
                right: 'anchor(right)',
                marginTop: '7px',
                positionTryFallbacks: 'flip-block',
              } as CSSProperties
            }
            hidden={!runMenuOpen || !activeWorkspaceId}
            role="listbox"
          >
            <div className="px-2 py-1.5 text-[11px] text-subtle">{t('agent.runCommands')}</div>

            {runMenuEntries.length === 0 && (
              <div className="px-2 py-2 text-center text-[12px] text-subtle/60">{t('agent.noCommandsYet')}</div>
            )}

            {runMenuEntries.map((entry, i) => {
              const focused = runFocusIndex === i;
              const selected = i === Math.max(0, clampedRunIndex);
              return (
                <button
                  key={entry.command}
                  className={clsx(
                    'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-text transition-colors hover:bg-panel-3',
                    focused && 'bg-panel-3',
                  )}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  title={entry.command}
                  onClick={() => {
                    setActiveRunIndex(i);
                    setRunMenuOpen(false);
                  }}
                  onMouseEnter={() => setRunFocusIndex(i)}
                  onMouseLeave={() => setRunFocusIndex(-1)}
                >
                  <span className="grid size-4 shrink-0 place-items-center">
                    {selected ? <Check size={14} className="text-ok" /> : <Play size={14} className="text-muted" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                </button>
              );
            })}

            {runMenuEntries.length > 0 && <div className="mx-2 my-1 border-border/60 border-t" />}

            <button
              className={clsx(
                'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-text transition-colors hover:bg-panel-3',
                runFocusIndex === runMenuEntries.length && 'bg-panel-3',
              )}
              type="button"
              onClick={() => {
                setRunMenuOpen(false);
                setRunSetupOpen(true);
              }}
              onMouseEnter={() => setRunFocusIndex(runMenuEntries.length)}
              onMouseLeave={() => setRunFocusIndex(-1)}
            >
              <span className="grid size-4 shrink-0 place-items-center">
                <Pencil size={13} className="text-muted" />
              </span>
              <span className="min-w-0 flex-1">{t('agent.editCommands')}</span>
            </button>
          </div>
        </div>

        {/* ── Terminal button ── */}
        <Tooltip label={t('agent.newTerminal')} position="bottom">
          <button
            className="icon-button border-transparent"
            type="button"
            disabled={!activeWorkspaceId}
            onClick={() => void createTerminal(activeWorkspaceId ?? undefined)}
          >
            <TerminalSquare size={17} />
          </button>
        </Tooltip>

        {/* ── Browser button ── */}
        <Tooltip label={t('tabBar.openBrowser')} position="bottom">
          <button
            className="icon-button border-transparent"
            type="button"
            disabled={!activeWorkspaceId}
            onClick={() => createBrowserTab()}
          >
            <Globe size={17} />
          </button>
        </Tooltip>

        <Tooltip label={rightPanelOpen ? t('topbar.closeSidePanel') : t('topbar.openSidePanel')} position="bottom">
          <button
            className="icon-button border-transparent"
            type="button"
            onClick={() => useAppStore.setState({ rightPanelOpen: !rightPanelOpen })}
          >
            {rightPanelOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </button>
        </Tooltip>

        {/* ── Open-with split button + dropdown ── */}
        <div className="relative">
          <div className="flex overflow-hidden rounded-lg border border-border bg-surface-search">
            {/* Left: execute default action */}
            <button
              className="flex h-8 items-center gap-2 px-2.5 text-sm text-text disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspace}
              title={t('topbar.openWith', { tool: defaultOpenWith })}
              onClick={handleOpen}
            >
              <span className="grid size-4 place-items-center">{selectedIcon}</span>
              <span className="font-[590]">{t('common.open')}</span>
            </button>

            {/* Right: chevron trigger (anchor for dropdown) */}
            <button
              className="grid h-8 w-8 place-items-center border-border border-l text-muted hover:text-text disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspace}
              title={t('topbar.defaultOpenWith')}
              onClick={() => setMenuOpen((v) => !v)}
              style={{ anchorName: '--open-with-trigger' } as CSSProperties}
            >
              <ChevronDown size={15} />
            </button>
          </div>

          {/* ── Dropdown menu (anchor-positioned) ── */}
          <div
            className="anchor-menu"
            style={
              {
                positionAnchor: '--open-with-trigger',
                top: 'anchor(bottom)',
                right: 'anchor(right)',
                marginTop: '7px',
                positionTryFallbacks: 'flip-block',
              } as CSSProperties
            }
            hidden={!menuOpen || !activeWorkspace}
          >
            <div className="px-2 py-1.5 text-[11px] text-subtle">{t('topbar.defaultOpenWith')}</div>

            {/* Finder */}
            <MenuItem
              icon={appIcon('finder', ICON_SIZE) ?? <Folder size={ICON_SIZE} />}
              label={t('topbar.finder')}
              selected={defaultOpenWith === 'finder'}
              onClick={() => handleSelect('finder')}
            />

            {/* IDE submenu */}
            <Submenu
              parentLabel={t('topbar.ide')}
              parentIcon={ideParentIcon}
              items={ides}
              selectedId={selectedIsIde ? defaultOpenWith : null}
              onSelect={handleSelect}
              anchorName="--ide-submenu-anchor"
            />

            {/* Terminal submenu */}
            <Submenu
              parentLabel={t('topbar.terminal')}
              parentIcon={terminalParentIcon}
              items={terminals}
              selectedId={selectedIsTerminal ? defaultOpenWith : null}
              onSelect={handleSelect}
              anchorName="--terminal-submenu-anchor"
            />
          </div>
        </div>
      </div>

      {runSetupOpen && (
        <RunSetupDialog
          initialCommands={activeProject?.runCommands}
          pkgScripts={pkgScripts}
          onSave={handleRunSetupSave}
          onClose={() => setRunSetupOpen(false)}
        />
      )}
    </header>
  );
}
