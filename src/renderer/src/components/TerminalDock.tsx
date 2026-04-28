import { useCallback, useState, type MouseEvent } from "react";
import { Bot, Minimize2, Plus, TerminalSquare, X } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";
import { TerminalPanel } from "./TerminalPanel";
import { TabContextMenu } from "./TabContextMenu";
import type { Tab, Workspace } from "@shared/types";

type TerminalTab = Extract<Tab, { type: "terminal" }>;

function terminalIcon(tab: TerminalTab) {
  return tab.isAgent ? <Bot size={13} /> : <TerminalSquare size={13} />;
}

export function TerminalDock() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeShellTabId = useAppStore((state) => state.activeShellTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const closeOtherTabs = useAppStore((state) => state.closeOtherTabs);
  const closeAllTabs = useAppStore((state) => state.closeAllTabs);
  const closeTabsToRight = useAppStore((state) => state.closeTabsToRight);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const setTerminalPanelOpen = useAppStore(
    (state) => state.setTerminalPanelOpen,
  );
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);

  const [contextMenu, setContextMenu] = useState<{
    tab: Tab;
    x: number;
    y: number;
  } | null>(null);

  const terminalTabs = tabs.filter(
    (tab): tab is TerminalTab =>
      tab.workspaceId === activeWorkspaceId &&
      tab.type === "terminal" &&
      !tab.isAgent,
  );
  const activeId = activeShellTabId ?? terminalTabs[0]?.id;
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  ) as Workspace | undefined;

  const handleContextMenu = useCallback((event: MouseEvent, tab: Tab) => {
    event.preventDefault();
    setContextMenu({ tab, x: event.clientX, y: event.clientY });
  }, []);

  if (!activeWorkspace || terminalTabs.length === 0) return null;

  return (
    <section
      className="flex size-full min-h-0 flex-col border-t border-border bg-surface-terminal"
      onMouseDown={() => setFocusedColumn("agent")}
    >
      <div className="column-tabbar flex h-9 shrink-0 items-center gap-1 border-b border-border bg-surface-toolbar px-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none scroll-mask-x">
          {terminalTabs.map((tab) => (
            <button
              className={`group flex h-8 shrink-0 items-center gap-1.5 rounded-t-md px-2.5 text-xs transition-colors${
                tab.id === activeId
                  ? " bg-bg text-text"
                  : " text-muted hover:bg-panel-2 hover:text-text"
              }`}
              key={tab.id}
              type="button"
              title={tab.title}
              onClick={() => {
                setTerminalPanelOpen(true);
                setActiveTab(tab.id);
              }}
              onContextMenu={(event) => handleContextMenu(event, tab)}
            >
              {terminalIcon(tab)}
              <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
                {tab.title}
              </span>
              <span
                className="grid size-4 place-items-center rounded text-subtle opacity-0 transition-opacity hover:bg-panel-3 hover:text-text group-hover:opacity-100 focus:opacity-100"
                role="button"
                tabIndex={0}
                title="Close terminal"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeTab(tab.id);
                  }
                }}
              >
                <X size={11} />
              </span>
            </button>
          ))}
        </div>

        <button
          className="icon-button small"
          type="button"
          title="New terminal"
          onClick={() => void createTerminal(activeWorkspaceId ?? undefined)}
        >
          <Plus size={14} />
        </button>
        <button
          className="icon-button small"
          type="button"
          title="Hide terminal"
          onClick={() => setTerminalPanelOpen(false)}
        >
          <Minimize2 size={13} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {terminalTabs.map((tab) => (
          <TerminalPanel
            key={tab.id}
            tab={tab}
            workspace={activeWorkspace}
            active={tab.id === activeId}
          />
        ))}
      </div>

      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCloseTab={closeTab}
          onCloseOthers={closeOtherTabs}
          onCloseAll={closeAllTabs}
          onCloseToRight={closeTabsToRight}
        />
      )}
    </section>
  );
}
