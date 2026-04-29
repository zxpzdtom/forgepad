import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileTreeContextMenuItem, GitStatusEntry } from '@pierre/trees';
import { FileTree, useFileTree, useFileTreeSelection } from '@pierre/trees/react';
import { useResolvedTheme } from '@renderer/App';
import { useAppStore } from '@renderer/store/app-store';
import type { FileNode, Workspace } from '@shared/types';

import { Spinner } from './Spinner';

type TreeData = {
  paths: string[];
  filePaths: Set<string>;
  gitStatus: GitStatusEntry[];
};

function walk(nodes: FileNode[], rootPath: string, result: TreeData) {
  for (const node of nodes) {
    const rel = node.path.startsWith(rootPath)
      ? node.path.slice(rootPath.length).replace(/^\/+/, '').replaceAll('\\', '/')
      : node.path;
    if (node.type === 'file' && rel) {
      if (node.gitStatus === 'deleted') continue;
      result.paths.push(rel);
      result.filePaths.add(rel);
      if (node.gitStatus) {
        result.gitStatus.push({
          path: rel,
          status: node.gitStatus === 'conflicted' ? 'modified' : node.gitStatus,
        });
      }
    }
    if (node.children) walk(node.children, rootPath, result);
  }
}

function treeDataFromNodes(nodes: FileNode[], rootPath: string): TreeData {
  const result: TreeData = { paths: [], filePaths: new Set(), gitStatus: [] };
  walk(nodes, rootPath.replace(/\/+$/, ''), result);
  result.paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return result;
}

function filesForTreePath(treeData: TreeData, treePath: string): string[] {
  if (treeData.filePaths.has(treePath)) return [treePath];
  const prefix = `${treePath.replace(/\/+$/, '')}/`;
  return [...treeData.filePaths].filter((filePath) => filePath.startsWith(prefix));
}

