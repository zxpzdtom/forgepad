import { FileCode2, GitCompare, TerminalSquare, X, ClipboardList } from "lucide-react";
import { getTabTitle, useAppStore } from "@renderer/store/app-store";
import type { Tab } from "@shared/types";

function tabIcon(tab: Tab) {
  if (tab.type === "terminal") return <TerminalSquare size={14} />;
  if (tab.type === "diff") return <GitCompare size={14} />;
  if (tab.type === "context-preview") return <ClipboardList size={14} />;
  return <FileCode2 size={14} />;
}

export function TabBar() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const openDiffTab = useAppStore((state) => state.openDiffTab);
  const createTerminal = useAppStore((state) => state.createTerminal);

  const workspaceTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId);

  return (
    <div className="tabbar">
      <div className="tabs-scroll">
        {workspaceTabs.map((tab) => (
          <button
            className={`tab-chip ${tab.id === activeTabId ? "active" : ""}`}
            key={tab.id}
            type="button"
            title={getTabTitle(tab)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tabIcon(tab)}
            <span>{getTabTitle(tab)}</span>
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
              <X size={13} />
            </span>
          </button>
        ))}
      </div>
      <div className="tabbar-actions">
        <button
          className="icon-button"
          type="button"
          title="Open changes"
          disabled={!activeWorkspaceId}
          onClick={() => activeWorkspaceId && openDiffTab(activeWorkspaceId)}
        >
          <GitCompare size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="New terminal"
          disabled={!activeWorkspaceId}
          onClick={() => createTerminal(activeWorkspaceId ?? undefined)}
        >
          <TerminalSquare size={16} />
        </button>
      </div>
    </div>
  );
}
