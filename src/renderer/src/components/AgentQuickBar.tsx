import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/app-store';
import type { AgentPreset } from '@shared/types';
import { Bot, Check, ChevronDown, Pencil, Play, TerminalSquare } from 'lucide-react';

import { agentPresetIcon } from './AgentIcons';
import { RunSetupDialog } from './RunSetupDialog';

function shortPresetLabel(label: string): string {
  return label.replace(/\s+code$/i, '').trim();
}

function presetIcon(preset: AgentPreset) {
  const icon = agentPresetIcon(preset.id, 15);
  if (icon) return icon;
  return <Bot size={15} />;
}

/* ── AgentQuickBar ─────────────────────────────────────────────────── */

export function AgentQuickBar() {
  const { t } = useTranslation();
  const [runSetupOpen, setRunSetupOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [pkgScripts, setPkgScripts] = useState<{ name: string; command: string }[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaces = useAppStore((state) => state.workspaces);
  const projects = useAppStore((state) => state.projects);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const projectActiveRunIndex = useAppStore((state) => state.projectActiveRunIndex);
  const setProjectActiveRunIndex = useAppStore((state) => state.setProjectActiveRunIndex);

  const enabledPresets = settings.agentPresets.filter((preset) => preset.enabled);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeProject = activeWorkspace ? projects.find((p) => p.id === activeWorkspace.projectId) : undefined;
  const activeRunIndex = activeProject ? (projectActiveRunIndex[activeProject.id] ?? 0) : 0;
  const setActiveRunIndex = useCallback(
    (index: number) => {
      if (activeProject) setProjectActiveRunIndex(activeProject.id, index);
    },
    [activeProject, setProjectActiveRunIndex],
  );

  // ── Detect package.json scripts ──
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
            Object.entries(pkg.scripts).map(([name]) => ({ name, command: `${pm} ${name}` })),
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

  // ── Build menu entries from user-saved commands only ──
  const runCommands = settings.runCommands ?? [];
  const menuEntries = runCommands;

  // The "active" entry is the currently selected one (used for the main Run button)
  const clampedIndex = Math.min(activeRunIndex, runCommands.length - 1);
  const activeEntry = runCommands.length > 0 ? runCommands[Math.max(0, clampedIndex)] : undefined;

  // +1 for the "Edit Commands…" action at the bottom
  const totalItems = menuEntries.length + 1;

  // ── Outside click to close ──
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!menuOpen) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusIndex((i) => (i + 1) % totalItems);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusIndex((i) => (i - 1 + totalItems) % totalItems);
          break;
        case 'Enter':
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < menuEntries.length) {
            // Switch the active run command (don't execute)
            setActiveRunIndex(focusIndex);
            setMenuOpen(false);
          } else if (focusIndex === menuEntries.length) {
            setMenuOpen(false);
            setRunSetupOpen(true);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setMenuOpen(false);
          break;
      }
    },
    [activeWorkspaceId, focusIndex, menuEntries, menuOpen, totalItems],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Reset focus when menu opens/closes
  useEffect(() => {
    if (!menuOpen) setFocusIndex(-1);
  }, [menuOpen]);

  // ── Handlers ──
  const handleRun = () => {
    if (activeEntry) {
      void createTerminal(activeWorkspaceId ?? undefined, activeEntry.command);
    } else {
      setRunSetupOpen(true);
    }
  };

  const handleRunSetupSave = (commands: { name: string; command: string }[]) => {
    updateSettings({ runCommands: commands.length > 0 ? commands : undefined });
    setRunSetupOpen(false);
  };

  const runLabel = activeEntry
    ? activeEntry.name.length > 18
      ? `${activeEntry.name.slice(0, 18)}…`
      : activeEntry.name
    : t('agent.runCommand');

  return (
    <>
      <div className="agent-quickbar flex h-9 shrink-0 items-center gap-1.5 border-border border-b bg-surface-toolbar px-3">
        <div className="scrollbar-none scroll-mask-x flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {enabledPresets.map((preset) => (
            <button
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                preset.command === settings.defaultAgentCommand
                  ? 'border-accent/45 bg-accent-surface text-text'
                  : 'border-transparent bg-transparent text-muted hover:bg-panel-2 hover:text-text'
              }`}
              key={preset.id}
              type="button"
              title={t('agent.newAgentPreset', { label: preset.label })}
              disabled={!activeWorkspaceId}
              onClick={() => {
                updateSettings({ defaultAgentCommand: preset.command });
                void createAgentTerminal(activeWorkspaceId ?? undefined, preset.command, preset.id);
              }}
            >
              {presetIcon(preset)}
              <span>{shortPresetLabel(preset.label)}</span>
            </button>
          ))}
        </div>

        {/* ── Split Run Button (mirrors OpenWith pattern) ── */}
        <div className="relative" ref={menuRef}>
          <div className="flex overflow-hidden rounded-lg border border-border bg-panel-2">
            {/* Left: execute current default */}
            <button
              className="flex h-7 items-center gap-1.5 px-2.5 text-[13px] text-text transition-colors hover:bg-panel-3 disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspaceId}
              title={activeEntry ? t('agent.runCommandDetail', { name: activeEntry.name, command: activeEntry.command }) : t('agent.configureRun')}
              onClick={handleRun}
            >
              <Play size={14} className="text-ok" />
              <span className="max-w-[120px] truncate font-[510]">{runLabel}</span>
            </button>

            {/* Right: chevron trigger */}
            <button
              className="grid h-7 w-7 place-items-center border-border border-l text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:text-subtle"
              type="button"
              disabled={!activeWorkspaceId}
              title={t('agent.defaultRunCommand')}
              onClick={() => setMenuOpen((v) => !v)}
              style={{ anchorName: '--run-cmd-trigger' } as CSSProperties}
            >
              <ChevronDown size={13} />
            </button>
          </div>

          {/* ── Dropdown menu (anchor-positioned) ── */}
          <div
            className="anchor-menu"
            style={
              {
                positionAnchor: '--run-cmd-trigger',
                top: 'anchor(bottom)',
                right: 'anchor(right)',
                marginTop: '7px',
                positionTryFallbacks: 'flip-block',
              } as CSSProperties
            }
            hidden={!menuOpen || !activeWorkspaceId}
            role="listbox"
          >
            <div className="px-2 py-1.5 text-[11px] text-subtle">{t('agent.runCommands')}</div>

            {menuEntries.length === 0 && (
              <div className="px-2 py-2 text-center text-[12px] text-subtle/60">
                {t('agent.noCommandsYet')}
              </div>
            )}

            {menuEntries.map((entry, i) => {
              const focused = focusIndex === i;
              const selected = i === Math.max(0, clampedIndex);
              return (
                <button
                  key={entry.command}
                  className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-text transition-colors hover:bg-panel-3 ${
                    focused ? 'bg-panel-3' : ''
                  }`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  title={entry.command}
                  onClick={() => {
                    setActiveRunIndex(i);
                    setMenuOpen(false);
                  }}
                  onMouseEnter={() => setFocusIndex(i)}
                  onMouseLeave={() => setFocusIndex(-1)}
                >
                  <span className="grid size-4 shrink-0 place-items-center">
                    {selected ? <Check size={14} className="text-ok" /> : <Play size={14} className="text-muted" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                </button>
              );
            })}

            {menuEntries.length > 0 && <div className="mx-2 my-1 border-border/60 border-t" />}

            <button
              className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-text transition-colors hover:bg-panel-3 ${
                focusIndex === menuEntries.length ? 'bg-panel-3' : ''
              }`}
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setRunSetupOpen(true);
              }}
              onMouseEnter={() => setFocusIndex(menuEntries.length)}
              onMouseLeave={() => setFocusIndex(-1)}
            >
              <span className="grid size-4 shrink-0 place-items-center">
                <Pencil size={13} className="text-muted" />
              </span>
              <span className="min-w-0 flex-1">{t('agent.editCommands')}</span>
            </button>
          </div>
        </div>

        <button
          className="icon-button"
          type="button"
          title={t('agent.newTerminal')}
          disabled={!activeWorkspaceId}
          onClick={() => void createTerminal(activeWorkspaceId ?? undefined)}
        >
          <TerminalSquare size={15} />
        </button>
      </div>

      {runSetupOpen && (
        <RunSetupDialog
          initialCommands={settings.runCommands}
          pkgScripts={pkgScripts}
          onSave={handleRunSetupSave}
          onClose={() => setRunSetupOpen(false)}
        />
      )}
    </>
  );
}
