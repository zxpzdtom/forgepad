import { type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@renderer/i18n';
import { comboToDisplay } from '@renderer/lib/shortcut-utils';
import { useAppStore } from '@renderer/store/app-store';
import { DEFAULT_SHORTCUTS, type Tab } from '@shared/types';
import {
  Check,
  ChevronDown,
  Code2,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Play,
  Search,
  Settings,
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

const FALLBACK_OPEN_WITH_LABELS: Record<string, string> = {
  cursor: 'Cursor',
  finder: 'Finder',
  ghostty: 'Ghostty',
  intellij: 'IntelliJ IDEA',
  iterm: 'iTerm',
  iterm2: 'iTerm',
  terminal: 'Terminal',
  vscode: 'VS Code',
  wezterm: 'WezTerm',
  windsurf: 'Windsurf',
  xcode: 'Xcode',
  zed: 'Zed',
};

type OpenWithOption = {
  id: string;
  label: string;
  icon: ReactNode;
};

const MAIN_IDE_OPTIONS: Array<Omit<OpenWithOption, 'icon'>> = [
  { id: 'zed', label: 'Zed' },
  { id: 'vscode', label: 'VS Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'windsurf', label: 'Windsurf' },
  { id: 'intellij', label: 'IntelliJ IDEA' },
];

const MAIN_TERMINAL_OPTIONS: Array<Omit<OpenWithOption, 'icon'>> = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'iterm', label: 'iTerm2' },
  { id: 'ghostty', label: 'Ghostty' },
];

function uniqueOpenWithOptions(options: OpenWithOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

/* ── Shared menu-item button ── */

function MenuItem({
  icon,
  label,
  selected,
  shortcut,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  selected: boolean;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={selected ? 'true' : undefined}
      className={clsx(
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-text transition-colors hover:bg-panel-3',
        selected && 'bg-panel-3/70',
      )}
      type="button"
      onClick={onClick}
    >
      <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && (
        <kbd
          className="shrink-0 rounded border border-border/70 bg-panel-3 px-1.5 py-0.5 font-medium text-[10px] text-subtle leading-none"
          aria-label="Command O"
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

/* ── TopBar ── */

type TopBarProps = {
  onOpenSearch: () => void;
};

/** IDE ids that map to a known category */
const IDE_IDS = new Set(['zed', 'vscode', 'cursor', 'windsurf', 'intellij', 'xcode']);
/** Terminal ids */
const TERMINAL_IDS = new Set(['terminal', 'iterm', 'iterm2', 'ghostty', 'wezterm']);

function fileTabOpenPath(tab: Extract<Tab, { type: 'file' }>, workspacePath: string) {
  if (tab.absPath) return tab.absPath;
  if (tab.externalUrl) return null;
  return `${workspacePath}/${tab.relPath}`;
}

export function TopBar({ onOpenSearch }: TopBarProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ides, setIdes] = useState<DetectedIde[]>([]);
  const [terminals, setTerminals] = useState<DetectedTerminal[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeFileTabId = useAppStore((state) => state.activeFileTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const tabs = useAppStore((state) => state.tabs);
  const projects = useAppStore((state) => state.projects);
  const defaultOpenWith = useAppStore((state) => state.settings.defaultOpenWith);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const addToast = useAppStore((state) => state.addToast);
  const settings = useAppStore((state) => state.settings);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const projectActiveRunIndex = useAppStore((state) => state.projectActiveRunIndex);
  const setProjectActiveRunIndex = useAppStore((state) => state.setProjectActiveRunIndex);
  const setSidebarOpen = useCallback(
    (open: boolean) => {
      useAppStore.setState({ sidebarOpen: open });
    },
    [],
  );
  const setRightPanelOpen = useCallback(
    (open: boolean) => {
      useAppStore.setState({ rightPanelOpen: open });
    },
    [],
  );

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeProject = activeWorkspace ? projects.find((p) => p.id === activeWorkspace.projectId) : undefined;
  const activeFileTab = tabs.find((tab) => tab.id === activeFileTabId && tab.type === 'file');

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

  // Main button icon: always the selected item's icon
  const selectedIcon = resolveIcon(defaultOpenWith, ICON_SIZE);
  const openWithShortcut = comboToDisplay(settings.keyboardShortcuts?.openWithDefault ?? DEFAULT_SHORTCUTS.openWithDefault);

  const ideOpenWithOptions = useMemo(() => {
    const detected = ides.map((ide) => ({
      id: ide.id,
      label: ide.label,
      icon: resolveIcon(ide.id, ICON_SIZE),
    }));
    const options = [
      ...MAIN_IDE_OPTIONS.map((option) => ({
        ...option,
        icon: resolveIcon(option.id, ICON_SIZE),
      })),
      ...detected,
    ];
    if (selectedIsIde && !options.some((option) => option.id === defaultOpenWith)) {
      options.unshift({
        id: defaultOpenWith,
        label: FALLBACK_OPEN_WITH_LABELS[defaultOpenWith] ?? defaultOpenWith,
        icon: resolveIcon(defaultOpenWith, ICON_SIZE),
      });
    }
    return uniqueOpenWithOptions(options);
  }, [defaultOpenWith, ides, selectedIsIde]);

  const terminalOpenWithOptions = useMemo(() => {
    const detected = terminals.map((terminal) => ({
      id: terminal.id,
      label: terminal.label,
      icon: resolveIcon(terminal.id, ICON_SIZE),
    }));
    const options = [
      ...MAIN_TERMINAL_OPTIONS.map((option) => ({
        ...option,
        icon: resolveIcon(option.id, ICON_SIZE),
      })),
      ...detected,
    ];
    if (selectedIsTerminal && !options.some((option) => option.id === defaultOpenWith)) {
      options.unshift({
        id: defaultOpenWith,
        label: FALLBACK_OPEN_WITH_LABELS[defaultOpenWith] ?? defaultOpenWith,
        icon: resolveIcon(defaultOpenWith, ICON_SIZE),
      });
    }
    return uniqueOpenWithOptions(options);
  }, [defaultOpenWith, selectedIsTerminal, terminals]);

  // Resolve action for selected option
  const resolveAction = useCallback((id: string): ((path: string, lineNumber?: number, projectPath?: string) => Promise<void>) | null => {
    if (id === 'finder') return window.forgepad.shell.openPath;
    if (TERMINAL_IDS.has(id)) return (path: string) => window.forgepad.shell.openWithTerminal(path, id);
    if (IDE_IDS.has(id)) {
      return (path: string, lineNumber?: number, projectPath?: string) =>
        window.forgepad.shell.openWithIde(path, id, lineNumber, projectPath);
    }
    // Legacy fallback
    if (id === 'terminal') return window.forgepad.shell.openInTerminal;
    return null;
  }, []);

  const handleOpen = async () => {
    if (!activeWorkspace) return;
    const action = resolveAction(defaultOpenWith);
    if (!action) return;
    const isIde = IDE_IDS.has(defaultOpenWith);
    const activeFilePath = isIde && activeFileTab ? fileTabOpenPath(activeFileTab, activeWorkspace.worktreePath) : null;
    const openPath = activeFilePath ?? activeWorkspace.worktreePath;
    const lineNumber = activeFilePath ? (activeFileTab?.targetLine ?? activeFileTab?.lastLine) : undefined;
    try {
      await action(openPath, lineNumber, isIde ? activeWorkspace.worktreePath : undefined);
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : t('topbar.failedToOpen'));
    }
  };

  const handleSelect = (id: string) => {
    updateSettings({ defaultOpenWith: id });
    setMenuOpen(false);
  };

  const handleTitlebarDoubleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, input, select, textarea, [role="button"], [role="menu"], [role="listbox"]')) {
      return;
    }
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    window.forgepad.app2.toggleMaximize?.();
  }, []);

  return (
    <header
      className="app-topbar relative flex h-12 shrink-0 select-none items-center border-border border-b bg-surface-toolbar px-3"
      onDoubleClick={handleTitlebarDoubleClick}
      onMouseDown={(event) => {
        if (event.detail > 1 && !(event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) {
          event.preventDefault();
          window.getSelection()?.removeAllRanges();
        }
      }}
    >
      <div className="flex items-center pl-[80px]">
        <Tooltip label={sidebarOpen ? t('topbar.collapseSidebar') : t('topbar.expandSidebar')} position="bottom">
          <button
            className="icon-button border-transparent"
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
        </Tooltip>
      </div>

      <button
        className="absolute left-1/2 flex h-8 w-[min(460px,40vw)] -translate-x-1/2 select-none items-center gap-2 rounded-lg border border-border bg-surface-search px-3 text-left text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-subtle hover:text-text"
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

      {/* ── Right toolbar: Run / Terminal / Panel / Open With ── */}
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

        <Tooltip label={rightPanelOpen ? t('topbar.closeSidePanel') : t('topbar.openSidePanel')} position="bottom">
          <button
            className="icon-button border-transparent"
            type="button"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
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
                minWidth: '236px',
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
              shortcut={defaultOpenWith === 'finder' ? openWithShortcut : undefined}
              onClick={() => handleSelect('finder')}
            />

            <div className="mx-2 my-1 border-border/60 border-t" />
            <div className="px-2 py-1 text-[11px] text-subtle">{t('topbar.ide')}</div>
            {ideOpenWithOptions.length > 0 ? (
              ideOpenWithOptions.map((item) => (
                <MenuItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  selected={defaultOpenWith === item.id}
                  shortcut={defaultOpenWith === item.id ? openWithShortcut : undefined}
                  onClick={() => handleSelect(item.id)}
                />
              ))
            ) : (
              <div className="px-2 py-1.5 text-[12px] text-subtle/60">{t('topbar.noneDetected')}</div>
            )}

            <div className="mx-2 my-1 border-border/60 border-t" />
            <div className="px-2 py-1 text-[11px] text-subtle">{t('topbar.terminal')}</div>
            {terminalOpenWithOptions.length > 0 ? (
              terminalOpenWithOptions.map((item) => (
                <MenuItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  selected={defaultOpenWith === item.id}
                  shortcut={defaultOpenWith === item.id ? openWithShortcut : undefined}
                  onClick={() => handleSelect(item.id)}
                />
              ))
            ) : (
              <div className="px-2 py-1.5 text-[12px] text-subtle/60">{t('topbar.noneDetected')}</div>
            )}
          </div>
        </div>

        <div className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

        <Tooltip label={t('settings.title')} position="bottom">
          <button
            className="icon-button border-transparent"
            type="button"
            onClick={() => useAppStore.setState({ settingsOpen: true })}
          >
            <Settings size={17} />
          </button>
        </Tooltip>
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
