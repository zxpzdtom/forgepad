import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { getTabTitle, useAppStore } from '@renderer/store/app-store';
import type { Tab } from '@shared/types';
import { Bot, ClipboardList, GitCompare, TerminalSquare } from 'lucide-react';

import { FileIcon } from './FileIcon';
import { SortableTabItem } from './SortableTabItem';
import { TabContextMenu } from './TabContextMenu';

function tabIcon(tab: Tab) {
  if (tab.type === 'terminal') return tab.isAgent ? <Bot size={14} /> : <TerminalSquare size={14} />;
  if (tab.type === 'diff') return <GitCompare size={14} />;
  if (tab.type === 'context-preview') return <ClipboardList size={14} />;
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const workspaceTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId && tab.type !== 'terminal');
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
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
    const el = tabListRef.current.querySelector<HTMLElement>(`[data-tab-id="${activeFileTabId}"]`);
    if (el) {
      el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [activeFileTabId]);

  const handleContextMenu = useCallback((event: MouseEvent, tab: Tab) => {
    event.preventDefault();
    setContextMenu({ tab, x: event.clientX, y: event.clientY });
  }, []);

  return (
    <div className="workspace-tabbar tabbar relative flex h-9 shrink-0 items-center border-border border-b bg-bg">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          <div
            ref={tabListRef}
            className="tabs-scroll scrollbar-none scroll-mask-x flex min-w-0 flex-1 overflow-x-auto"
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
