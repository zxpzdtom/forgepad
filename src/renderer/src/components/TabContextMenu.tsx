import type { Tab } from '@shared/types';
import { DEFAULT_SHORTCUTS } from '@shared/types';
import { useTranslation } from '@renderer/i18n';
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
  onCloseToLeft: (id: string) => void;
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
  onCloseToLeft,
  onCloseToRight,
  onRename,
}: TabContextMenuProps) {
  const { t } = useTranslation();
  const tabs = useAppStore((s) => s.tabs);
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const addToast = useAppStore((s) => s.addToast);
  const shortcuts = { ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) };

  const sc = (id: keyof typeof shortcuts) => comboToDisplay(shortcuts[id]);

  const isFileType = tab.type === 'file';
  const isFilePaneType = tab.type !== 'terminal';
  const isTerminalType = tab.type === 'terminal';
  const isExternal = isFileType && Boolean(tab.absPath);
  const fullPath = isExternal ? tab.absPath! : workspacePath && isFileType ? `${workspacePath}/${tab.relPath}` : null;
  const sameClosableGroup = (item: Tab) => {
    if (item.workspaceId !== tab.workspaceId) return false;
    if (isFilePaneType) return item.type !== 'terminal';
    if (item.type !== 'terminal') return false;
    return item.isAgent === tab.isAgent;
  };
  const workspaceTabs = tabs.filter((item) => item.workspaceId === tab.workspaceId);
  const tabIndex = workspaceTabs.findIndex((item) => item.id === tab.id);
  const hasTabsToLeft = tabIndex > 0 && workspaceTabs.slice(0, tabIndex).some(sameClosableGroup);
  const hasTabsToRight = tabIndex >= 0 && workspaceTabs.slice(tabIndex + 1).some(sameClosableGroup);

  const sections: ContextMenuSection[] = [];

  if (isTerminalType && onRename) {
    sections.push({
      label: t('tabMenu.rename'),
      action: () => {
        onRename(tab.id);
        onClose();
      },
    });
    sections.push('divider');
  }

  sections.push(
    {
      label: t('tabMenu.close'),
      shortcut: sc('closeTab'),
      action: () => {
        onCloseTab(tab.id);
        onClose();
      },
    },
    {
      label: t('tabMenu.closeOthers'),
      action: () => {
        onCloseOthers(tab.id);
        onClose();
      },
    },
    {
      label: t('tabMenu.closeToRight'),
      disabled: !hasTabsToRight,
      action: () => {
        onCloseToRight(tab.id);
        onClose();
      },
    },
    {
      label: t('tabMenu.closeToLeft'),
      disabled: !hasTabsToLeft,
      action: () => {
        onCloseToLeft(tab.id);
        onClose();
      },
    },
    {
      label: t('tabMenu.closeAll'),
      action: () => {
        onCloseAll(tab.workspaceId, isTerminalType ? 'terminal' : 'file');
        onClose();
      },
    },
  );

  if (isFileType) {
    sections.push('divider');
    sections.push({
      label: t('tabMenu.copyPath'),
      shortcut: sc('copyPath'),
      action: () => {
        if (fullPath) {
          void navigator.clipboard.writeText(fullPath);
          addToast('info', t('tabMenu.pathCopied'));
        }
        onClose();
      },
    });

    // "Copy Relative Path" only makes sense for workspace files
    if (!isExternal) {
      sections.push({
        label: t('tabMenu.copyRelativePath'),
        shortcut: sc('copyRelativePath'),
        action: () => {
          void navigator.clipboard.writeText(tab.relPath);
          addToast('info', t('tabMenu.relativePathCopied'));
          onClose();
        },
      });
    }

    sections.push({
      label: t('tabMenu.revealInFinder'),
      action: () => {
        if (fullPath) void window.forgepad.shell.showItemInFolder(fullPath);
        onClose();
      },
    });
  }

  return <ContextMenu sections={sections} x={x} y={y} onClose={onClose} />;
}
