import { useMemo, useCallback, useEffect } from 'react';
import { useHorizontalScroll } from '@renderer/hooks/useHorizontalScroll';
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';

import type { PopoutTab } from './PopoutBrowser';

type PopoutTabBarProps = {
  tabs: PopoutTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onReorderTabs: (activeId: string, overId: string) => void;
};

// ── Sortable tab item ─────────────────────────────────────────────────────

function SortablePopoutTab({
  tab,
  isActive,
  onSelect,
  onClose,
}: {
  tab: PopoutTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      data-tab-id={tab.id}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={[
        'popout-tab-item group relative flex h-7 max-w-[200px] min-w-[80px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors',
        isActive ? 'bg-panel-3 text-text' : 'text-subtle hover:bg-panel-2 hover:text-muted',
      ].join(' ')}
    >
      {/* Favicon */}
      {tab.favicon ? (
        <img
          src={tab.favicon}
          alt=""
          width={14}
          height={14}
          className="shrink-0 rounded-sm"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-subtle">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="8" cy="8" rx="2.5" ry="6.5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="1.5" y1="6" x2="14.5" y2="6" stroke="currentColor" strokeWidth="1.2" />
          <line x1="1.5" y1="10" x2="14.5" y2="10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )}

      {/* Title */}
      <span className="min-w-0 flex-1 truncate">{tab.isLoading ? 'Loading...' : tab.title || 'New Tab'}</span>

      {/* Close button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={[
          'flex size-4 shrink-0 items-center justify-center rounded-sm transition-colors',
          isActive
            ? 'text-subtle hover:bg-panel-2 hover:text-text'
            : 'text-subtle/0 group-hover:text-subtle hover:!bg-panel-3 hover:!text-text',
        ].join(' ')}
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ── PopoutTabBar ─────────────────────────────────────────────────────────

export function PopoutTabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onReorderTabs }: PopoutTabBarProps) {
  const { ref: tabListRef, onWheel } = useHorizontalScroll<HTMLDivElement>();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);

  // Auto-scroll to active tab when it changes
  useEffect(() => {
    if (!tabListRef.current) return;
    const el = tabListRef.current.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`);
    if (el)
      el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
  }, [activeTabId, tabListRef]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderTabs(String(active.id), String(over.id));
    },
    [onReorderTabs],
  );

  return (
    <div className="popout-tabbar flex h-9 shrink-0 items-center gap-0 border-border border-b bg-panel pl-[78px] pr-1">
      {/* Tab list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          <div
            ref={tabListRef}
            className="scroll-mask-x scrollbar-none flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
            onWheel={onWheel}
          >
            {tabs.map((tab) => (
              <SortablePopoutTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onSelect={() => onSelectTab(tab.id)}
                onClose={() => onCloseTab(tab.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* New tab button */}
      <button
        type="button"
        onClick={onNewTab}
        className="ml-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-panel-2 hover:text-text"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
