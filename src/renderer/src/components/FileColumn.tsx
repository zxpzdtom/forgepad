import { Component, type ErrorInfo, lazy, type ReactNode, Suspense, useCallback, useRef, useState } from 'react';
import { useTranslation } from '@renderer/i18n';

import { getDroppedPaths, hasDraggableFiles, isInternalDrop } from '@renderer/lib/drag-utils';
import { useAppStore } from '@renderer/store/app-store';
import type { Workspace } from '@shared/types';

import { ContextPreview } from './ContextPreview';

import clsx from 'clsx';

const NativeBrowserTab = ({ tab }: { tab: Extract<import('@shared/types').Tab, { type: 'browser' }> }) => {
  const { t } = useTranslation();
  const openNativeWindow = useCallback(() => {
    window.forgepad.browser.openWindow?.(tab.url || 'about:blank', tab.title || 'Browser');
  }, [tab.title, tab.url]);

  return (
    <div className="flex size-full items-center justify-center bg-bg p-6 text-center">
      <div className="flex max-w-[360px] flex-col items-center gap-3">
        <p className="m-0 text-muted text-sm">{t('browser.nativeWindowOnly')}</p>
        <button type="button" className="secondary-button" onClick={openNativeWindow}>
          {t('browser.openNativeWindow')}
        </button>
      </div>
    </div>
  );
};

const BrowserTab = __FORGEPAD_NATIVE_HOST__
  ? lazy(async () => ({ default: NativeBrowserTab }))
  : lazy(() => import('./BrowserTab').then((module) => ({ default: module.BrowserTab })));
const DiffViewer = lazy(() => import('./DiffViewer').then((module) => ({ default: module.DiffViewer })));
const FileEditor = lazy(() => import('./FileEditor').then((module) => ({ default: module.FileEditor })));
const LspSymbolPeek = lazy(() => import('./LspSymbolPeek').then((module) => ({ default: module.LspSymbolPeek })));

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
  const symbolPeek = useAppStore((state) => state.symbolPeek);

  const fileTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId && tab.type !== 'terminal');

  // Keep ALL browser tabs across every workspace mounted so that webviews
  // survive workspace switches without reloading (display:none preserves state).
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

      const paths = getDroppedPaths(e);
      if (paths.length === 0) return;

      e.preventDefault();
      e.stopPropagation(); // prevent App-level fallback from also handling this

      dragCounterRef.current = 0;
      setDropHighlight(false);

      if (!activeWorkspace) return;

      // All external files open as file tabs regardless of whether they are
      // inside or outside the workspace.
      for (const absPath of paths) {
        if (absPath.startsWith(activeWorkspace.worktreePath + '/')) {
          // Inside workspace → use relPath so the tab title and tooling work normally
          const relPath = absPath.slice(activeWorkspace.worktreePath.length + 1);
          openFileTab(activeWorkspace.id, relPath);
        } else {
          // Outside workspace → open as read-only external file tab
          openExternalFileTab(activeWorkspace.id, absPath);
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
        {/* Browser tabs from ALL workspaces stay mounted to preserve webview state across workspace switches */}
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
        {/* Non-browser tabs: only render the active one in the current workspace */}
        {activeWorkspace &&
          fileTabs.map((tab) => {
            if (tab.type === 'browser') return null; // already rendered above
            const isActive = tab.id === activeFileTab?.id;
            if (!isActive) return null;
            if (tab.type === 'file') {
              return (
                <Suspense key={tab.id} fallback={null}>
                  <FileEditor tab={tab} workspace={activeWorkspace} />
                </Suspense>
              );
            }
            if (tab.type === 'diff') {
              return (
                <Suspense key={tab.id} fallback={null}>
                  <DiffViewer tab={tab} workspace={activeWorkspace} />
                </Suspense>
              );
            }
            if (tab.type === 'context-preview') {
              return <ContextPreview key={tab.id} />;
            }
            return null;
          })}
      </div>
      {symbolPeek && activeWorkspace && (
        <Suspense fallback={null}>
          <LspSymbolPeek workspace={activeWorkspace} />
        </Suspense>
      )}
    </div>
  );
}
