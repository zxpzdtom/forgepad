import { Component, type ErrorInfo, lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@renderer/i18n';

import { getDroppedFileEntries, hasDraggableFiles, isInternalDrop } from '@renderer/lib/drag-utils';
import { useAppStore } from '@renderer/store/app-store';
import type { Workspace } from '@shared/types';

import { ContextPreview } from './ContextPreview';

import clsx from 'clsx';

const NativeBrowserTab = ({ tab }: { tab: Extract<import('@shared/types').Tab, { type: 'browser' }> }) => {
  const { t } = useTranslation();
  const openNativeWindow = useCallback(() => {
    window.forgepad.browser.openWindow?.(tab.url || 'about:blank', tab.title || 'Browser');
  }, [tab.title, tab.url]);

  useEffect(() => {
    if (!tab.url || tab.url === 'about:blank') return;
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?/i.test(tab.url)) return;
    const timer = window.setTimeout(openNativeWindow, 80);
    return () => window.clearTimeout(timer);
  }, [openNativeWindow, tab.url]);

  return (
    <div className="flex size-full flex-col bg-bg">
      <div className="flex h-9 shrink-0 items-center gap-2 border-border border-b bg-surface-toolbar px-2">
        <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-border bg-surface-search px-2 py-1 font-mono text-[11px] text-muted">
          {tab.url || 'about:blank'}
        </div>
        <button type="button" className="secondary-button h-7 min-h-7 px-2 text-xs" onClick={openNativeWindow}>
          {t('browser.openNativeWindow')}
        </button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center bg-bg p-6 text-center">
        <div className="max-w-sm text-muted text-sm">
          <div className="mb-2 font-medium text-text">{tab.title || 'Browser'}</div>
          <div className="font-mono text-[11px] text-subtle">{tab.url || 'about:blank'}</div>
          <div className="mt-3">{t('browser.nativeWindowOnly')}</div>
        </div>
      </div>
    </div>
  );
};

const BrowserTab = NativeBrowserTab;
const DiffViewer = lazy(() => import('./DiffViewer').then((module) => ({ default: module.DiffViewer })));
const FileEditor = lazy(() => import('./FileEditor').then((module) => ({ default: module.FileEditor })));

