import { type MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { useHorizontalScroll } from '@renderer/hooks/useHorizontalScroll';
import { getDroppedPaths, hasDraggableFiles, isInternalDrop } from '@renderer/lib/drag-utils';
import { getTabTitle, useAppStore } from '@renderer/store/app-store';
import type { Tab } from '@shared/types';
import { Bot, ClipboardList, ExternalLink, GitCompare, Globe, TerminalSquare } from 'lucide-react';

import { FileIcon } from './FileIcon';
import { SortableTabItem } from './SortableTabItem';
import { TabContextMenu } from './TabContextMenu';

function tabIcon(tab: Tab) {
  if (tab.type === 'terminal') return tab.isAgent ? <Bot size={14} /> : <TerminalSquare size={14} />;
  if (tab.type === 'diff') return <GitCompare size={14} />;
  if (tab.type === 'context-preview') return <ClipboardList size={14} />;
  if (tab.type === 'browser') return <Globe size={14} />;
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
  const openFileTab = useAppStore((state) => state.openFileTab);
  const openExternalFileTab = useAppStore((state) => state.openExternalFileTab);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // tabListRef is also used by the scrollIntoView effect below
  const { ref: tabListRef, onWheel } = useHorizontalScroll<HTMLDivElement>();

  const workspaceTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId && tab.type !== 'terminal');
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  const [contextMenu, setContextMenu] = useState<{ tab: Tab; x: number; y: number } | null>(null);
  const [dropHighlight, setDropHighlight] = useState(false);

  const tabIds = useMemo(() => workspaceTabs.map((t) => t.id), [workspaceTabs]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorderTabs(String(active.id), String(over.id));
    },
    [reorderTabs],
  );

  // Scroll the active file tab into view whenever it changes
  useEffect(() => {
    if (!activeFileTabId || !tabListRef.current) return;
    const el = tabListRef.current.querySelector<HTMLElement>(`[data-tab-id="${activeFileTabId}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, [activeFileTabId, tabListRef]);

  const handleContextMenu = useCallback((event: MouseEvent, tab: Tab) => {
    event.preventDefault();
    setContextMenu({ tab, x: event.clientX, y: event.clientY });
  }, []);

  // ── External file drop: open as file tabs ──────────────────────────────
  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    if (!isInternalDrop(e) && hasDraggableFiles(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleFileDragEnter = useCallback((e: React.DragEvent) => {
    if (!isInternalDrop(e) && hasDraggableFiles(e)) {
      e.preventDefault();
      setDropHighlight(true);
    }
  }, []);

  const handleFileDragLeave = useCallback(() => {
    setDropHighlight(false);
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      if (isInternalDrop(e)) return;

      const paths = getDroppedPaths(e);
      if (paths.length === 0) return;

      e.preventDefault();
      e.stopPropagation();
      setDropHighlight(false);

      if (!activeWorkspace) return;

      for (const absPath of paths) {
        if (absPath.startsWith(activeWorkspace.worktreePath + '/')) {
          const relPath = absPath.slice(activeWorkspace.worktreePath.length + 1);
          openFileTab(activeWorkspace.id, relPath);
        } else {
          openExternalFileTab(activeWorkspace.id, absPath);
        }
      }
    },
    [activeWorkspace, openFileTab, openExternalFileTab],
  );
  // ───────────────────────────────────────────────────────────────────────

  return (
    <div
      className={`workspace-tabbar tabbar relative flex h-9 shrink-0 items-center border-b border-border bg-bg ${dropHighlight ? 'drop-target-active' : ''}`}
      onDragOver={handleFileDragOver}
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          <div
            ref={tabListRef}
            className="tabs-scroll scrollbar-none scroll-mask-x flex min-w-0 flex-1 overflow-x-auto"
            role="tablist"
            onWheel={onWheel}
          >
            {workspaceTabs.map((tab) => {
              const isExternal = tab.type === 'file' && Boolean(tab.absPath);
              return (
                <SortableTabItem
                  key={tab.id}
                  id={tab.id}
                  active={tab.id === activeFileTabId}
                  icon={tabIcon(tab)}
                  title={getTabTitle(tab)}
                  tooltip={isExternal ? tab.absPath : undefined}
                  onSelect={() => setActiveTab(tab.id)}
                  onClose={() => closeTab(tab.id)}
                  onContextMenu={(event) => handleContextMenu(event, tab)}
                  className="min-w-[80px] max-w-[240px]"
                  data-tab-id={tab.id}
                  suffix={
                    isExternal ? (
                      <ExternalLink size={10} className="shrink-0 text-subtle" />
                    ) : undefined
                  }
                />
              );
            })}
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
