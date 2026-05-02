import { useEffect, useMemo, useRef, useState } from 'react';
import { comboFromEvent, comboToDisplay, comboToString, findConflict } from '@renderer/lib/shortcut-utils';
import { useAppStore } from '@renderer/store/app-store';
import { useTranslation } from '@renderer/i18n';
import type { ShortcutActionId, ShortcutCombo } from '@shared/types';
import { DEFAULT_SHORTCUTS, SHORTCUT_DEFINITIONS } from '@shared/types';
import { RotateCcw } from 'lucide-react';

interface ShortcutRecorderProps {
  actionId: ShortcutActionId;
  currentCombo: ShortcutCombo;
}

export function ShortcutRecorder({ actionId, currentCombo }: ShortcutRecorderProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [pendingCombo, setPendingCombo] = useState<ShortcutCombo | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const shortcuts = useMemo(
    () => ({ ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) }) as Record<ShortcutActionId, ShortcutCombo>,
    [keyboardShortcuts],
  );
  const updateShortcut = useAppStore((s) => s.updateShortcut);
  const resetShortcut = useAppStore((s) => s.resetShortcut);

  const defaultCombo = DEFAULT_SHORTCUTS[actionId];
  const isModified = comboToString(currentCombo) !== comboToString(defaultCombo);

  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecording(false);
        setPendingCombo(null);
        setConflict(null);
        return;
      }

      const combo = comboFromEvent(e);
      if (!combo) return; // modifier-only, keep waiting

      const conflictAction = findConflict(combo, shortcuts, actionId);
      if (conflictAction) {
        const def = SHORTCUT_DEFINITIONS.find((d) => d.id === conflictAction);
        setConflict(def?.label ?? conflictAction);
        setPendingCombo(combo);
      } else {
        updateShortcut(actionId, combo);
        setRecording(false);
        setPendingCombo(null);
        setConflict(null);
      }
    };

    // Capture phase — intercepts before App.tsx global handler
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, shortcuts, actionId, updateShortcut]);

  // Click-outside to cancel
  useEffect(() => {
    if (!recording) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setRecording(false);
        setPendingCombo(null);
        setConflict(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [recording]);

  const handleConfirmConflict = () => {
    if (pendingCombo) {
      updateShortcut(actionId, pendingCombo);
    }
    setRecording(false);
    setPendingCombo(null);
    setConflict(null);
  };

  const handleTryAnother = () => {
    setPendingCombo(null);
    setConflict(null);
    // Stay in recording mode
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    resetShortcut(actionId);
  };

  return (
    <div ref={ref} className="flex items-center gap-2">
      {/* Conflict warning */}
      {conflict && recording && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
          <span>Used by &ldquo;{conflict}&rdquo;</span>
          <button
            type="button"
            onClick={handleConfirmConflict}
            className="underline decoration-amber-400/50 hover:text-amber-300"
          >
            Assign
          </button>
          <button type="button" onClick={handleTryAnother} className="underline decoration-zinc-500 hover:text-zinc-300">
            Retry
          </button>
        </div>
      )}

      {/* Reset button — only if modified */}
      {isModified && !recording && (
        <button
          type="button"
          onClick={handleReset}
          className="grid size-5 shrink-0 place-items-center rounded text-muted transition-colors hover:text-text"
          title="Reset to default"
        >
          <RotateCcw size={12} />
        </button>
      )}

      {/* Shortcut badge */}
      <button
        type="button"
        onClick={() => {
          setRecording(true);
          setPendingCombo(null);
          setConflict(null);
        }}
        className={`inline-flex min-w-[60px] items-center justify-center rounded-md border px-2.5 py-1 font-mono text-[11px] transition-all ${
          recording
            ? 'border-accent bg-accent/10 text-accent'
            : `border-border bg-panel-2 text-muted hover:border-zinc-500 hover:text-text ${
                isModified ? 'ring-1 ring-accent/20' : ''
              }`
        }`}
      >
        {recording ? (pendingCombo ? comboToDisplay(pendingCombo) : 'Type shortcut\u2026') : comboToDisplay(currentCombo)}
      </button>
    </div>
  );
}
