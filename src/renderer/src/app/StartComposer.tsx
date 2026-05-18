import { useEffect, useRef, useState } from 'react';
import { agentPresetIcon } from '@renderer/components/AgentIcons';
import { useAppStore } from '@renderer/store/app-store';
import { Bot, Sparkles, TerminalSquare } from 'lucide-react';
import clsx from 'clsx';

interface StartComposerProps {
  workspaceId: string;
}

export function StartComposer({ workspaceId }: StartComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [taskText, setTaskText] = useState('');

  const settings = useAppStore((state) => state.settings);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const enabledPresets = settings.agentPresets.filter((p) => p.enabled);

  // Default selected preset: match current defaultAgentCommand, or first enabled preset
  const defaultPresetId =
    enabledPresets.find((p) => p.command === settings.defaultAgentCommand)?.id ?? enabledPresets[0]?.id ?? '';
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPresetId);

  // Auto-focus the textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const preset = enabledPresets.find((p) => p.id === selectedPresetId);
    const command = preset?.command ?? settings.defaultAgentCommand;
    const presetId = preset?.id;

    // Persist the selected agent as default
    if (preset) {
      updateSettings({ defaultAgentCommand: preset.command });
    }

    const ptyId = await createAgentTerminal(workspaceId, command, presetId);
    if (!ptyId) return;

    // If there's task text, write it to the PTY as the initial prompt
    if (taskText.trim()) {
      setTimeout(() => {
        window.forgepad.pty.write(ptyId, `\x1b[200~${taskText.trim()}\x1b[201~\r`);
      }, 100);
    }

    setTaskText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't submit during IME composition (Chinese/Japanese input)
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="start-composer rounded-lg border border-border bg-panel/70 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur">
      <textarea
        ref={textareaRef}
        className="block min-h-[110px] w-full resize-none bg-transparent p-5 text-[17px] text-text outline-none placeholder:text-subtle"
        value={taskText}
        onChange={(e) => setTaskText(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="描述一项任务..."
      />
      <div className="flex items-center justify-between gap-3 border-border border-t p-3">
        <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {enabledPresets.map((preset) => (
            <button
              className={clsx(
                'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
                preset.id === selectedPresetId
                  ? 'border-accent/45 bg-accent-surface text-text'
                  : 'border-transparent bg-transparent text-muted hover:bg-panel-2 hover:text-text',
              )}
              key={preset.id}
              type="button"
              onClick={() => setSelectedPresetId(preset.id)}
            >
              {agentPresetIcon(preset.id, 15) || <Bot size={15} />}
              <span>{preset.label.replace(/\s+code$/i, '').trim()}</span>
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            className="secondary-button h-8"
            type="button"
            onClick={() => createTerminal(workspaceId)}
          >
            <TerminalSquare size={15} />
            Terminal
          </button>
          <button
            className="primary-button h-8"
            type="button"
            onClick={() => void handleSubmit()}
          >
            <Sparkles size={15} />
            开始会话
          </button>
        </div>
      </div>
    </div>
  );
}
