import { useCallback, useRef, useState } from "react";
import {
  ClipboardList,
  FileCode2,
  GitCompare,
  X,
} from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";
import { FileEditor } from "./FileEditor";
import { DiffViewer } from "./DiffViewer";
import { ContextPreview } from "./ContextPreview";
import { TabContextMenu } from "./TabContextMenu";
import type { Tab, Workspace } from "@shared/types";

type FileTab = Extract<Tab, { type: "file" }>;
type DiffTab = Extract<Tab, { type: "diff" }>;
type ContextPreviewTab = Extract<Tab, { type: "context-preview" }>;

function tabIcon(tab: FileTab | DiffTab | ContextPreviewTab) {
  if (tab.type === "diff") return <GitCompare size={13} />;
  if (tab.type === "context-preview") return <ClipboardList size={13} />;
  return <FileCode2 size={13} />;
}

function tabLabel(tab: FileTab | DiffTab | ContextPreviewTab) {
  if (tab.type === "file") return tab.relPath.split("/").pop() ?? tab.relPath;
  if (tab.type === "diff") return "Changes";
  return "Context";
}

export function FileColumn() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeFileTabId = useAppStore((state) => state.activeFileTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const closeOtherTabs = useAppStore((state) => state.closeOtherTabs);
  const closeAllTabs = useAppStore((state) => state.closeAllTabs);
  const closeTabsToRight = useAppStore((state) => state.closeTabsToRight);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);

  const [contextMenu, setContextMenu] = useState<{
    tab: Tab;
    x: number;
    y: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fileTabs = tabs.filter(
    (tab) =>
      tab.workspaceId === activeWorkspaceId &&
      tab.type !== "terminal",
  );

  const columnActiveId = activeFileTabId ?? fileTabs[0]?.id;
  const activeFileTab = fileTabs.find((t) => t.id === columnActiveId);

  const activeWorkspace = workspaces.find(
    (w) => w.id === activeWorkspaceId,
  ) as Workspace | undefined;

  const handleMouseDown = () => setFocusedColumn("file");

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: Tab) => {
      e.preventDefault();
      setContextMenu({ tab, x: e.clientX, y: e.clientY });
    },
    [],
  );

  if (fileTabs.length === 0 || !activeWorkspace) return null;

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col bg-bg relative" onMouseDown={handleMouseDown}>
      <div className="flex h-[42px] shrink-0 items-center border-b border-border bg-bg px-2">
        <div
          ref={scrollRef}
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none"
        >
          {fileTabs.map((tab) => (
            <button
              className={`group flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-t-[5px] px-2.5 py-1.5 text-xs border-none cursor-pointer transition-colors duration-100${
                tab.id === columnActiveId
                  ? " bg-[var(--surface)] text-[var(--fg)] border-b-2 border-b-[var(--accent)]"
                  : " bg-transparent text-muted hover:bg-[var(--hover)] hover:text-[var(--fg)]"
              }`}
              key={tab.id}
              type="button"
              title={tabLabel(tab)}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab)}
            >
              {tabIcon(tab)}
              <span>{tabLabel(tab)}</span>
              <span
                className={`flex size-4 items-center justify-center rounded-[3px] bg-transparent text-muted cursor-pointer border-none p-0 hover:bg-[var(--hover)] hover:text-[var(--fg)]${
                  tab.id === columnActiveId
                    ? " opacity-0 group-hover:opacity-100"
                    : " opacity-0 group-hover:opacity-100"
                } transition-opacity duration-100`}
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
                <X size={12} />
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {fileTabs.map((tab) => {
          if (tab.id !== activeFileTab?.id) return null;
          if (tab.type === "file") {
            return (
              <FileEditor
                key={tab.id}
                tab={tab}
                workspace={activeWorkspace}
              />
            );
          }
          if (tab.type === "diff") {
            return (
              <DiffViewer
                key={tab.id}
                tab={tab}
                workspace={activeWorkspace}
              />
            );
          }
          if (tab.type === "context-preview") {
            return <ContextPreview key={tab.id} />;
          }
          return null;
        })}
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
