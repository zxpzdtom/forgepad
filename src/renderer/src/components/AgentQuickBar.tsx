import { useRef } from "react";
import { Bot, Play, Settings, TerminalSquare } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";
import { agentPresetIcon } from "./AgentIcons";
import type { AgentPreset } from "@shared/types";

function shortPresetLabel(label: string): string {
  return label.replace(/\s+code$/i, "").trim();
}

function presetIcon(preset: AgentPreset) {
  const icon = agentPresetIcon(preset.id, 15);
  if (icon) return icon;
  return <Bot size={15} />;
}

export function AgentQuickBar() {
  const selectRef = useRef<HTMLSelectElement>(null);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const enabledPresets = settings.agentPresets.filter(
    (preset) => preset.enabled,
  );
  const selectedPreset =
    enabledPresets.find(
      (preset) => preset.command === settings.defaultAgentCommand,
    ) ?? enabledPresets[0];

  return (
    <div className="agent-quickbar flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-[#151515] px-3">
      <button
        className="icon-button small border-transparent"
        type="button"
        title="Agent presets"
        onClick={() => selectRef.current?.focus()}
      >
        <Settings size={15} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none scroll-mask-x">
        {enabledPresets.map((preset) => (
          <button
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45${
              preset.command === settings.defaultAgentCommand
                ? " border-accent/45 bg-[#172424] text-text"
                : " border-transparent bg-transparent text-muted hover:bg-panel-2 hover:text-text"
            }`}
            key={preset.id}
            type="button"
            title={`New ${preset.label} agent`}
            disabled={!activeWorkspaceId}
            onClick={() => {
              updateSettings({ defaultAgentCommand: preset.command });
              void createAgentTerminal(
                activeWorkspaceId ?? undefined,
                preset.command,
                preset.id,
              );
            }}
          >
            {presetIcon(preset)}
            <span>{shortPresetLabel(preset.label)}</span>
          </button>
        ))}
      </div>

      <select
        ref={selectRef}
        className="toolbar-select agent-preset-select compact max-[760px]:hidden"
        value={selectedPreset?.id ?? "custom"}
        disabled={!activeWorkspaceId || enabledPresets.length === 0}
        title="Default agent"
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
      </select>
      <button
        className="secondary-button min-h-7"
        type="button"
        title={`Run ${selectedPreset?.label ?? "agent"}`}
        disabled={!activeWorkspaceId || !selectedPreset}
        onClick={() =>
          void createAgentTerminal(
            activeWorkspaceId ?? undefined,
            selectedPreset?.command,
            selectedPreset?.id,
          )
        }
      >
        <Play size={15} />
        Run
      </button>
      <button
        className="icon-button"
        type="button"
        title="New terminal"
        disabled={!activeWorkspaceId}
        onClick={() => void createTerminal(activeWorkspaceId ?? undefined)}
      >
        <TerminalSquare size={15} />
      </button>
    </div>
  );
}
