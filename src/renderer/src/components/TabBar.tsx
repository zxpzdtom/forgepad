import {
  Bot,
  ClipboardList,
  FileCode2,
  GitCompare,
  TerminalSquare,
  X,
} from "lucide-react";
import { getTabTitle, useAppStore } from "@renderer/store/app-store";
import { AGENT_PRESETS, type Tab } from "@shared/types";

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
  const selectedAgentPreset =
    AGENT_PRESETS.find((preset) => preset.command === settings.defaultAgentCommand)
      ?.id ?? "custom";

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
        <select
          className="toolbar-select agent-preset-select compact"
          value={selectedAgentPreset}
          disabled={!activeWorkspaceId}
          title="Agent preset"
          onChange={(event) => {
            const preset = AGENT_PRESETS.find(
              (item) => item.id === event.currentTarget.value,
            );
            if (preset) updateSettings({ defaultAgentCommand: preset.command });
          }}
        >
          {AGENT_PRESETS.map((preset) => (
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
          className="secondary-button tabbar-command-button"
          type="button"
          title={`New ${settings.defaultAgentCommand || "agent"} agent`}
          disabled={!activeWorkspaceId}
          onClick={() => createAgentTerminal(activeWorkspaceId ?? undefined)}
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
