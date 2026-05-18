import { useMemo } from 'react';
import { useTranslation } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/app-store';
import type { ContextItem, Workspace } from '@shared/types';
import { Bot, ClipboardList, Eye, FileCode2, GitCompare, MessageSquare, SendHorizontal, Trash2, X } from 'lucide-react';

function useActiveWorkspace(): Workspace | undefined {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
}

function itemTitle(item: ContextItem): string {
  if (item.type === 'file') return item.relPath;
  if (item.type === 'diff') return `${item.relPath} · ${item.bucket}`;
  if (item.type === 'task') return `${item.title} · ${item.status}`;
  if (item.type === 'selection')
    return `${item.relPath} · L${item.startLine}${item.endLine !== item.startLine ? `-L${item.endLine}` : ''}`;
  return `${item.relPath} · L${item.startLine}${item.endLine !== item.startLine ? `-L${item.endLine}` : ''}`;
}

function itemIcon(item: ContextItem) {
  if (item.type === 'file') return <FileCode2 size={15} />;
  if (item.type === 'diff') return <GitCompare size={15} />;
  if (item.type === 'task') return <ClipboardList size={15} />;
  if (item.type === 'selection') return <MessageSquare size={15} />;
  return <MessageSquare size={15} />;
}

export function ContextPanel() {
  const { t } = useTranslation();
  const workspace = useActiveWorkspace();
  const contextItems = useAppStore((state) => state.contextItems);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const items = useMemo(
    () => contextItems.filter((item) => item.workspaceId === activeWorkspaceId),
    [contextItems, activeWorkspaceId],
  );
  const settings = useAppStore((state) => state.settings);
  const composerText = useAppStore((state) => state.composerText);
  const lastBundle = useAppStore((state) => state.lastBundle);
  const removeContextItem = useAppStore((state) => state.removeContextItem);
  const clearWorkspaceContext = useAppStore((state) => state.clearWorkspaceContext);
  const setComposerText = useAppStore((state) => state.setComposerText);
  const updateFileNote = useAppStore((state) => state.updateFileNote);
  const updateFileIncludeContent = useAppStore((state) => state.updateFileIncludeContent);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const sendContextToTerminal = useAppStore((state) => state.sendContextToTerminal);
  const openContextPreviewTab = useAppStore((state) => state.openContextPreviewTab);
  const enabledPresets = settings.agentPresets.filter((p) => p.enabled);
  const selectedAgentPreset = enabledPresets.find((preset) => preset.command === settings.defaultAgentCommand)?.id ?? 'custom';

  if (!workspace) {
    return <div className="grid min-h-[90px] place-items-center text-muted">{t('context.openProjectFirst')}</div>;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-2.5">
      <div className="grid gap-2">
        <textarea
          className="composer-textarea"
          value={composerText}
          onChange={(event) => setComposerText(event.currentTarget.value)}
          placeholder={t('context.askAgent')}
        />
        <label className="grid min-h-8 grid-cols-[16px_auto_minmax(92px,128px)_minmax(0,1fr)] items-center gap-2 text-muted text-xs">
          <Bot size={15} />
          <span>{t('context.agent')}</span>
          <select
            className="toolbar-select agent-preset-select"
            value={selectedAgentPreset}
            onChange={(event) => {
              const preset = enabledPresets.find((item) => item.id === event.currentTarget.value);
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
          <input
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={settings.defaultAgentCommand}
            onChange={(event) => updateSettings({ defaultAgentCommand: event.currentTarget.value })}
            placeholder="codex"
          />
        </label>
        <div className="flex items-center justify-between text-muted text-xs">
          <span>
            {items.length} context item{items.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-1.5">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                const tab = useAppStore
                  .getState()
                  .tabs.find((t) => t.workspaceId === useAppStore.getState().activeWorkspaceId && t.type === 'terminal');
                if (!tab || tab.type !== 'terminal') {
                  useAppStore.getState().addToast('error', 'No terminal tab found.');
                  return;
                }
                const text = 'Hello from ForgePad! This is a test message.';
                window.forgepad.pty.write(tab.ptyId, `\x1b[200~${text}\x1b[201~\r`);
                useAppStore.getState().addToast('success', 'Test sent to terminal.');
              }}
            >
              Send Test
            </button>
            <button className="primary-button" type="button" onClick={sendContextToTerminal}>
              <SendHorizontal size={16} />
              Send
            </button>
          </div>
        </div>
      </div>

      {lastBundle ? (
        <div className="grid gap-[3px] rounded-lg border border-border bg-surface-card p-2">
          <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{lastBundle.relPath}</strong>
          <span className="text-muted text-xs">{lastBundle.estimatedTokens.toLocaleString()} tokens est.</span>
          <button className="secondary-button" type="button" onClick={() => openContextPreviewTab(workspace.id)}>
            <Eye size={15} />
            Preview Bundle
          </button>
        </div>
      ) : null}

      <div className="scrollbar-thin scroll-mask-y flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto">
        {items.length === 0 ? (
          <div className="grid min-h-[52px] place-items-center text-muted">
            Select files, diffs, or diff ranges to build context
          </div>
        ) : (
          items.map((item) => (
            <article className="grid gap-2 rounded-lg border border-border bg-surface-card p-[9px]" key={item.id}>
              <div className="flex items-center gap-2">
                {itemIcon(item)}
                <strong
                  className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
                  title={itemTitle(item)}
                >
                  {itemTitle(item)}
                </strong>
                <button className="icon-button small" type="button" title="Remove" onClick={() => removeContextItem(item.id)}>
                  <X size={14} />
                </button>
              </div>
              {item.type === 'selection' ? (
                <>
                  <p className="m-0 text-muted text-sm leading-relaxed">{item.text}</p>
                  <pre className="context-selection-snippet">{item.selectedText}</pre>
                </>
              ) : item.type === 'comment' ? (
                <p className="m-0 text-muted text-sm leading-relaxed">{item.text}</p>
              ) : item.type === 'task' ? (
                <>
                  <p className="m-0 text-muted text-sm leading-relaxed">{item.description || 'No task description provided.'}</p>
                  <textarea
                    className="context-textarea"
                    value={item.note ?? ''}
                    onChange={(event) => updateFileNote(item.id, event.currentTarget.value)}
                    placeholder="Optional note for this task"
                  />
                </>
              ) : item.type === 'file' ? (
                <>
                  <label className="inline-flex items-center gap-2 text-muted text-xs">
                    <input
                      type="checkbox"
                      checked={item.includeContent}
                      onChange={(event) => updateFileIncludeContent(item.id, event.currentTarget.checked)}
                      className="accent-accent"
                    />
                    <span>{item.includeContent ? 'Include file contents' : 'Reference path only'}</span>
                  </label>
                  <textarea
                    className="context-textarea"
                    value={item.note ?? ''}
                    onChange={(event) => updateFileNote(item.id, event.currentTarget.value)}
                    placeholder="Optional note for this file"
                  />
                </>
              ) : (
                <textarea
                  className="context-textarea"
                  value={item.note ?? ''}
                  onChange={(event) => updateFileNote(item.id, event.currentTarget.value)}
                  placeholder="Optional note for this item"
                />
              )}
            </article>
          ))
        )}
      </div>

      <button
        className="secondary-button w-full text-danger"
        type="button"
        disabled={items.length === 0}
        onClick={() => clearWorkspaceContext(workspace.id)}
      >
        <Trash2 size={15} />
        Clear Context
      </button>
    </section>
  );
}
