import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import type { Workspace } from '@shared/types';

import { TerminalPanel } from './TerminalPanel';

export function AgentColumn() {
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeAgentTabId = useAppStore((state) => state.activeAgentTabId);
  const workspaces = useAppStore((state) => state.workspaces);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const [dropHighlight, setDropHighlight] = useState(false);
  const dragCounterRef = useRef(0);

  const terminalTabs = tabs.filter(
    (tab) => tab.workspaceId === activeWorkspaceId && tab.type === 'terminal' && tab.isAgent === true,
  );

  const columnActiveId = activeAgentTabId ?? terminalTabs[0]?.id;

  const handleMouseDown = () => setFocusedColumn('agent');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-forgepad-path')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-forgepad-path')) {
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

      const path = e.dataTransfer.getData('application/x-forgepad-path') || e.dataTransfer.getData('text/plain');
      if (!path) return;

      // Write path to the active agent terminal (no Enter — user decides)
      e.stopPropagation(); // prevent outer fallback handler from firing
      const activeTab = terminalTabs.find((t) => t.id === columnActiveId);
      if (activeTab?.type === 'terminal') {
        window.forgepad.pty.write(activeTab.ptyId, path);
      }
    },
    [terminalTabs, columnActiveId],
  );

  if (terminalTabs.length === 0) return null;

  return (
    <div
      className={`flex size-full min-h-0 min-w-0 flex-col bg-bg relative${dropHighlight ? 'drop-target-active' : ''}`}
      onMouseDown={handleMouseDown}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {terminalTabs.map((tab) => {
          const workspace = workspaces.find((w) => w.id === tab.workspaceId) as Workspace | undefined;
          if (!workspace) return null;
          return <TerminalPanel key={tab.id} tab={tab} workspace={workspace} active={tab.id === columnActiveId} />;
        })}
      </div>
    </div>
  );
}
