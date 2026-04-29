import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import { Bot, Minimize2, Plus, TerminalSquare } from "lucide-react";
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
import { TerminalPanel } from "./TerminalPanel";
import { TabContextMenu } from "./TabContextMenu";
import { RenameModal } from "./RenameModal";
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
  const reorderTabs = useAppStore((state) => state.reorderTabs);
  const renameTab = useAppStore((state) => state.renameTab);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);

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

  const tabIds = useMemo(() => terminalTabs.map((t) => t.id), [terminalTabs]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorderTabs(String(active.id), String(over.id));
    },
    [reorderTabs],
  );

  // ── Drop target for file paths from tree ──
  const [dropHighlight, setDropHighlight] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-forgepad-path")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-forgepad-path")) {
      e.preventDefault();
      dragCounterRef.current++;
      setDropHighlight(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDropHighlight(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDropHighlight(false);

      const path =
        e.dataTransfer.getData("application/x-forgepad-path") ||
        e.dataTransfer.getData("text/plain");
      if (!path) return;

      e.stopPropagation(); // prevent outer fallback handler from firing
      const activeTab = terminalTabs.find((t) => t.id === activeId);
      if (activeTab) {
        window.forgepad.pty.write(activeTab.ptyId, path);
      }
    },
    [terminalTabs, activeId],
  );

  if (!activeWorkspace || terminalTabs.length === 0) return null;

  return (
    <section
      className={`flex size-full min-h-0 flex-col border-t border-border bg-surface-terminal${dropHighlight ? " drop-target-active" : ""}`}
      onMouseDown={() => setFocusedColumn("agent")}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
              {terminalTabs.map((tab) => (
                <SortableTabItem
                  key={tab.id}
                  id={tab.id}
                  className="min-w-[80px] max-w-[240px]"
                  active={tab.id === activeId}
                  icon={terminalIcon(tab)}
                  title={tab.title}
                  onSelect={() => {
                    setTerminalPanelOpen(true);
                    setActiveTab(tab.id);
                  }}
                  onClose={() => closeTab(tab.id)}
                  closeTitle="Close terminal"
                  onContextMenu={(event) => handleContextMenu(event, tab)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

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
          onRename={(id) => {
            const tab = terminalTabs.find((t) => t.id === id);
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
    </section>
  );
}
