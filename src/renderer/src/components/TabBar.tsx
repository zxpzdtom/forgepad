import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Bot, ClipboardList, GitCompare, TerminalSquare } from "lucide-react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { getTabTitle, useAppStore } from "@renderer/store/app-store";
import { SortableTabItem } from "./SortableTabItem";
import { TabContextMenu } from "./TabContextMenu";
import { FileIcon } from "./FileIcon";
import type { Tab } from "@shared/types";

function tabIcon(tab: Tab) {
  if (tab.type === "terminal")
    return tab.isAgent ? <Bot size={14} /> : <TerminalSquare size={14} />;
  if (tab.type === "diff") return <GitCompare size={14} />;
  if (tab.type === "context-preview") return <ClipboardList size={14} />;
  return <FileIcon filePath={tab.relPath} size={16} />;
}

export function TabBar() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeFileTabId = useAppStore((state) => state.activeFileTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const closeOtherTabs = useAppStore((state) => state.closeOtherTabs);
  const closeAllTabs = useAppStore((state) => state.closeAllTabs);
  const closeTabsToRight = useAppStore((state) => state.closeTabsToRight);
  const reorderTabs = useAppStore((state) => state.reorderTabs);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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

  const tabIds = useMemo(() => workspaceTabs.map((t) => t.id), [workspaceTabs]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorderTabs(String(active.id), String(over.id));
    },
    [reorderTabs],
  );

  const tabListRef = useRef<HTMLDivElement>(null);

  // Scroll the active file tab into view whenever it changes
  useEffect(() => {
    if (!activeFileTabId || !tabListRef.current) return;
    const el = tabListRef.current.querySelector<HTMLElement>(
      `[data-tab-id="${activeFileTabId}"]`,
    );
    if (el) {
      el.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
    }
  }, [activeFileTabId]);

  const handleContextMenu = useCallback((event: MouseEvent, tab: Tab) => {
    event.preventDefault();
    setContextMenu({ tab, x: event.clientX, y: event.clientY });
  }, []);

  return (
    <div className="workspace-tabbar tabbar relative flex h-9 shrink-0 items-center border-b border-border bg-bg">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tabIds}
          strategy={horizontalListSortingStrategy}
        >
          <div
            ref={tabListRef}
            className="tabs-scroll flex min-w-0 flex-1 overflow-x-auto scrollbar-none scroll-mask-x"
            role="tablist"
          >
            {workspaceTabs.map((tab) => (
              <SortableTabItem
                key={tab.id}
                id={tab.id}
                active={tab.id === activeFileTabId}
                icon={tabIcon(tab)}
                title={getTabTitle(tab)}
                onSelect={() => setActiveTab(tab.id)}
                onClose={() => closeTab(tab.id)}
                onContextMenu={(event) => handleContextMenu(event, tab)}
                className="min-w-[80px] max-w-[240px]"
                data-tab-id={tab.id}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
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
