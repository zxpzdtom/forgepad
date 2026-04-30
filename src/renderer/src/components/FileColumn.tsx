import { Component, type ErrorInfo, type ReactNode } from 'react';

import { useAppStore } from '@renderer/store/app-store';
import type { Workspace } from '@shared/types';

import { BrowserTab } from './BrowserTab';
import { ContextPreview } from './ContextPreview';
import { DiffViewer } from './DiffViewer';
import { FileEditor } from './FileEditor';

/** Error boundary so a crashing BrowserTab doesn't take down the whole column */
class BrowserErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { hasError: boolean; error: string }> {
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
            <p className="text-muted text-xs">Browser component crashed</p>
            <p className="max-w-xs font-mono text-[10px] text-subtle">{this.state.error}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: '' });
                this.props.onRetry();
              }}
              className="mt-1 rounded-md bg-accent px-3 py-1.5 font-medium text-white text-xs hover:bg-accent/90"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function FileColumn() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeFileTabId = useAppStore((state) => state.activeFileTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);

  const fileTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId && tab.type !== 'terminal');

  const columnActiveId = activeFileTabId ?? fileTabs[0]?.id;
  const activeFileTab = fileTabs.find((t) => t.id === columnActiveId);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) as Workspace | undefined;

  const handleMouseDown = () => setFocusedColumn('file');

  if (fileTabs.length === 0 || !activeWorkspace) return null;

  return (
    <div className="relative flex size-full min-h-0 min-w-0 flex-col bg-bg" onMouseDown={handleMouseDown}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {fileTabs.map((tab) => {
          const isActive = tab.id === activeFileTab?.id;
          // Browser tabs stay mounted (hidden) to preserve webview state
          if (tab.type === 'browser') {
            return (
              <div key={tab.id} className="absolute inset-0" style={{ display: isActive ? 'block' : 'none' }}>
                <BrowserErrorBoundary onRetry={() => {}}>
                  <BrowserTab tab={tab} />
                </BrowserErrorBoundary>
              </div>
            );
          }
          if (!isActive) return null;
          if (tab.type === 'file') {
            return <FileEditor key={tab.id} tab={tab} workspace={activeWorkspace} />;
          }
          if (tab.type === 'diff') {
            return <DiffViewer key={tab.id} tab={tab} workspace={activeWorkspace} />;
          }
          if (tab.type === 'context-preview') {
            return <ContextPreview key={tab.id} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}
