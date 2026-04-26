import {
  Bot,
  ClipboardList,
  FileCode2,
  GitCompare,
  TerminalSquare,
  X,
} from "lucide-react";
import { getTabTitle, useAppStore } from "@renderer/store/app-store";
import type { Tab } from "@shared/types";

function tabIcon(tab: Tab) {
  if (tab.type === "terminal")
    return tab.isAgent ? <Bot size={14} /> : <TerminalSquare size={14} />;
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
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const workspaceTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId);
  const enabledPresets = settings.agentPresets.filter((p) => p.enabled);
  const selectedAgentPreset =
    enabledPresets.find(
      (preset) => preset.command === settings.defaultAgentCommand,
    )?.id ?? "custom";

  return (
    <div className="flex min-h-[42px] items-center border-b border-border bg-[#12151b]">
      <div className="flex min-w-0 flex-1 overflow-x-auto scrollbar-none">
        {workspaceTabs.map((tab) => (
          <button
            className={`grid min-w-[118px] max-w-[220px] grid-cols-[16px_minmax(0,1fr)_18px] items-center gap-2 px-2 border-r border-border-soft${tab.id === activeTabId ? " bg-panel text-text" : " bg-transparent text-muted"}`}
            key={tab.id}
            type="button"
            title={getTabTitle(tab)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tabIcon(tab)}
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{getTabTitle(tab)}</span>
            <span
              className="grid size-[18px] place-items-center rounded hover:bg-panel-3"
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
      <div className="flex items-center gap-1.5 px-2 max-[900px]:hidden">
        <select
          className="toolbar-select agent-preset-select compact"
          value={selectedAgentPreset}
          disabled={!activeWorkspaceId}
          title="Agent preset"
          onChange={(event) => {
            const preset = enabledPresets.find(
              (item) => item.id === event.currentTarget.value,
            );
            if (preset) updateSettings({ defaultAgentCommand: preset.command });
          }}
        >
          {enabledPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
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
          className="secondary-button min-h-[30px]"
          type="button"
          title={`New ${settings.defaultAgentCommand || "agent"} agent`}
          disabled={!activeWorkspaceId}
          onClick={() => {
            const preset = enabledPresets.find(
              (p) => p.command === settings.defaultAgentCommand,
            );
            createAgentTerminal(
              activeWorkspaceId ?? undefined,
              undefined,
              preset?.id,
            );
          }}
        >
          <Bot size={16} />
          Agent
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
