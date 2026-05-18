import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from '@renderer/i18n';
import type { ConsoleArg, ConsoleEntry } from './console-utils';
import { parseStyledConsole, sanitizeConsoleStyle, stringifyArg, stringifyConsoleArgs } from './console-utils';
import { Tooltip } from './Tooltip';

import clsx from 'clsx';

export type { ConsoleEntry };

type LevelFilter = 'all' | 'error' | 'warn' | 'log' | 'debug';

type Props = {
  entries: ConsoleEntry[];
  onClear: () => void;
  onSendToAgent: (entries: ConsoleEntry[]) => void;
  onExecuteScript: (script: string) => void;
  /** Hide the "Send to Agent" button (e.g. in popout browser without agent) */
  hideSendToAgent?: boolean;
};

const LEVEL_STYLE: Record<ConsoleEntry['level'], { color: string; bg: string }> = {
  log: { color: 'text-muted', bg: '' },
  warn: { color: 'text-warn', bg: 'bg-warn/[0.06]' },
  error: { color: 'text-danger', bg: 'bg-danger/[0.06]' },
  debug: { color: 'text-subtle', bg: '' },
};

// ── Arg renderer ─────────────────────────────────────────────────────────

function ArgValue({ arg }: { arg: ConsoleArg }) {
  if (arg.type === 'string') {
    return <span className="text-[#9ecbff]">&quot;{String(arg.value ?? '')}&quot;</span>;
  }
  if (arg.type === 'number' || arg.type === 'bigint') {
    return <span className="text-[#b5cea8]">{stringifyArg(arg)}</span>;
  }
  if (arg.type === 'boolean') {
    return <span className="text-[#569cd6]">{String(arg.value)}</span>;
  }
  if (arg.type === 'undefined') {
    return <span className="text-subtle">undefined</span>;
  }
  if (arg.type === 'symbol') {
    return <span className="text-[#c586c0]">{arg.description ?? 'Symbol()'}</span>;
  }
  if (arg.type === 'function') {
    return <span className="text-subtle italic">{arg.description ?? 'f()'}</span>;
  }
  if (arg.type === 'object') {
    if (arg.subtype === 'null') return <span className="text-subtle">null</span>;
    if (arg.subtype === 'regexp') return <span className="text-[#d16969]">{arg.description}</span>;
    if (arg.subtype === 'date') return <span className="text-[#ce9178]">{arg.description}</span>;
    if (arg.subtype === 'error') {
      return <span className="text-danger">{arg.description}</span>;
    }

    // Object/Array with preview
    if (arg.preview?.properties) {
      const isArray = arg.subtype === 'array' || arg.preview.subtype === 'array';
      const open = isArray ? '[' : '{';
      const close = isArray ? ']' : '}';
      return (
        <span className="text-text">
          {arg.className && !isArray && <span className="mr-1 text-[#4ec9b0]">{arg.className}</span>}
          <span className="text-subtle">{open}</span>
          {arg.preview.properties.map((prop, i) => (
            <span key={i}>
              {i > 0 && <span className="text-subtle">, </span>}
              {!isArray && <span className="text-[#9cdcfe]">{prop.name}: </span>}
              <span
                className={prop.type === 'string' ? 'text-[#9ecbff]' : prop.type === 'number' ? 'text-[#b5cea8]' : 'text-text'}
              >
                {prop.type === 'string' ? `"${prop.value}"` : (prop.value ?? prop.subtype ?? '…')}
              </span>
            </span>
          ))}
          <span className="text-subtle">{close}</span>
        </span>
      );
    }

    return <span className="text-subtle">{arg.description ?? arg.className ?? '{…}'}</span>;
  }
  return <span className="text-text">{stringifyArg(arg)}</span>;
}

/** Renders console args, handling %c styled output. */
function ConsoleArgs({ args }: { args: ConsoleArg[] }) {
  const segments = useMemo(() => parseStyledConsole(args), [args]);
  const hasStyles = segments.some((s) => s.style);

  if (hasStyles) {
    return (
      <span className="min-w-0 flex-1 break-all">
        {segments.map((seg, i) => {
          const style = seg.style ? sanitizeConsoleStyle(seg.style) : undefined;
          return (
            <span key={i} style={style}>
              {seg.text}
            </span>
          );
        })}
      </span>
    );
  }

  // No %c — render each arg with type-aware coloring
  return (
    <span className="min-w-0 flex-1 break-all">
      {args.map((arg, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <ArgValue arg={arg} />
        </span>
      ))}
    </span>
  );
}

// ── Console script input ─────────────────────────────────────────────────