function filesForTreeSelection(treeData: TreeData, selectedPaths: string[]) {
  const files = new Set<string>();
  for (const selectedPath of selectedPaths) {
    for (const filePath of filesForTreePath(treeData, selectedPath)) {
      files.add(filePath);
    }
  }
  return [...files].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function sameStringArray(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function useActiveWorkspace(): Workspace | undefined {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
}

const TREE_THEME_SHARED = {
  '--trees-font-family-override': 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  '--trees-font-size-override': '13px',
  '--trees-padding-inline-override': '10px',
  '--trees-border-radius-override': '6px',
};

const TREE_THEMES: Record<'dark' | 'light', CSSProperties> = {
  dark: {
    colorScheme: 'dark',
    '--trees-bg-override': 'oklch(20.5% 0 0)',
    '--trees-fg-override': 'oklch(98.5% 0 0)',
    '--trees-fg-muted-override': 'oklch(75% 0 0)',
    '--trees-bg-muted-override': 'oklch(26.9% 0 0)',
    '--trees-search-fg-override': 'oklch(85% 0 0)',
    '--trees-search-bg-override': 'oklch(20% 0 0)',
    '--trees-border-color-override': 'oklch(100% 0 0 / 0.12)',
    '--trees-selected-fg-override': 'oklch(97% 0.04 250)',
    '--trees-selected-bg-override': 'oklch(35% 0.08 250)',
    '--trees-selected-border-color-override': 'oklch(65% 0.2 250)',
    '--trees-selected-focused-border-color-override': 'oklch(75% 0.2 250)',
    '--trees-focus-ring-color-override': 'oklch(70% 0.15 250)',
    ...TREE_THEME_SHARED,
  } as CSSProperties,
  light: {
    colorScheme: 'light',
    '--trees-bg-override': 'oklch(97% 0 0)',
    '--trees-fg-override': 'oklch(15% 0 0)',
    '--trees-fg-muted-override': 'oklch(45% 0 0)',
    '--trees-bg-muted-override': 'oklch(93% 0 0)',
    '--trees-search-fg-override': 'oklch(20% 0 0)',
    '--trees-search-bg-override': 'oklch(97% 0 0)',
    '--trees-border-color-override': 'oklch(0% 0 0 / 0.10)',
    '--trees-selected-fg-override': 'oklch(15% 0.04 250)',
    '--trees-selected-bg-override': 'oklch(90% 0.04 250)',
    '--trees-selected-border-color-override': 'oklch(60% 0.15 250)',
    '--trees-selected-focused-border-color-override': 'oklch(55% 0.2 250)',
    '--trees-focus-ring-color-override': 'oklch(55% 0.15 250)',
    ...TREE_THEME_SHARED,
  } as CSSProperties,
};

export function FilesPanel() {
  const resolvedTheme = useResolvedTheme();
  const treeThemeStyle = TREE_THEMES[resolvedTheme];
  const workspace = useActiveWorkspace();
  const [treeData, setTreeData] = useState<TreeData>({
    paths: [],
    filePaths: new Set(),
    gitStatus: [],
  });
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const openFileTab = useAppStore((state) => state.openFileTab);
  const addContextFiles = useAppStore((state) => state.addContextFiles);
  const contextItems = useAppStore((state) => state.contextItems);
  const addToast = useAppStore((state) => state.addToast);
  const gitRefreshEpoch = useAppStore((state) => state.gitRefreshEpoch);
  const revealFileInTree = useAppStore((state) => state.revealFileInTree);
  const rightPanelMode = useAppStore((state) => state.rightPanelMode);
  const spinnerStyle = useAppStore((state) => state.settings.spinnerStyle);

  const contextFileSet = useMemo(() => {
    return new Set(
      contextItems.filter((item) => item.type === 'file' && item.workspaceId === workspace?.id).map((item) => item.relPath),
    );
  }, [contextItems, workspace?.id]);

  const { model } = useFileTree({
    id: workspace ? `tree-${workspace.id}` : 'tree-empty',
    paths: treeData.paths,
    gitStatus: treeData.gitStatus,
    initialExpansion: 1,
    density: 'default',
    search: true,
    flattenEmptyDirectories: true,
    icons: { set: 'complete', colored: true },
    renderRowDecoration: ({ item }) => (contextFileSet.has(item.path) ? { text: '', title: 'In AI context' } : null),
  });

  const selectedTreePaths = useFileTreeSelection(model);
  const prevSelectedRef = useRef<readonly string[]>([]);
  /** Counter-based guard against circular sync: programmatic deselect + select
   *  may each trigger a separate selection change event. Every programmatic
   *  mutation increments the counter; every selection-change effect that fires
   *  while the counter is positive decrements it instead of calling openFileTab. */
  const suppressCountRef = useRef(0);

  useEffect(() => {
    const prev = prevSelectedRef.current;
    const next = selectedTreePaths;
    if (sameStringArray(prev, next)) return;
    prevSelectedRef.current = [...next];

    setSelectedPaths([...next]);

    if (suppressCountRef.current > 0) {
      suppressCountRef.current--;
      return;
    }

    const added = next.filter((p) => !prev.includes(p));
    const last = added.at(-1) ?? next.at(-1);
    if (workspace && last && treeData.filePaths.has(last)) openFileTab(workspace.id, last);
  }, [selectedTreePaths, openFileTab, treeData.filePaths, workspace]);

  // Reveal and select a file in the tree when triggered by a tab click
  const lastRevealEpochRef = useRef(0);
  useEffect(() => {
    if (!revealFileInTree || rightPanelMode !== 'files') return;
    if (revealFileInTree.epoch === lastRevealEpochRef.current) return;
    lastRevealEpochRef.current = revealFileInTree.epoch;

    const { relPath } = revealFileInTree;
    // Deselect all previously selected paths first so only the target is highlighted
    const currentlySelected = model.getSelectedPaths();
    for (const p of currentlySelected) {
      if (p !== relPath) {
        model.getItem(p)?.deselect();
        suppressCountRef.current++;
      }
    }
    // focusPath expands parent directories and scrolls the item into view
    model.focusPath(relPath);
    const item = model.getItem(relPath);
    if (item && !item.isSelected()) {
      suppressCountRef.current++;
      item.select();
    }
  }, [revealFileInTree, rightPanelMode, model]);

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const nodes = await window.forgepad.fs.getTreeWithStatus(workspace.worktreePath);
      setTreeData(treeDataFromNodes(nodes, workspace.worktreePath));
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Failed to load file tree.');
    } finally {
      setLoading(false);
    }
  }, [addToast, workspace]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    model.resetPaths(treeData.paths);
    model.setGitStatus(treeData.gitStatus);
  }, [model, treeData]);

  const selectedContextFiles = useMemo(() => filesForTreeSelection(treeData, selectedPaths), [selectedPaths, treeData]);

  const addFilesToContext = useCallback(
    (relPaths: string[]) => {
      if (!workspace || relPaths.length === 0) return;
      addContextFiles(workspace.id, relPaths);
      addToast('success', `Added ${relPaths.length} file${relPaths.length === 1 ? '' : 's'} to context.`);
    },
    [addContextFiles, addToast, workspace],
  );

  const renderContextMenu = (item: FileTreeContextMenuItem, context: { close: () => void }) => {
    if (!workspace) return null;
    const itemFiles = filesForTreePath(treeData, item.path);
    const closeAfter = (action: () => void) => {
      action();
      context.close();
    };
    return (
      <div className="grid min-w-[150px] gap-[3px] rounded-[7px] border border-border bg-panel-2 p-[5px] shadow-[0_14px_32px_rgba(0,0,0,0.22)]">
        {item.kind === 'file' ? (
          <button
            type="button"
            className="h-7 rounded-[5px] bg-transparent px-[9px] text-left text-text hover:bg-panel-3"
            onClick={() => closeAfter(() => openFileTab(workspace.id, item.path))}
          >
            Open
          </button>
        ) : null}
        <button
          type="button"
          disabled={itemFiles.length === 0}
          className="h-7 rounded-[5px] bg-transparent px-[9px] text-left text-text hover:bg-panel-3 disabled:cursor-not-allowed disabled:text-subtle"
          onClick={() => closeAfter(() => addFilesToContext(itemFiles))}
        >
          {item.kind === 'file' ? 'Add to Context' : `Add Folder (${itemFiles.length})`}
        </button>
        <button
          type="button"
          className="h-7 rounded-[5px] bg-transparent px-[9px] text-left text-text hover:bg-panel-3"
          onClick={() =>
            closeAfter(() => {
              void navigator.clipboard.writeText(`${workspace.worktreePath}/${item.path}`);
            })
          }
        >
          Copy Path
        </button>
        <button
          type="button"
          className="h-7 rounded-[5px] bg-transparent px-[9px] text-left text-text hover:bg-panel-3"
          onClick={() =>
            closeAfter(() => {
              void navigator.clipboard.writeText(item.path);
            })
          }
        >
          Copy Relative Path
        </button>
      </div>
    );
  };

  // ── Drag-to-terminal: drag file rows to paste relative path ──
  //
  // Strategy: We do NOT pre-set `draggable="true"` on Shadow DOM rows because
  // that causes every click to start a native drag, blocking all pointer events
  // and freezing the UI. Instead we:
  //  1. Listen for mousedown (capture) on the container to record the target row
  //  2. On mousemove, once movement exceeds a threshold, set `draggable="true"`
  //     on THAT SPECIFIC ROW only, then immediately re-dispatch the mousemove
  //     so the browser picks up the draggable state and fires dragstart
  //  3. On dragstart (bubbles out of Shadow DOM), populate dataTransfer
  //  4. On dragend / mouseup, remove `draggable` from the row
  const treeContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = treeContainerRef.current;
    if (!container) return;

    let pending: {
      row: HTMLElement;
      path: string;
      x: number;
      y: number;
    } | null = null;
    let activeDragRow: HTMLElement | null = null;

    const THRESHOLD = 6;

    const findItemRow = (composedPath: EventTarget[]): { row: HTMLElement; path: string } | null => {
      for (const node of composedPath) {
        if (node instanceof HTMLElement) {
          const p = node.getAttribute('data-item-path');
          if (p) return { row: node, path: p };
        }
      }
      return null;
    };

    // (1) Capture mousedown — record which row and position
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const hit = findItemRow(e.composedPath());
      if (hit) {
        pending = { row: hit.row, path: hit.path, x: e.clientX, y: e.clientY };
      }
    };

    // (2) On mousemove past threshold, enable draggable on the single row
    const onMouseMove = (e: MouseEvent) => {
      if (!pending) return;
      const dx = e.clientX - pending.x;
      const dy = e.clientY - pending.y;
      if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;

      // Promote this row to draggable — the browser will fire dragstart
      // on the next pointer move because the element under the cursor is
      // now draggable.
      pending.row.setAttribute('draggable', 'true');
      activeDragRow = pending.row;
      pending = null;
    };

    // (3) dragstart bubbles out of Shadow DOM — set the transfer data
    const onDragStart = (e: DragEvent) => {
      if (!activeDragRow || !e.dataTransfer) return;
      const path = activeDragRow.getAttribute('data-item-path');
      if (!path) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', path);
      e.dataTransfer.setData('application/x-forgepad-path', path);
      e.dataTransfer.effectAllowed = 'copy';
    };

    // (4) Cleanup: remove draggable from the row
    const cleanup = () => {
      pending = null;
      if (activeDragRow) {
        activeDragRow.removeAttribute('draggable');
        activeDragRow = null;
      }
    };

    container.addEventListener('mousedown', onMouseDown, true);
    container.addEventListener('mousemove', onMouseMove, true);
    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragend', cleanup);
    container.addEventListener('mouseup', cleanup, true);
    return () => {
      container.removeEventListener('mousedown', onMouseDown, true);
      container.removeEventListener('mousemove', onMouseMove, true);
      container.removeEventListener('dragstart', onDragStart);
      container.removeEventListener('dragend', cleanup);
      container.removeEventListener('mouseup', cleanup, true);
      cleanup();
    };
  }, []);

  if (!workspace) {
    return <div className="grid min-h-[90px] place-items-center text-muted">Open a project first</div>;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2.5">
      <div ref={treeContainerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 z-2 grid min-h-0 place-items-center bg-bg/72">
            <span className="flex items-center gap-1.5 text-muted text-xs">
              <Spinner name={spinnerStyle as import('unicode-animations').BrailleSpinnerName} />
            </span>
          </div>
        ) : null}
        <FileTree model={model} style={treeThemeStyle} renderContextMenu={renderContextMenu} />
      </div>
    </section>
  );
}
