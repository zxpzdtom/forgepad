import { useAppStore } from "@renderer/store/app-store";
import { TerminalPanel } from "./TerminalPanel";
import type { Workspace } from "@shared/types";

export function AgentColumn() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeAgentTabId = useAppStore((state) => state.activeAgentTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);

  const terminalTabs = tabs.filter(
    (tab) =>
      tab.workspaceId === activeWorkspaceId && tab.type === "terminal",
  );

  const columnActiveId = activeAgentTabId ?? terminalTabs[0]?.id;

  const handleMouseDown = () => setFocusedColumn("agent");

  if (terminalTabs.length === 0) return null;

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col bg-bg relative" onMouseDown={handleMouseDown}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {terminalTabs.map((tab) => {
          const workspace = workspaces.find(
            (w) => w.id === tab.workspaceId,
          ) as Workspace | undefined;
          if (!workspace) return null;
          return (
            <TerminalPanel
              key={tab.id}
              tab={tab}
              workspace={workspace}
              active={tab.id === columnActiveId}
            />
          );
        })}
      </div>
    </div>
  );
}
