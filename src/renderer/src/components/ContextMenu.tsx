import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SHORTCUTS } from '@shared/types';
import { useAppStore } from '@renderer/store/app-store';
import { comboToDisplay, eventMatchesCombo } from '@renderer/lib/shortcut-utils';

import clsx from 'clsx';

export type ContextMenuItem = {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  action: () => void;
};

export type ContextMenuSection = ContextMenuItem | 'divider';

type ContextMenuProps = {
  sections: ContextMenuSection[];
  x: number;
  y: number;
  onClose: () => void;
};

export function ContextMenu({ sections, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  const actionItems = sections.filter((s): s is ContextMenuItem => s !== 'divider' && !s.disabled);

  // Click outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  // Build a map from display shortcut string → action item index
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const resolvedShortcuts = { ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) };

  // Keyboard navigation + shortcut interception
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => (prev < actionItems.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => (prev > 0 ? prev - 1 : actionItems.length - 1));
        return;
      }
      if (e.key === 'Enter' && focusIndex >= 0) {
        e.preventDefault();
        actionItems[focusIndex]?.action();
        return;
      }

      // Match keyboard event against menu items that have a shortcut
      for (const [, combo] of Object.entries(resolvedShortcuts)) {
        if (!eventMatchesCombo(e, combo)) continue;
        const display = comboToDisplay(combo);
        const matchIdx = actionItems.findIndex((item) => item.shortcut === display);
        if (matchIdx < 0) continue;

        // Intercept: prevent the global handler from also firing
        e.preventDefault();
        e.stopPropagation();

        // Flash highlight then execute
        setFocusIndex(matchIdx);
        setTimeout(() => {
          actionItems[matchIdx]?.action();
        }, 120);
        return;
      }
    };
    document.addEventListener('keydown', handleKey, true); // capture phase to beat global handler
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [onClose, focusIndex, actionItems, resolvedShortcuts]);

  // Viewport boundary detection
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (x + rect.width > vw - 8) left = x - rect.width;
    if (y + rect.height > vh - 8) top = y - rect.height;
    if (left < 4) left = 4;
    if (top < 4) top = 4;
    setPos({ left, top });
  }, [x, y]);

  let actionIndex = -1;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 grid min-w-[150px] gap-[3px] rounded-[7px] border border-border bg-panel-2 p-[5px] shadow-[0_14px_32px_rgba(0,0,0,0.22)] [animation:menu-in_120ms_ease-out]"
      style={{ left: pos.left, top: pos.top }}
    >
      {sections.map((item, i) => {
        if (item === 'divider') {
          return <div key={`d-${i}`} className="mx-1 my-1 h-px bg-border" />;
        }

        const idx = item.disabled ? -1 : ++actionIndex;
        const isFocused = idx >= 0 && idx === focusIndex;

        return (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            className={clsx(
              'flex h-7 w-full items-center gap-[7px] rounded-[5px] px-[9px] text-left disabled:cursor-not-allowed disabled:text-subtle/45',
              item.disabled
                ? 'bg-transparent'
                : item.danger
                  ? isFocused
                    ? 'bg-panel-3 text-danger'
                    : 'bg-transparent text-danger hover:bg-panel-3'
                  : isFocused
                    ? 'bg-panel-3 text-text'
                    : 'bg-transparent text-text hover:bg-panel-3',
            )}
            onClick={() => {
              if (!item.disabled) item.action();
            }}
            onMouseEnter={() => {
              if (!item.disabled) setFocusIndex(idx);
            }}
            onMouseLeave={() => setFocusIndex(-1)}
          >
            {item.icon && (
              <span
                className={clsx(
                  'flex size-4 shrink-0 items-center justify-center',
                  item.disabled ? 'text-subtle/45' : item.danger ? 'text-danger' : 'text-subtle',
                )}
              >
                {item.icon}
              </span>
            )}
            <span className="flex-1 text-[13px]">{item.label}</span>
            {item.shortcut && (
              <span className={clsx('shrink-0 text-[11px]', item.disabled ? 'text-subtle/45' : 'text-subtle')}>
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
