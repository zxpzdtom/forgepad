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
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);

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

  if (fileTabs.length === 0 || !activeWorkspace) return null;

  return (
    <div className="file-column" onMouseDown={handleMouseDown}>
      <div className="column-tabbar">
        <div className="tabs-scroll">
          {fileTabs.map((tab) => (
            <button
              className={`tab-chip${tab.id === columnActiveId ? " active" : ""}`}
              key={tab.id}
              type="button"
              title={tabLabel(tab)}
              onClick={() => setActiveTab(tab.id)}
            >
              {tabIcon(tab)}
              <span>{tabLabel(tab)}</span>
              <span
                className="tab-close"
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
      <div className="column-content">
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
    </div>
  );
}
