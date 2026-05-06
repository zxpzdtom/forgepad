import { useTranslation } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/app-store';
import type { AgentPreset } from '@shared/types';
import { Bot } from 'lucide-react';

import { agentPresetIcon } from './AgentIcons';

function shortPresetLabel(label: string): string {
  return label.replace(/\s+code$/i, '').trim();
}

function presetIcon(preset: AgentPreset) {
  const icon = agentPresetIcon(preset.id, 15);
  if (icon) return icon;
  return <Bot size={15} />;
}

/* ── AgentQuickBar ─────────────────────────────────────────────────── */

export function AgentQuickBar() {
  const { t } = useTranslation();

  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const enabledPresets = settings.agentPresets.filter((preset) => preset.enabled);

  // Hide when no enabled presets
  if (enabledPresets.length === 0) return null;

  return (
    <div className="agent-quickbar flex h-9 shrink-0 items-center gap-1.5 border-border border-b bg-surface-toolbar px-3">
      <div className="scrollbar-none scroll-mask-x flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {enabledPresets.map((preset) => (
          <button
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              preset.command === settings.defaultAgentCommand
                ? 'border-accent/45 bg-accent-surface text-text'
                : 'border-transparent bg-transparent text-muted hover:bg-panel-2 hover:text-text'
            }`}
            key={preset.id}
            type="button"
            title={t('agent.newAgentPreset', { label: preset.label })}
            disabled={!activeWorkspaceId}
            onClick={() => {
              updateSettings({ defaultAgentCommand: preset.command });
              void createAgentTerminal(activeWorkspaceId ?? undefined, preset.command, preset.id);
            }}
          >
            {presetIcon(preset)}
            <span>{shortPresetLabel(preset.label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
