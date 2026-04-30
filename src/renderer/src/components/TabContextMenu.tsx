import type { Tab } from '@shared/types';
import { DEFAULT_SHORTCUTS } from '@shared/types';
import { useAppStore } from '@renderer/store/app-store';
import { comboToDisplay } from '@renderer/lib/shortcut-utils';
import { ContextMenu, type ContextMenuSection } from './ContextMenu';

/* ── Component ─── */

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
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const addToast = useAppStore((s) => s.addToast);
  const shortcuts = { ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) };

  const sc = (id: keyof typeof shortcuts) => comboToDisplay(shortcuts[id]);

  const isFileType = tab.type === 'file';
  const isTerminalType = tab.type === 'terminal';
  const isExternal = isFileType && Boolean(tab.absPath);
  const fullPath = isExternal
    ? tab.absPath!
    : workspacePath && isFileType
      ? `${workspacePath}/${tab.relPath}`
      : null;

  const sections: ContextMenuSection[] = [];

  if (isTerminalType && onRename) {
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
      shortcut: sc('closeTab'),
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
      shortcut: sc('copyPath'),
      action: () => {
        if (fullPath) {
          void navigator.clipboard.writeText(fullPath);
          addToast('info', 'Path copied');
        }
        onClose();
      },
    });

    // "Copy Relative Path" only makes sense for workspace files
    if (!isExternal) {
      sections.push({
        label: 'Copy Relative Path',
        shortcut: sc('copyRelativePath'),
        action: () => {
          void navigator.clipboard.writeText(tab.relPath);
          addToast('info', 'Relative path copied');
          onClose();
        },
      });
    }

    sections.push({
      label: 'Reveal in Finder',
      action: () => {
        if (fullPath) void window.forgepad.shell.showItemInFolder(fullPath);
        onClose();
      },
    });
  }

  return <ContextMenu sections={sections} x={x} y={y} onClose={onClose} />;
}
