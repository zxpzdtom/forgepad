import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { getTabTitle, type SettingsSection, useAppStore } from '@renderer/store/app-store';
import {
  Bot,
  CornerDownLeft,
  FileCode2,
  FolderOpen,
  GitCompare,
  Paintbrush,
  PanelRight,
  Search,
  SendHorizontal,
  Settings,
  Terminal,
  TerminalSquare,
} from 'lucide-react';

type QuickSearchProps = {
  open: boolean;
  onClose: () => void;
};

type QuickSearchItem = {
  id: string;
  label: string;
  detail: string;
  icon: ReactNode;
  run: () => void;
};

function matches(item: QuickSearchItem, query: string): boolean {
  const haystack = `${item.label} ${item.detail}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

export function QuickSearch({ open, onClose }: QuickSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const projects = useAppStore((state) => state.projects);
  const workspaces = useAppStore((state) => state.workspaces);
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const settings = useAppStore((state) => state.settings);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const openProject = useAppStore((state) => state.openProject);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const openFileTab = useAppStore((state) => state.openFileTab);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const openDiffTab = useAppStore((state) => state.openDiffTab);
  const setRightPanelMode = useAppStore((state) => state.setRightPanelMode);
  const addToast = useAppStore((state) => state.addToast);

  const items = useMemo<QuickSearchItem[]>(() => {
    const next: QuickSearchItem[] = [
      {
        id: 'open-project',
        label: 'Open Project',
        detail: 'Repository',
        icon: <FolderOpen size={16} />,
        run: () => void openProject(),
      },
    ];

    for (const project of projects) {
      const projectWorkspaces = workspaces.filter((workspace) => workspace.projectId === project.id);
      for (const workspace of projectWorkspaces) {
        next.push({
          id: `workspace:${workspace.id}`,
          label: workspace.name,
          detail: workspace.branch || project.name,
          icon: <FolderOpen size={16} />,
          run: () => setActiveWorkspace(workspace.id),
        });
      }
    }

    if (activeWorkspace) {
      for (const relPath of filePaths) {
        const fileName = relPath.split('/').pop() ?? relPath;
        next.push({
          id: `file:${activeWorkspace.id}:${relPath}`,
          label: fileName,
          detail: relPath,
          icon: <FileCode2 size={16} />,
          run: () => openFileTab(activeWorkspace.id, relPath),
        });
      }
    }

    for (const tab of tabs) {
      const workspace = workspaces.find((item) => item.id === tab.workspaceId);
      next.push({
        id: `tab:${tab.id}`,
        label: getTabTitle(tab),
        detail: workspace ? `${workspace.name} · ${tab.type}` : tab.type,
        icon: tab.type === 'terminal' ? <TerminalSquare size={16} /> : <FileCode2 size={16} />,
        run: () => {
          setActiveWorkspace(tab.workspaceId);
          setActiveTab(tab.id);
        },
      });
    }

    if (activeWorkspaceId) {
      next.push(
        {
          id: 'new-terminal',
          label: 'New Terminal',
          detail: 'Active workspace',
          icon: <TerminalSquare size={16} />,
          run: () => void createTerminal(activeWorkspaceId),
        },
        {
          id: 'open-changes',
          label: 'Open Changes',
          detail: 'Diff tab',
          icon: <GitCompare size={16} />,
          run: () => openDiffTab(activeWorkspaceId),
        },
        {
          id: 'panel-files',
          label: 'Files Panel',
          detail: 'Right panel',
          icon: <PanelRight size={16} />,
          run: () => setRightPanelMode('files'),
        },
        {
          id: 'panel-context',
          label: 'Context Panel',
          detail: 'Right panel',
          icon: <SendHorizontal size={16} />,
          run: () => setRightPanelMode('context'),
        },
      );

      for (const preset of settings.agentPresets.filter((preset) => preset.enabled)) {
        next.push({
          id: `agent:${preset.id}`,
          label: `New ${preset.label}`,
          detail: preset.command,
          icon: <Bot size={16} />,
          run: () => void createAgentTerminal(activeWorkspaceId, preset.command, preset.id),
        });
      }
    }

    // Settings sections
    const settingsItems: {
      id: string;
      section: SettingsSection;
      label: string;
      icon: ReactNode;
    }[] = [
      {
        id: 'settings:general',
        section: 'general',
        label: 'General',
        icon: <Paintbrush size={16} />,
      },
      {
        id: 'settings:agent',
        section: 'agent',
        label: 'Agent',
        icon: <Bot size={16} />,
      },
      {
        id: 'settings:terminal',
        section: 'terminal',
        label: 'Terminal',
        icon: <Terminal size={16} />,
      },
      {
        id: 'settings:changes',
        section: 'changes',
        label: 'Changes',
        icon: <GitCompare size={16} />,
      },
      {
        id: 'settings:advanced',
        section: 'advanced',
        label: 'Advanced',
        icon: <Settings size={16} />,
      },
    ];
    for (const item of settingsItems) {
      next.push({
        id: item.id,
        label: `Settings: ${item.label}`,
        detail: 'Settings',
        icon: item.icon,
        run: () => useAppStore.setState({ settingsOpen: item.section }),
      });
    }

    return next;
  }, [
    activeWorkspaceId,
    activeWorkspace,
    createAgentTerminal,
    createTerminal,
    filePaths,
    openFileTab,
    openDiffTab,
    openProject,
    projects,
    setActiveTab,
    setActiveWorkspace,
    setRightPanelMode,
    settings.agentPresets,
    tabs,
    workspaces,
  ]);

  const filteredItems = useMemo(() => {
    const trimmed = query.trim();
    const result = trimmed ? items.filter((item) => matches(item, trimmed)) : items;
    return result.slice(0, 12);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || !activeWorkspace) {
      setFilePaths([]);
      return;
    }

    let disposed = false;
    window.forgepad.fs
      .listFiles(activeWorkspace.worktreePath)
      .then((paths) => {
        if (!disposed) setFilePaths(paths);
      })
      .catch((error) => {
        if (disposed) return;
        setFilePaths([]);
        addToast('error', error instanceof Error ? error.message : 'Failed to search files.');
      });

    return () => {
      disposed = true;
    };
  }, [activeWorkspace, addToast, open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const child = container.children[selectedIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  const runSelected = () => {
    const item = filteredItems[selectedIndex];
    if (!item) return;
    item.run();
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => (filteredItems.length === 0 ? 0 : (index + 1) % filteredItems.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (filteredItems.length === 0 ? 0 : (index - 1 + filteredItems.length) % filteredItems.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runSelected();
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center pt-[58px]" onMouseDown={onClose}>
      <div
        className="w-[min(680px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-surface-dialog shadow-[0_28px_70px_rgba(0,0,0,0.46)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center gap-3 border-border border-b px-4">
          <Search size={18} className="text-muted" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-subtle"
            value={query}
            placeholder="Search workspaces, tabs, and agents"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div ref={listRef} className="scrollbar-thin scroll-mask-y max-h-[360px] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="grid h-24 place-items-center text-muted text-sm">No results</div>
          ) : (
            filteredItems.map((item, index) => (
              <button
                className={`grid h-9 w-full grid-cols-[24px_minmax(120px,auto)_minmax(0,1fr)_18px] items-center gap-3 rounded-lg px-3 text-left transition-colors${
                  index === selectedIndex ? 'bg-panel-3 text-text' : 'text-muted hover:bg-panel-2 hover:text-text'
                }`}
                key={item.id}
                type="button"
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  item.run();
                  onClose();
                }}
              >
                <span className="grid size-6 place-items-center">{item.icon}</span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap font-[510] text-[15px]">{item.label}</span>
                <span className="max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap text-muted text-sm">
                  {item.detail}
                </span>
                <CornerDownLeft size={15} className="text-subtle" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
