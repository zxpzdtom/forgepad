import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { Bot, Plus } from "lucide-react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useAppStore } from "@renderer/store/app-store";
import { SortableTabItem } from "./SortableTabItem";
import { TabContextMenu } from "./TabContextMenu";
import { RenameModal } from "./RenameModal";
import { agentPresetIcon } from "./AgentIcons";
import type { Tab } from "@shared/types";
import type { AgentStatus } from "@shared/agent-lifecycle";

type TerminalTab = Extract<Tab, { type: "terminal" }>;

function agentTabIcon(tab: TerminalTab, isWorking: boolean) {
  const inner = (() => {
    if (tab.agentPresetId) {
      const icon = agentPresetIcon(tab.agentPresetId, 13);
      if (icon) return icon;
    }
    return <Bot size={13} />;
  })();

  return (
    <span className={`inline-flex${isWorking ? " animate-breathe" : ""}`}>
      {inner}
    </span>
  );
}

function StatusDot({ status }: { status: AgentStatus | undefined }) {
  if (status === "review") {
    return (
      <span className="relative flex size-2 shrink-0">
        <span className="relative inline-flex size-2 rounded-full bg-ok" />
      </span>
    );
  }
  if (status === "permission") {
    return (
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-warn" />
      </span>
    );
  }
  return null;
}

export function AgentTabBar() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeAgentTabId = useAppStore((state) => state.activeAgentTabId);
  const agentStatuses = useAppStore((state) => state.agentStatuses);
  const exitedPtyIds = useAppStore((state) => state.exitedPtyIds);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const closeOtherTabs = useAppStore((state) => state.closeOtherTabs);
  const closeAllTabs = useAppStore((state) => state.closeAllTabs);
  const closeTabsToRight = useAppStore((state) => state.closeTabsToRight);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const reorderTabs = useAppStore((state) => state.reorderTabs);
  const renameTab = useAppStore((state) => state.renameTab);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const [contextMenu, setContextMenu] = useState<{
    tab: Tab;
    x: number;
    y: number;
  } | null>(null);
  const [renameTabId, setRenameTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const agentTabs = tabs.filter(
    (tab): tab is TerminalTab =>
      tab.workspaceId === activeWorkspaceId &&
      tab.type === "terminal" &&
      tab.isAgent === true,
  );

  const activeId = activeAgentTabId ?? agentTabs[0]?.id;
  const tabIds = useMemo(() => agentTabs.map((t) => t.id), [agentTabs]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorderTabs(String(active.id), String(over.id));
    },
    [reorderTabs],
  );

  const handleContextMenu = useCallback((event: MouseEvent, tab: Tab) => {
    event.preventDefault();
    setContextMenu({ tab, x: event.clientX, y: event.clientY });
  }, []);

  if (agentTabs.length === 0) return null;

  return (
    <div className="column-tabbar flex h-9 shrink-0 items-center gap-1 border-b border-border bg-bg px-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tabIds}
          strategy={horizontalListSortingStrategy}
        >
          <div
            className="tabs-scroll flex min-w-0 flex-1 items-center overflow-x-auto scrollbar-none scroll-mask-x"
            role="tablist"
          >
            {agentTabs.map((tab) => {
              const isExited = exitedPtyIds.has(tab.ptyId);
              const status: AgentStatus | undefined =
                agentStatuses[tab.ptyId] ?? (isExited ? undefined : "idle");
              const isWorking = status === "working";

              return (
                <SortableTabItem
                  className="min-w-[80px] max-w-[240px]"
                  key={tab.id}
                  id={tab.id}
                  active={tab.id === activeId}
                  icon={agentTabIcon(tab, isWorking)}
                  title={tab.title}
                  onSelect={() => setActiveTab(tab.id)}
                  onClose={() => closeTab(tab.id)}
                  closeTitle="Close agent"
                  onContextMenu={(event) => handleContextMenu(event, tab)}
                  suffix={<StatusDot status={status} />}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <button
        className="icon-button small"
        type="button"
        title="New agent"
        onClick={() => void createAgentTerminal(activeWorkspaceId ?? undefined)}
      >
        <Plus size={14} />
      </button>

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
          onRename={(id) => {
            const tab = agentTabs.find((t) => t.id === id);
            setRenameValue(tab?.title ?? "");
            setRenameTabId(id);
          }}
        />
      )}

      {renameTabId && (
        <RenameModal
          value={renameValue}
          onChange={setRenameValue}
          onConfirm={() => {
            const trimmed = renameValue.trim();
            if (trimmed) renameTab(renameTabId, trimmed);
            setRenameTabId(null);
          }}
          onCancel={() => setRenameTabId(null)}
        />
      )}
    </div>
  );
}