/** Error boundary so a crashing BrowserTab doesn't take down the whole column */
class BrowserErrorBoundary extends Component<
  {
    children: ReactNode;
    onRetry: () => void;
    crashMessage: string;
    reloadLabel: string;
  },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[BrowserTab crash]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex size-full items-center justify-center bg-bg">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-panel-2 text-subtle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 8v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="16" r="0.5" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
              </svg>
            </div>
            <p className="text-muted text-xs">{this.props.crashMessage}</p>
            <p className="max-w-xs font-mono text-[10px] text-subtle">{this.state.error}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: '' });
                this.props.onRetry();
              }}
              className="mt-1 rounded-md bg-accent px-3 py-1.5 font-medium text-white text-xs hover:bg-accent/90"
            >
              {this.props.reloadLabel}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function FileColumn() {
  const { t } = useTranslation();
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeFileTabId = useAppStore((state) => state.activeFileTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const openFileTab = useAppStore((state) => state.openFileTab);
  const openExternalFileTab = useAppStore((state) => state.openExternalFileTab);

  const fileTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId && tab.type !== 'terminal');

  // Keep all browser tabs across every workspace mounted so native browser
  // placeholders survive workspace switches without churn.
  const allBrowserTabs = tabs.filter((tab) => tab.type === 'browser');

  const columnActiveId = activeFileTabId ?? fileTabs[0]?.id;
  const activeFileTab = fileTabs.find((t) => t.id === columnActiveId);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) as Workspace | undefined;

  const handleMouseDown = () => setFocusedColumn('file');

  // ── External file drop: open files as tabs ────────────────────────────
  const dragCounterRef = useRef(0);
  const [dropHighlight, setDropHighlight] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only accept external OS files here — internal tree drags go to AgentColumn
    if (!isInternalDrop(e) && hasDraggableFiles(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!isInternalDrop(e) && hasDraggableFiles(e)) {
      e.preventDefault();
      dragCounterRef.current++;
      setDropHighlight(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDropHighlight(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      // Internal drags (file tree) are not handled here
      if (isInternalDrop(e)) return;

      const entries = getDroppedFileEntries(e);
      if (entries.length === 0) return;

      e.preventDefault();
      e.stopPropagation(); // prevent App-level fallback from also handling this

      dragCounterRef.current = 0;
      setDropHighlight(false);

      if (!activeWorkspace) return;

      // All external files open as file tabs regardless of whether they are
      // inside or outside the workspace.
      for (const entry of entries) {
        const absPath = entry.path;
        if (absPath.startsWith(activeWorkspace.worktreePath + '/')) {
          // Inside workspace → use relPath so the tab title and tooling work normally
          const relPath = absPath.slice(activeWorkspace.worktreePath.length + 1);
          openFileTab(activeWorkspace.id, relPath);
        } else {
          // Outside workspace → open as read-only external file tab
          openExternalFileTab(activeWorkspace.id, absPath, entry.objectUrl, entry.mimeType);
        }
      }
    },
    [activeWorkspace, openFileTab, openExternalFileTab],
  );
  // ─────────────────────────────────────────────────────────────────────

  // When there are no file tabs yet, still render the drop target so the user
  // can drag files in to open the first tab.
  return (
    <div
      className={clsx('relative flex size-full min-h-0 min-w-0 flex-col bg-bg', dropHighlight && 'drop-target-active')}
      onMouseDown={handleMouseDown}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Browser tabs from all workspaces stay mounted to preserve tab state across workspace switches */}
        {allBrowserTabs.map((tab) => {
          const isVisible = tab.workspaceId === activeWorkspaceId && tab.id === activeFileTab?.id;
          return (
            <div key={tab.id} className="absolute inset-0" style={{ display: isVisible ? 'block' : 'none' }}>
              <BrowserErrorBoundary
                onRetry={() => {}}
                crashMessage={t('fileColumn.browserCrashed')}
                reloadLabel={t('common.reload')}
              >
                <Suspense fallback={null}>
                  <BrowserTab tab={tab as Extract<import('@shared/types').Tab, { type: 'browser' }>} />
                </Suspense>
              </BrowserErrorBoundary>
            </div>
          );
        })}
        {/* Keep opened file/diff/context tabs mounted so switching tabs preserves loaded content and scroll state. */}
        {activeWorkspace &&
          fileTabs.map((tab) => {
            if (tab.type === 'browser') return null; // already rendered above
            const isActive = tab.id === activeFileTab?.id;
            const paneStyle = {
              visibility: isActive ? 'visible' : 'hidden',
              pointerEvents: isActive ? 'auto' : 'none',
              zIndex: isActive ? 1 : 0,
            } as const;
            if (tab.type === 'file') {
              return (
                <div key={tab.id} className="absolute inset-0" style={paneStyle} aria-hidden={!isActive}>
                  <Suspense fallback={null}>
                    <FileEditor tab={tab} workspace={activeWorkspace} />
                  </Suspense>
                </div>
              );
            }
            if (tab.type === 'diff') {
              return (
                <div key={tab.id} className="absolute inset-0" style={paneStyle} aria-hidden={!isActive}>
                  <Suspense fallback={null}>
                    <DiffViewer tab={tab} workspace={activeWorkspace} />
                  </Suspense>
                </div>
              );
            }
            if (tab.type === 'context-preview') {
              return (
                <div key={tab.id} className="absolute inset-0" style={paneStyle} aria-hidden={!isActive}>
                  <ContextPreview />
                </div>
              );
            }
            return null;
          })}
      </div>
    </div>
  );
}
