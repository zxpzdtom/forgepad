import { useState } from "react";
import { Bot, Play, Settings, TerminalSquare } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";
import { agentPresetIcon } from "./AgentIcons";
import { RunSetupDialog } from "./RunSetupDialog";
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
  const [runSetupOpen, setRunSetupOpen] = useState(false);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const enabledPresets = settings.agentPresets.filter(
    (preset) => preset.enabled,
  );

  const handleRun = () => {
    if (settings.runCommand?.trim()) {
      void createTerminal(
        activeWorkspaceId ?? undefined,
        settings.runCommand.trim(),
      );
    } else {
      setRunSetupOpen(true);
    }
  };

  const handleRunEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    setRunSetupOpen(true);
  };

  const handleRunSetupSave = (command: string) => {
    updateSettings({ runCommand: command });
    setRunSetupOpen(false);
    void createTerminal(activeWorkspaceId ?? undefined, command);
  };

  const handleRunSetupSaveOnly = (command: string) => {
    updateSettings({ runCommand: command });
    setRunSetupOpen(false);
  };

  const handleRunSetupClear = () => {
    updateSettings({ runCommand: undefined });
    setRunSetupOpen(false);
  };

  return (
    <>
      <div className="agent-quickbar flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-surface-toolbar px-3">
        <button
          className="icon-button small border-transparent"
          type="button"
          title="设置"
          onClick={() => useAppStore.setState({ settingsOpen: true })}
        >
          <Settings size={15} />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none scroll-mask-x">
          {enabledPresets.map((preset) => (
            <button
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45${
                preset.command === settings.defaultAgentCommand
                  ? " border-accent/45 bg-accent-surface text-text"
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

        <button
          className="secondary-button min-h-7"
          type="button"
          title={
            settings.runCommand?.trim()
              ? `运行: ${settings.runCommand}\n右键点击编辑`
              : "配置并运行项目"
          }
          disabled={!activeWorkspaceId}
          onClick={handleRun}
          onContextMenu={handleRunEdit}
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

      {runSetupOpen && (
        <RunSetupDialog
          initialCommand={settings.runCommand}
          onSave={handleRunSetupSave}
          onSaveOnly={handleRunSetupSaveOnly}
          onClear={
            settings.runCommand?.trim() ? handleRunSetupClear : undefined
          }
          onClose={() => setRunSetupOpen(false)}
        />
      )}
    </>
  );
}