function ConsoleInput({ onExecute }: { onExecute: (script: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const script = value.trim();
    if (!script) return;
    historyRef.current = [script, ...historyRef.current.slice(0, 99)];
    historyIdxRef.current = -1;
    setValue('');
    onExecute(script);
  }, [value, onExecute]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.min(historyIdxRef.current + 1, historyRef.current.length - 1);
        historyIdxRef.current = next;
        setValue(historyRef.current[next] ?? '');
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = historyIdxRef.current - 1;
        if (next < 0) {
          historyIdxRef.current = -1;
          setValue('');
        } else {
          historyIdxRef.current = next;
          setValue(historyRef.current[next] ?? '');
        }
      }
    },
    [commit],
  );

  // Auto-focus input when the panel mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex h-[34px] shrink-0 items-center gap-1.5 border-border border-t bg-panel px-2">
      <span className="select-none font-mono text-[13px] text-accent">›</span>
      <input
        ref={inputRef}
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        value={value}
        onChange={(e) => {
          historyIdxRef.current = -1;
          setValue(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={t('browserConsole.inputPlaceholder')}
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-text outline-none placeholder:text-subtle"
      />
      <Tooltip label={t('browserConsole.runScript')}>
        <button
          type="button"
          onClick={commit}
          disabled={!value.trim()}
          className="flex h-[22px] items-center rounded px-1.5 text-[11px] text-subtle transition-colors hover:text-muted disabled:opacity-30"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 3l9 5-9 5V3z" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}

// ── Level badge ──────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: ConsoleEntry['level'] }) {
  const labels: Record<string, string> = {
    log: 'LOG',
    warn: 'WRN',
    error: 'ERR',
    debug: 'DBG',
  };
  const { color } = LEVEL_STYLE[level];
  return (
    <span className={clsx('inline-flex w-[28px] shrink-0 justify-center font-mono text-[10px] font-semibold', color)}>
      {labels[level]}
    </span>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────

export function BrowserConsolePanel({ entries, onClear, onSendToAgent, onExecuteScript, hideSendToAgent }: Props) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  const prevCountRef = useRef(entries.length);
  if (entries.length > prevCountRef.current && listRef.current) {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }
  prevCountRef.current = entries.length;

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (levelFilter !== 'all') {
      result = result.filter((e) => e.level === levelFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) => stringifyConsoleArgs(e.args).toLowerCase().includes(q));
    }
    return result;
  }, [entries, levelFilter, searchQuery]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allFilteredIds = filteredEntries.map((e) => e.id);
      const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of allFilteredIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...allFilteredIds]);
    });
  }, [filteredEntries]);

  const handleSend = useCallback(() => {
    if (selectedIds.size === 0) return;
    const selected = entries.filter((e) => selectedIds.has(e.id));
    onSendToAgent(selected);
    setSelectedIds(new Set());
  }, [selectedIds, entries, onSendToAgent]);

  const handleClear = useCallback(() => {
    setSelectedIds(new Set());
    onClear();
  }, [onClear]);

  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, log: 0, debug: 0 };
    for (const e of entries) c[e.level]++;
    return c;
  }, [entries]);

  const allFilteredSelected = filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.has(e.id));

  return (
    <section className="flex size-full min-h-0 flex-col bg-panel">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="surface-toolbar flex h-9 shrink-0 items-center gap-1.5 border-border border-b px-2">
        {/* Title */}
        <span className="mr-0.5 font-medium text-muted text-[13px] select-none">{t('browserConsole.title')}</span>

        {/* Level filter pills — segmented control style */}
        <div className="segmented-control" role="radiogroup">
          {(['all', 'error', 'warn', 'log', 'debug'] as const).map((level) => {
            const isActive = levelFilter === level;
            const count = level === 'all' ? entries.length : counts[level];
            const levelColor = level === 'error' ? 'text-danger' : level === 'warn' ? 'text-warn' : '';
            return (
              <span
                key={level}
                role="radio"
                aria-checked={isActive}
                tabIndex={0}
                onClick={() => setLevelFilter(level)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setLevelFilter(level);
                  }
                }}
                className={isActive ? 'active' : ''}
              >
                {t(`browserConsole.${level}` as any)}
                {count > 0 && level !== 'all' && (
                  <span className={clsx('ml-1 font-mono text-[10px]', isActive ? levelColor || 'text-subtle' : 'opacity-50')}>
                    {count}
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {/* Search filter */}
        <div className="relative ml-1 flex items-center">
          <svg className="pointer-events-none absolute left-2 text-subtle" width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('browserConsole.filterPlaceholder')}
            className="h-[26px] w-36 rounded-[4px] border border-border bg-surface-input pl-7 pr-5 text-text text-[12px] transition-all placeholder:text-[12px] placeholder:text-subtle focus:w-48 focus:border-accent focus:outline-none"
          />
          {searchQuery && (
            <span
              role="button"
              tabIndex={0}
              onClick={() => setSearchQuery('')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearchQuery('');
              }}
              className="absolute right-1.5 text-subtle hover:text-muted"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Select all */}
        {!hideSendToAgent && filteredEntries.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={toggleSelectAll}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') toggleSelectAll();
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-subtle text-[12px] transition-colors hover:text-muted"
          >
            {allFilteredSelected ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect
                  x="1.5"
                  y="1.5"
                  width="13"
                  height="13"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  fill="currentColor"
                  fillOpacity="0.15"
                />
                <path
                  d="M4.5 8.5l2.5 2.5 4.5-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            )}
            <span className="select-none">
              {allFilteredSelected ? t('browserConsole.deselect') : t('browserConsole.selectAll')}
            </span>
          </span>
        )}

        {/* Send to Agent */}
        {!hideSendToAgent && (
          <span
            role="button"
            tabIndex={0}
            onClick={selectedIds.size > 0 ? handleSend : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && selectedIds.size > 0) handleSend();
            }}
            className={[
              'flex h-[26px] items-center gap-1 rounded-[4px] px-2.5 font-medium text-[12px] transition-colors select-none',
              selectedIds.size > 0
                ? 'bg-accent text-white hover:bg-accent/90 active:bg-accent/80'
                : 'cursor-not-allowed bg-accent/40 text-white/50',
            ].join(' ')}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path
                d="M14 2L2 7.5l4.5 2L10 5l-3.5 5.5L9 14.5 14 2z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
            {selectedIds.size > 0 ? t('browserConsole.sendCount', { count: selectedIds.size }) : t('common.send')}
          </span>
        )}

        {/* Clear */}
        <Tooltip label={t('browserConsole.clearConsole')} position="bottom">
          <span
            role="button"
            tabIndex={0}
            onClick={entries.length > 0 ? handleClear : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && entries.length > 0) handleClear();
            }}
            className={[
              'flex size-[26px] items-center justify-center rounded-[4px] transition-colors',
              entries.length > 0
                ? 'text-danger/70 hover:text-danger'
                : 'cursor-not-allowed text-subtle opacity-40',
            ].join(' ')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3.75 12.25L12.25 3.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </span>
        </Tooltip>
      </div>

      {/* ── Log entries ─────────────────────────────────────────────── */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        {filteredEntries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-subtle">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" className="opacity-25">
              <rect x="4" y="6" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 14l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="15" y1="20" x2="22" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[11px]">
              {entries.length === 0
                ? t('browserConsole.noOutput')
                : searchQuery
                  ? t('browserConsole.noMatching')
                  : t('browserConsole.noEntries', { level: levelFilter })}
            </span>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const isSelected = selectedIds.has(entry.id);
            const { bg } = LEVEL_STYLE[entry.level];
            const isInput = entry.source === 'input';
            const isResult = entry.source === 'result';
            const isScriptEntry = isInput || isResult;
            return (
              <div
                key={entry.id}
                onClick={() => !isScriptEntry && toggleSelect(entry.id)}
                className={[
                  'group flex items-baseline gap-1.5 border-border/40 border-b px-2 py-[4px] font-mono text-[12px] leading-[18px] transition-colors',
                  isScriptEntry
                    ? 'bg-accent/[0.03]'
                    : isSelected
                      ? 'bg-accent/[0.08]'
                      : `hover:bg-white/[0.03] ${bg}`,
                ].join(' ')}
              >
                {/* Checkbox (hidden for script i/o entries) */}
                {isScriptEntry ? (
                  <span className="flex size-[14px] shrink-0 items-center justify-center" />
                ) : (
                  <div
                    className={[
                      'relative top-[2px] flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border transition-colors',
                      isSelected ? 'border-accent bg-accent' : 'border-subtle/40 group-hover:border-muted',
                    ].join(' ')}
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 10 10"
                      fill="none"
                      className={isSelected ? 'opacity-100' : 'opacity-0'}
                    >
                      <path
                        d="M2 5.5l2.5 2.5L8 3"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}

                {/* Prefix: › for input, ‹ for result, badge for page logs */}
                {isInput ? (
                  <span className="inline-flex w-[28px] shrink-0 justify-center font-mono text-[13px] font-semibold text-accent">
                    ›
                  </span>
                ) : isResult ? (
                  <span className="inline-flex w-[28px] shrink-0 justify-center font-mono text-[13px] text-subtle">‹</span>
                ) : (
                  <LevelBadge level={entry.level} />
                )}

                {/* Message content */}
                <ConsoleArgs args={entry.args} />

                {/* Timestamp */}
                <span className="shrink-0 text-[10px] text-subtle opacity-0 transition-opacity group-hover:opacity-100">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* ── Script input ─────────────────────────────────────────────── */}
      <ConsoleInput onExecute={onExecuteScript} />
    </section>
  );
}
