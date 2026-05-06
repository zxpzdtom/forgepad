import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@renderer/i18n';
import { Check, FileJson2, Plus, Save, Trash2, X } from 'lucide-react';

interface RunCommandEntry {
  name: string;
  command: string;
}

export function RunSetupDialog({
  initialCommands,
  pkgScripts,
  onSave,
  onClose,
}: {
  initialCommands?: RunCommandEntry[];
  pkgScripts?: { name: string; command: string }[];
  onSave: (commands: RunCommandEntry[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [commands, setCommands] = useState<RunCommandEntry[]>(initialCommands?.length ? [...initialCommands] : []);
  const [draftName, setDraftName] = useState('');
  const [draftCommand, setDraftCommand] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const scripts = pkgScripts ?? [];

  const addCommand = (name: string, command: string) => {
    const trimmedName = name.trim();
    const trimmedCmd = command.trim();
    if (!trimmedName || !trimmedCmd) return;
    if (commands.some((c) => c.command === trimmedCmd)) return;
    setCommands((prev) => [...prev, { name: trimmedName, command: trimmedCmd }]);
    setDraftName('');
    setDraftCommand('');
    nameInputRef.current?.focus();
  };

  const removeCommand = (index: number) => {
    setCommands((prev) => prev.filter((_, i) => i !== index));
  };

  const canAdd = draftName.trim().length > 0 && draftCommand.trim().length > 0;
  const canSave = commands.length > 0;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85" onMouseDown={onClose}>
      <div
        className="flex max-h-[min(560px,calc(100vh-64px))] w-[min(480px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-border bg-surface-dialog shadow-[0_28px_70px_rgba(0,0,0,0.46)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex h-12 shrink-0 items-center justify-between border-border border-b px-4">
          <span className="font-[590] text-[15px] text-text">Run Commands</span>
          <button className="icon-button border-transparent" type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {/* ── Command list ── */}
            {commands.length > 0 && (
              <div className="space-y-1.5">
                <label className="font-[510] text-[12px] text-subtle">Commands</label>
                <div className="space-y-1">
                  {commands.map((entry, i) => (
                    <div
                      key={`${entry.command}-${i}`}
                      className="group flex items-center gap-2.5 rounded-md border border-border bg-panel-2 px-3 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-[510] text-[13px] text-text">{entry.name}</div>
                        <div className="truncate font-mono text-[11px] text-subtle">{entry.command}</div>
                      </div>
                      <button
                        className="grid size-5 shrink-0 place-items-center rounded text-subtle opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                        type="button"
                        title="Remove"
                        onClick={() => removeCommand(i)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Add new command ── */}
            <div className="space-y-1.5">
              <label className="font-[510] text-[12px] text-subtle">Add Command</label>
              <div className="space-y-1.5">
                <input
                  ref={nameInputRef}
                  className="h-8 w-full rounded-md border border-border bg-panel-2 px-3 text-[12px] text-text outline-none placeholder:text-subtle/40 focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
                  value={draftName}
                  placeholder="Name, e.g. Dev Server"
                  onChange={(e) => setDraftName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canAdd) {
                      e.preventDefault();
                      addCommand(draftName, draftCommand);
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <input
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none placeholder:text-subtle/40 focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
                    value={draftCommand}
                    placeholder="Command, e.g. bun run dev"
                    onChange={(e) => setDraftCommand(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canAdd) {
                        e.preventDefault();
                        addCommand(draftName, draftCommand);
                      }
                    }}
                  />
                  <button
                    className="secondary-button h-8 shrink-0 px-2.5"
                    type="button"
                    disabled={!canAdd}
                    onClick={() => addCommand(draftName, draftCommand)}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-subtle/60">Fill in name and command, then click Add or press Enter</p>
            </div>

            {/* ── From package.json ── */}
            {scripts.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <FileJson2 size={13} className="text-subtle" />
                  <span className="font-[510] text-[12px] text-subtle">From package.json</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {scripts.map((s) => {
                    const isAdded = commands.some((c) => c.command === s.command);
                    return (
                      <button
                        key={s.name}
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
                          isAdded
                            ? 'border-accent/40 bg-accent-surface text-accent'
                            : 'border-border bg-panel-2 text-muted hover:border-accent/40 hover:text-text'
                        }`}
                        type="button"
                        title={s.command}
                        onClick={() => {
                          if (isAdded) {
                            setCommands((prev) => prev.filter((c) => c.command !== s.command));
                          } else {
                            setCommands((prev) => [...prev, { name: s.name, command: s.command }]);
                          }
                        }}
                      >
                        {isAdded ? (
                          <Check size={11} className="shrink-0" aria-hidden="true" />
                        ) : (
                          <Plus size={11} className="shrink-0 text-subtle" aria-hidden="true" />
                        )}
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center justify-between border-border border-t px-4 py-2.5">
          <div>
            {commands.length > 0 && (
              <button
                className="secondary-button min-h-8 text-red-400 hover:text-red-300"
                type="button"
                onClick={() => setCommands([])}
              >
                <Trash2 size={14} />
                Clear All
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button className="secondary-button h-8" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button h-8" type="button" disabled={!canSave} onClick={() => onSave(commands)}>
              <Save size={14} />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
