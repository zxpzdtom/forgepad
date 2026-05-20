import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { getDroppedPaths, hasDraggableFiles, quotePathForShell } from '@renderer/lib/drag-utils';
import { useAppStore } from '@renderer/store/app-store';
import type { Workspace } from '@shared/types';
import clsx from 'clsx';

import { AgentChatPanel } from './AgentChatPanel';

const TerminalPanel = lazy(() => import('./TerminalPanel').then((module) => ({ default: module.TerminalPanel })));

export function AgentColumn() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeAgentTabId = useAppStore((state) => state.activeAgentTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const agentDisplayMode = useAppStore((state) => state.settings.agentDisplayMode);
  const [dropHighlight, setDropHighlight] = useState(false);
  const dragCounterRef = useRef(0);

  const terminalTabs = tabs.filter(
    (tab) => tab.workspaceId === activeWorkspaceId && tab.type === 'terminal' && tab.isAgent === true,
  );

  const columnActiveId = activeAgentTabId ?? terminalTabs[0]?.id;

  const handleMouseDown = () => setFocusedColumn('agent');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (hasDraggableFiles(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (hasDraggableFiles(e)) {
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
      e.preventDefault();
      dragCounterRef.current = 0;
      setDropHighlight(false);

      const paths = getDroppedPaths(e);
      if (paths.length === 0) return;

      e.stopPropagation(); // prevent outer fallback handler from firing
      const activeTab = terminalTabs.find((t) => t.id === columnActiveId);
      if (activeTab?.type === 'terminal' && activeTab.agentTransport !== 'cli') {
        // Write path(s) to the active agent terminal (no Enter — user decides).
        window.forgepad.pty.write(activeTab.ptyId, paths.map(quotePathForShell).join(' '));
      }
    },
    [terminalTabs, columnActiveId],
  );

  if (terminalTabs.length === 0) return null;

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
        {terminalTabs
          .filter((tab) => agentDisplayMode === 'ui' || tab.agentTransport === 'cli')
          .map((tab) => {
            if (tab.id !== columnActiveId) return null;
            const workspace = workspaces.find((w) => w.id === tab.workspaceId) as Workspace | undefined;
            if (!workspace) return null;
            return <AgentChatPanel key={`chat-${tab.id}`} tab={tab} workspace={workspace} active={true} />;
          })}
        {terminalTabs
          .filter((tab) => tab.agentTransport !== 'cli')
          .map((tab) => {
            const workspace = workspaces.find((w) => w.id === tab.workspaceId) as Workspace | undefined;
            if (!workspace) return null;
            return (
              <div
                key={tab.id}
                className={clsx(
                  'absolute inset-0',
                  agentDisplayMode === 'ui' && 'pointer-events-none opacity-0',
                  agentDisplayMode === 'terminal' && tab.id !== columnActiveId && 'pointer-events-none opacity-0',
                )}
                aria-hidden={agentDisplayMode !== 'terminal' || tab.id !== columnActiveId}
              >
                <Suspense fallback={null}>
                  <TerminalPanel
                    tab={tab}
                    workspace={workspace}
                    active={agentDisplayMode === 'terminal' && tab.id === columnActiveId}
                  />
                </Suspense>
              </div>
            );
          })}
      </div>
    </div>
  );
}
