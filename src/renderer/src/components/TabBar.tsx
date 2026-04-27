import { useCallback, useState, type MouseEvent } from "react";
import {
  Bot,
  ClipboardList,
  FileCode2,
  GitCompare,
  TerminalSquare,
  X,
} from "lucide-react";
import { getTabTitle, useAppStore } from "@renderer/store/app-store";
import { TabContextMenu } from "./TabContextMenu";
import type { Tab } from "@shared/types";

function tabIcon(tab: Tab) {
  if (tab.type === "terminal")
    return tab.isAgent ? <Bot size={14} /> : <TerminalSquare size={14} />;
  if (tab.type === "diff") return <GitCompare size={14} />;
  if (tab.type === "context-preview") return <ClipboardList size={14} />;
  return <FileCode2 size={14} />;
}

export function TabBar() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const closeOtherTabs = useAppStore((state) => state.closeOtherTabs);
  const closeAllTabs = useAppStore((state) => state.closeAllTabs);
  const closeTabsToRight = useAppStore((state) => state.closeTabsToRight);

  const workspaceTabs = tabs.filter(
    (tab) => tab.workspaceId === activeWorkspaceId && tab.type !== "terminal",
  );
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const [contextMenu, setContextMenu] = useState<{
    tab: Tab;
    x: number;
    y: number;
  } | null>(null);

  const handleContextMenu = useCallback((event: MouseEvent, tab: Tab) => {
    event.preventDefault();
    setContextMenu({ tab, x: event.clientX, y: event.clientY });
  }, []);

  return (
    <div className="workspace-tabbar tabbar relative flex h-9 shrink-0 items-center border-b border-border bg-[#111111]">
      <div className="flex min-w-0 flex-1 overflow-x-auto scrollbar-none">
        {workspaceTabs.map((tab) => (
          <button
            className={`group grid h-9 min-w-[128px] max-w-[240px] grid-cols-[16px_minmax(0,1fr)_18px] items-center gap-2 border-r border-border-soft px-2 text-sm transition-colors${tab.id === activeTabId ? " bg-panel text-text" : " bg-transparent text-muted hover:bg-panel-2 hover:text-text"}`}
            key={tab.id}
            type="button"
            title={getTabTitle(tab)}
            onClick={() => setActiveTab(tab.id)}
            onContextMenu={(event) => handleContextMenu(event, tab)}
          >
            {tabIcon(tab)}
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{getTabTitle(tab)}</span>
            <span
              className="grid size-[18px] place-items-center rounded opacity-0 transition-opacity hover:bg-panel-3 group-hover:opacity-100 focus:opacity-100"
              role="button"
              tabIndex={0}
              title="Close tab"
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
              <X size={13} />
            </span>
          </button>
        ))}
      </div>
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          workspacePath={activeWorkspace?.worktreePath}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCloseTab={closeTab}
          onCloseOthers={closeOtherTabs}
          onCloseAll={closeAllTabs}
          onCloseToRight={closeTabsToRight}
        />
      )}
    </div>
  );
}
