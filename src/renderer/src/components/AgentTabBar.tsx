import { useCallback, useState, type MouseEvent } from "react";
import { Bot, Plus, X } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";
import { TabContextMenu } from "./TabContextMenu";
import { agentPresetIcon } from "./AgentIcons";
import type { Tab } from "@shared/types";
import type { AgentStatus } from "@shared/agent-lifecycle";

type TerminalTab = Extract<Tab, { type: "terminal" }>;

function agentTabIcon(tab: TerminalTab) {
  if (tab.agentPresetId) {
    const icon = agentPresetIcon(tab.agentPresetId, 13);
    if (icon) return icon;
  }
  return <Bot size={13} />;
}

function StatusDot({ status }: { status: AgentStatus | undefined }) {
  if (status === "review") {
    // Green unread dot
    return (
      <span className="relative flex size-2 shrink-0">
        <span className="relative inline-flex size-2 rounded-full bg-ok" />
      </span>
    );
  }
  if (status === "permission") {
    // Amber pulsing dot — needs user input
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

  const [contextMenu, setContextMenu] = useState<{
    tab: Tab;
    x: number;
    y: number;
  } | null>(null);

  const agentTabs = tabs.filter(
    (tab): tab is TerminalTab =>
      tab.workspaceId === activeWorkspaceId &&
      tab.type === "terminal" &&
      tab.isAgent === true,
  );

  const activeId = activeAgentTabId ?? agentTabs[0]?.id;

  const handleContextMenu = useCallback((event: MouseEvent, tab: Tab) => {
    event.preventDefault();
    setContextMenu({ tab, x: event.clientX, y: event.clientY });
  }, []);

  const handleTabClick = useCallback(
    (tab: TerminalTab) => {
      setActiveTab(tab.id);
    },
    [setActiveTab],
  );

  if (agentTabs.length === 0) return null;

  return (
    <div className="column-tabbar flex h-9 shrink-0 items-center gap-1 border-b border-border bg-surface-toolbar px-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none scroll-mask-x">
        {agentTabs.map((tab) => {
          const isExited = exitedPtyIds.has(tab.ptyId);
          // Only show "working" when explicitly reported by the agent hook.
          const status: AgentStatus | undefined =
            agentStatuses[tab.ptyId] ?? (isExited ? undefined : "idle");
          const isWorking = status === "working";

          return (
            <button
              className={`group flex h-8 shrink-0 items-center gap-1.5 rounded-t-md px-2.5 text-xs transition-colors${
                tab.id === activeId
                  ? " bg-panel-3 text-text shadow-[inset_0_-2px_0_0_theme(colors.accent)]"
                  : " text-muted hover:bg-panel-2 hover:text-text"
              }`}
              key={tab.id}
              type="button"
              title={tab.title}
              onClick={() => handleTabClick(tab)}
              onContextMenu={(event) => handleContextMenu(event, tab)}
            >
              {/* Icon with working breathe animation */}
              <span
                className={`inline-flex${isWorking ? " animate-breathe" : ""}`}
              >
                {agentTabIcon(tab)}
              </span>
              <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
                {tab.title}
              </span>
              {/* Status indicator dot */}
              <StatusDot status={status} />
              <span
                className="grid size-4 place-items-center rounded text-subtle opacity-0 transition-opacity hover:bg-panel-3 hover:text-text group-hover:opacity-100 focus:opacity-100"
                role="button"
                tabIndex={0}
                title="Close agent"
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
                <X size={11} />
              </span>
            </button>
          );
        })}
      </div>

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
        />
      )}
    </div>
  );
}
