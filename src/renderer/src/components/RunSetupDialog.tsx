import { useEffect, useRef, useState } from 'react';
import { Check, FileJson2, Plus, Save, Trash2, X } from 'lucide-react';
import { useTranslation } from '@renderer/i18n';

import clsx from 'clsx';

interface RunCommandEntry {
  name: string;
  command: string;
}

const EMPTY_COMMAND: RunCommandEntry = { name: '', command: '' };

function hasCommandContent(entry: RunCommandEntry) {
  return entry.name.trim().length > 0 || entry.command.trim().length > 0;
}

function hasCompleteCommand(entry: RunCommandEntry) {
  return entry.name.trim().length > 0 && entry.command.trim().length > 0;
}

function withTrailingEmptyCommand(entries: RunCommandEntry[]) {
  const rows = entries
    .map((entry) => ({ name: entry.name, command: entry.command }))
    .filter(hasCommandContent);
  return [...rows, { ...EMPTY_COMMAND }];
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
  const [commands, setCommands] = useState<RunCommandEntry[]>(() => withTrailingEmptyCommand(initialCommands ?? []));
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const scripts = pkgScripts ?? [];

  const updateCommand = (index: number, patch: Partial<RunCommandEntry>) => {
    setCommands((prev) => withTrailingEmptyCommand(prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))));
  };

  const removeCommand = (index: number) => {
    setCommands((prev) => withTrailingEmptyCommand(prev.filter((_, i) => i !== index)));
  };

  const completeCommands = commands
    .filter(hasCompleteCommand)
    .map((entry) => ({ name: entry.name.trim(), command: entry.command.trim() }));
  const partialRows = commands.filter((entry) => hasCommandContent(entry) && !hasCompleteCommand(entry));
  const commandCounts = completeCommands.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.command] = (acc[entry.command] ?? 0) + 1;
    return acc;
  }, {});
  const hasDuplicateCommand = Object.values(commandCounts).some((count) => count > 1);
  const canSave = partialRows.length === 0 && !hasDuplicateCommand;

  const saveCommands = () => {
    if (!canSave) return;
    onSave(completeCommands);
  };

  const helperText =
    partialRows.length > 0
      ? t('runSetup.incompleteRows')
      : hasDuplicateCommand
        ? t('runSetup.duplicateCommands')
        : t('runSetup.helpText');

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85" onMouseDown={onClose}>
      <div
        className="flex w-[min(480px,calc(100vw-32px))] max-h-[min(560px,calc(100vh-64px))] flex-col overflow-hidden rounded-xl border border-border bg-surface-dialog shadow-[0_28px_70px_rgba(0,0,0,0.46)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex h-12 shrink-0 items-center justify-between border-border border-b px-4">
          <span className="font-[590] text-[15px] text-text">{t('runSetup.title')}</span>
          <button className="icon-button border-transparent" type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {/* ── Editable command list ── */}
            <div className="space-y-1.5">
              <label className="font-[510] text-[12px] text-subtle">{t('runSetup.commands')}</label>
              <div className="space-y-2">
                {commands.map((entry, i) => {
                  const isNewRow = i === commands.length - 1 && !hasCommandContent(entry);
                  const isDuplicate = hasCompleteCommand(entry) && commandCounts[entry.command.trim()] > 1;
                  const isIncomplete = hasCommandContent(entry) && !hasCompleteCommand(entry);

                  return (
                    <div
                      key={i}
                      className={clsx(
                        'grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)_28px] items-center gap-2 rounded-lg border bg-panel-2 p-2',
                        isDuplicate || isIncomplete ? 'border-danger/50' : 'border-border',
                      )}
                    >
                      <input
                        ref={i === 0 ? nameInputRef : undefined}
                        className="h-8 min-w-0 rounded-md border border-border bg-surface-input px-2.5 text-[12px] text-text outline-none placeholder:text-subtle/40 focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
                        value={entry.name}
                        placeholder={t('runSetup.namePlaceholder')}
                        onChange={(e) => updateCommand(i, { name: e.currentTarget.value })}
                      />
                      <input
                        className="h-8 min-w-0 rounded-md border border-border bg-surface-input px-2.5 font-mono text-[12px] text-text outline-none placeholder:text-subtle/40 focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
                        value={entry.command}
                        placeholder={t('runSetup.commandPlaceholder')}
                        onChange={(e) => updateCommand(i, { command: e.currentTarget.value })}
                      />
                      {isNewRow ? (
                        <div className="grid size-7 place-items-center text-subtle/60" title={t('runSetup.newRow')}>
                          <Plus size={14} />
                        </div>
                      ) : (
                        <button
                          className="grid size-7 place-items-center rounded-md text-subtle transition-colors hover:bg-red-500/15 hover:text-red-400"
                          type="button"
                          title={t('common.remove')}
                          onClick={() => removeCommand(i)}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className={clsx('text-[11px]', canSave ? 'text-subtle/60' : 'text-danger/80')}>{helperText}</p>
            </div>

            {/* ── From package.json ── */}
            {scripts.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <FileJson2 size={13} className="text-subtle" />
                  <span className="font-[510] text-[12px] text-subtle">{t('runSetup.fromPackageJson')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {scripts.map((s) => {
                    const isAdded = completeCommands.some((c) => c.command === s.command);
                    return (
                      <button
                        key={s.name}
                        className={clsx(
                          'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors',
                          isAdded
                            ? 'border-accent/40 bg-accent-surface text-accent'
                            : 'border-border bg-panel-2 text-muted hover:border-accent/40 hover:text-text',
                        )}
                        type="button"
                        title={s.command}
                        onClick={() => {
                          if (isAdded) {
                            setCommands((prev) => withTrailingEmptyCommand(prev.filter((c) => c.command.trim() !== s.command)));
                          } else {
                            setCommands((prev) => withTrailingEmptyCommand([...prev, { name: s.name, command: s.command }]));
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
            {completeCommands.length > 0 && (
              <button
                className="secondary-button min-h-8 text-red-400 hover:text-red-300"
                type="button"
                onClick={() => setCommands([{ ...EMPTY_COMMAND }])}
              >
                <Trash2 size={14} />
                {t('runSetup.clearAll')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button className="secondary-button h-8" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="primary-button h-8" type="button" disabled={!canSave} onClick={saveCommands}>
              <Save size={14} />
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
