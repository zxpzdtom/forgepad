import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { getDroppedFileEntries, hasDraggableFiles, isInternalDrop } from '@renderer/lib/drag-utils';
import { useAppStore } from '@renderer/store/app-store';
import type { Workspace } from '@shared/types';

import { ContextPreview } from './ContextPreview';

import clsx from 'clsx';

const DiffViewer = lazy(() => import('./DiffViewer').then((module) => ({ default: module.DiffViewer })));
const loadFileEditor = () => import('./FileEditor');
const FileEditor = lazy(() => loadFileEditor().then((module) => ({ default: module.FileEditor })));

export function FileColumn() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeFileTabId = useAppStore((state) => state.activeFileTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const openFileTab = useAppStore((state) => state.openFileTab);
  const openExternalFileTab = useAppStore((state) => state.openExternalFileTab);

  const fileTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId && tab.type !== 'terminal');

  const columnActiveId = activeFileTabId ?? fileTabs[0]?.id;
  const activeFileTab = fileTabs.find((t) => t.id === columnActiveId);
  const [mountedFileTabIds, setMountedFileTabIds] = useState<Set<string>>(() => new Set());
  const visibleFileTabIds = new Set(mountedFileTabIds);
  if (activeFileTab) visibleFileTabIds.add(activeFileTab.id);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) as Workspace | undefined;

  const handleMouseDown = () => setFocusedColumn('file');

  useEffect(() => {
    const activeId = activeFileTab?.id;
    const liveFileTabIds = new Set(fileTabs.map((tab) => tab.id));
    setMountedFileTabIds((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of current) {
        if (liveFileTabIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      if (activeId && !next.has(activeId)) {
        next.add(activeId);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [activeFileTab?.id, fileTabs]);

  useEffect(() => {
    if (activeFileTab?.type !== 'file' || !activeWorkspace) return;
    void loadFileEditor().then((module) => {
      void module.preloadFilePreview?.({ tab: activeFileTab, workspace: activeWorkspace });
      const lowerPath = activeFileTab.relPath.toLowerCase();
      if (lowerPath.endsWith('.md') || lowerPath.endsWith('.markdown')) {
        module.preloadMarkdownPreview?.();
      }
    });
  }, [activeFileTab, activeWorkspace]);

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
        {/* Keep visited file/diff/context tabs mounted so switching tabs preserves loaded content and scroll state. */}
        {activeWorkspace &&
          fileTabs.map((tab) => {
            if (!visibleFileTabIds.has(tab.id)) return null;
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
