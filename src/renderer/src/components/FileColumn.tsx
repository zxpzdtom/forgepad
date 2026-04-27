import { useAppStore } from "@renderer/store/app-store";
import { FileEditor } from "./FileEditor";
import { DiffViewer } from "./DiffViewer";
import { ContextPreview } from "./ContextPreview";
import type { Workspace } from "@shared/types";

export function FileColumn() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeFileTabId = useAppStore((state) => state.activeFileTabId);
  const workspaces = useAppStore((state) => state.workspaces);
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
    <div className="flex size-full min-h-0 min-w-0 flex-col bg-bg relative" onMouseDown={handleMouseDown}>
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
    </div>
  );
}
