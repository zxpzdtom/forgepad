import { useCallback, useEffect, useRef, useState } from 'react';
import type { Tab } from '@shared/types';

type TabContextMenuProps = {
  tab: Tab;
  workspacePath?: string;
  x: number;
  y: number;
  onClose: () => void;
  onCloseTab: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseAll: (workspaceId: string, type: 'terminal' | 'file') => void;
  onCloseToRight: (id: string) => void;
  onRename?: (id: string) => void;
};

type MenuAction = {
  label: string;
  shortcut?: string;
  danger?: boolean;
  action: () => void;
};

export function TabContextMenu({
  tab,
  workspacePath,
  x,
  y,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  onCloseToRight,
  onRename,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  const isFileType = tab.type === 'file';
  const isTerminalType = tab.type === 'terminal';
  const fullPath = workspacePath && isFileType ? `${workspacePath}/${tab.relPath}` : null;

  // Build menu sections
  const sections: (MenuAction | 'divider')[] = [];

  if (tab.type === 'terminal' && onRename) {
    sections.push({
      label: 'Rename',
      action: () => {
        onRename(tab.id);
        onClose();
      },
    });
    sections.push('divider');
  }

  sections.push(
    {
      label: 'Close',
      shortcut: '⌘W',
      action: () => {
        onCloseTab(tab.id);
        onClose();
      },
    },
    {
      label: 'Close Others',
      action: () => {
        onCloseOthers(tab.id);
        onClose();
      },
    },
    {
      label: 'Close to Right',
      action: () => {
        onCloseToRight(tab.id);
        onClose();
      },
    },
    {
      label: 'Close All',
      action: () => {
        onCloseAll(tab.workspaceId, isTerminalType ? 'terminal' : 'file');
        onClose();
      },
    },
  );

  if (isFileType) {
    sections.push('divider');
    sections.push({
      label: 'Copy Path',
      action: () => {
        if (fullPath) void navigator.clipboard.writeText(fullPath);
        onClose();
      },
    });
    sections.push({
      label: 'Copy Relative Path',
      action: () => {
        if (isFileType) void navigator.clipboard.writeText(tab.relPath);
        onClose();
      },
    });
    sections.push({
      label: 'Reveal in Finder',
      action: () => {
        if (fullPath) void window.forgepad.shell.showItemInFolder(fullPath);
        onClose();
      },
    });
  }

  const actionItems = sections.filter((s): s is MenuAction => s !== 'divider');

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

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => (prev < actionItems.length - 1 ? prev + 1 : 0));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => (prev > 0 ? prev - 1 : actionItems.length - 1));
      }
      if (e.key === 'Enter' && focusIndex >= 0) {
        e.preventDefault();
        actionItems[focusIndex]?.action();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, focusIndex, actionItems]);

  // Viewport boundary detection — flip if overflowing
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
    <div ref={menuRef} className="anchor-menu" style={{ left: pos.left, top: pos.top }}>
      {sections.map((item, i) => {
        if (item === 'divider') {
          return <div key={`d-${i}`} className="mx-1 my-1 h-px bg-border" />;
        }
        actionIndex++;
        const idx = actionIndex;
        return (
          <button
            key={item.label}
            type="button"
            className={`flex w-full items-center rounded-[5px] border-none px-2 py-[5px] text-left text-[12px] transition-colors cursor-pointer${
              item.danger
                ? 'text-danger hover:bg-danger/10'
                : idx === focusIndex
                  ? 'bg-panel-3 text-text'
                  : 'bg-transparent text-text hover:bg-panel-3'
            }`}
            onClick={item.action}
            onMouseEnter={() => setFocusIndex(idx)}
            onMouseLeave={() => setFocusIndex(-1)}
          >
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="ml-4 text-[11px] text-subtle">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
