import {
  Bot,
  TerminalSquare,
  X,
} from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";
import { TerminalPanel } from "./TerminalPanel";
import type { Tab, Workspace } from "@shared/types";

type TerminalTab = Extract<Tab, { type: "terminal" }>;

function tabIcon(tab: TerminalTab) {
  return tab.isAgent ? <Bot size={13} /> : <TerminalSquare size={13} />;
}

export function AgentColumn() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeAgentTabId = useAppStore((state) => state.activeAgentTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);

  const terminalTabs = tabs.filter(
    (tab) =>
      tab.workspaceId === activeWorkspaceId && tab.type === "terminal",
  );

  const columnActiveId = activeAgentTabId ?? terminalTabs[0]?.id;

  const enabledPresets = settings.agentPresets.filter((p) => p.enabled);
  const selectedPreset =
    enabledPresets.find(
      (p) => p.command === settings.defaultAgentCommand,
    )?.id ?? "custom";

  const handleMouseDown = () => setFocusedColumn("agent");

  if (terminalTabs.length === 0) return null;

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col bg-bg relative" onMouseDown={handleMouseDown}>
      <div className="flex h-[42px] shrink-0 items-center gap-1 overflow-hidden border-b border-border bg-bg px-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none">
          {terminalTabs.map((tab) => (
            <button
              className={`flex items-center gap-[5px] whitespace-nowrap rounded-[5px] px-2 py-1 text-xs border-none min-w-0 cursor-pointer${tab.id === columnActiveId ? " bg-[var(--surface)] text-[var(--fg)]" : " bg-transparent text-muted hover:bg-[var(--hover)] hover:text-[var(--fg)]"}`}
              key={tab.id}
              type="button"
              title={tab.title}
              onClick={() => setActiveTab(tab.id)}
            >
              {tabIcon(tab)}
              <span>{tab.title}</span>
              <span
                className="flex size-4 items-center justify-center rounded-[3px] bg-transparent text-muted opacity-0 transition-opacity duration-100 cursor-pointer border-none p-0 hover:bg-[var(--hover)] hover:text-[var(--fg)]"
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
        <div className="flex shrink-0 items-center gap-0.5">
          <select
            className="toolbar-select agent-preset-select compact"
            value={selectedPreset}
            title="Agent preset"
            onChange={(event) => {
              const preset = enabledPresets.find(
                (p) => p.id === event.currentTarget.value,
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
            className="icon-button small"
            type="button"
            title="New agent"
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
            <Bot size={14} />
          </button>
          <button
            className="icon-button small"
            type="button"
            title="New terminal"
            onClick={() => createTerminal(activeWorkspaceId ?? undefined)}
          >
            <TerminalSquare size={14} />
          </button>
        </div>
      </div>
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
