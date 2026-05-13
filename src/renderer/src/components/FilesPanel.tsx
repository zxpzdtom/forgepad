import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileTreeContextMenuItem, GitStatusEntry } from '@pierre/trees';
import { useTranslation } from '@renderer/i18n';
import { FileTree, useFileTree, useFileTreeSelection } from '@pierre/trees/react';
import { useResolvedTheme } from '@renderer/App';
import { useAppStore } from '@renderer/store/app-store';
import type { FileNode, Tab, Workspace } from '@shared/types';

import { Spinner } from './Spinner';

/* ── Context-menu icons ─────────────────────────────────────── */

function IconFile() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconContext() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M2 9l10-6 10 6-10 6L2 9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 15l10 6 10-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M11.502 13h9M13.502 10s-3 2.21-3 3 3 3 3 3M13.998 2h-5a1.5 1.5 0 0 0 0 3h5a1.5 1.5 0 1 0 0-3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.498 3.5c1.554.047 2.48.22 3.121.862.828.827.876 2.129.879 4.638m-12-5.5c-1.553.047-2.48.22-3.121.862-.879.878-.879 2.293-.879 5.121V16c0 2.828 0 4.242.879 5.121C5.255 22 6.67 22 9.498 22h4c2.829 0 4.243 0 5.121-.879.769-.768.865-1.946.877-4.12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 19V7.549c0-1.444 0-2.166.243-2.733a3 3 0 0 1 1.573-1.573C4.383 3 5.098 3 6.55 3h.494a2 2 0 0 1 1.557.745L10.418 6m0 0H16c1.4 0 2.1 0 2.635.272a2.5 2.5 0 0 1 1.092 1.093C20 7.9 20 8.6 20 10v1m-9.582-5H7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.158 15.514l.298-.742c.734-1.827 1.101-2.74 1.866-3.256C6.088 11 7.076 11 9.052 11h8.06c2.688 0 4.033 0 4.63.879.598.879.098 2.121-.9 4.607l-.298.742c-.734 1.827-1.101 2.74-1.866 3.256-.766.516-1.754.516-3.73.516h-8.06c-2.688 0-4.033 0-4.63-.879-.598-.878-.098-2.121.9-4.607z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

function findTreeItemHit(event: Event): { row: HTMLElement; path: string } | null {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLElement) {
      const path = node.getAttribute('data-item-path');
      if (path) return { row: node, path };
    }
  }
  return null;
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
  const { t } = useTranslation();
  const resolvedTheme = useResolvedTheme();
  const treeThemeStyle = TREE_THEMES[resolvedTheme];
  const workspace = useActiveWorkspace();
  const [treeData, setTreeData] = useState<TreeData>({
    paths: [],
    filePaths: new Set(),
    gitStatus: [],
  });
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [manualContextMenu, setManualContextMenu] = useState<{
    item: FileTreeContextMenuItem;
    x: number;
    y: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const openFileTab = useAppStore((state) => state.openFileTab);
  const addContextFiles = useAppStore((state) => state.addContextFiles);
  const contextItems = useAppStore((state) => state.contextItems);
  const addToast = useAppStore((state) => state.addToast);
  const gitRefreshEpoch = useAppStore((state) => state.gitRefreshEpoch);
  const revealFileInTree = useAppStore((state) => state.revealFileInTree);
  const rightPanelMode = useAppStore((state) => state.rightPanelMode);
  const spinnerStyle = useAppStore((state) => state.settings.spinnerStyle);
  const tabs = useAppStore((state) => state.tabs);
  const sketchyMode = useAppStore((state) => state.settings.sketchyMode);

  const contextFileSet = useMemo(() => {
    return new Set(
      contextItems.filter((item) => item.type === 'file' && item.workspaceId === workspace?.id).map((item) => item.relPath),
    );
  }, [contextItems, workspace?.id]);

  /* Inject sketchy styles into the Shadow DOM when sketchy mode is active.
     The `unsafeCSS` option injects a <style> into the web component's Shadow DOM
     so we can override internal styles.

     The wobble filter is applied to the scroll container and search input
     (NOT the host element) so the context-menu-anchor — a sibling of the
     scroll container — stays outside any filter-created stacking context.
     This avoids the Chromium compositing bug where `filter` on the host
     traps slotted context-menu content in a broken compositing layer.

     We use an inline SVG data-URI so the filter definition is self-contained
     and works inside Shadow DOM without needing to reference a fragment in
     the host document (url(#id) cannot cross the shadow boundary). */
  const sketchyUnsafeCSS = sketchyMode
    ? `[data-file-tree-search-input] {
         border: 2px solid var(--trees-border-color);
         filter: url('data:image/svg+xml,<svg%20xmlns=%22http://www.w3.org/2000/svg%22><filter%20id=%22f%22%20x=%22-5%25%22%20y=%22-5%25%22%20width=%22110%25%22%20height=%22110%25%22><feTurbulence%20type=%22turbulence%22%20baseFrequency=%220.03%22%20numOctaves=%224%22%20seed=%2215%22%20result=%22noise%22/><feDisplacementMap%20in=%22SourceGraphic%22%20in2=%22noise%22%20scale=%222%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22/></filter></svg>#f');
       }
       [data-file-tree-virtualized-scroll] {
         filter: url('data:image/svg+xml,<svg%20xmlns=%22http://www.w3.org/2000/svg%22><filter%20id=%22f%22%20x=%22-5%25%22%20y=%22-5%25%22%20width=%22110%25%22%20height=%22110%25%22><feTurbulence%20type=%22turbulence%22%20baseFrequency=%220.03%22%20numOctaves=%224%22%20seed=%2215%22%20result=%22noise%22/><feDisplacementMap%20in=%22SourceGraphic%22%20in2=%22noise%22%20scale=%222%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22/></filter></svg>#f');
       }`
    : undefined;

  const { model } = useFileTree({
    id: workspace ? `tree-${workspace.id}` : 'tree-empty',
    paths: treeData.paths,
    gitStatus: treeData.gitStatus,
    initialExpansion: 1,
    density: 'default',
    search: true,
    flattenEmptyDirectories: true,
    icons: { set: 'complete', colored: true },
    renderRowDecoration: ({ item }) => (contextFileSet.has(item.path) ? { text: '', title: t('files.inAIContext') } : null),
    unsafeCSS: sketchyUnsafeCSS,
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

  // Deselect tree items whose file tab has been closed so that clicking
  // the same file again triggers a fresh selection change and re-opens the tab.
  const openFileRelPaths = useMemo(() => {
    if (!workspace) return new Set<string>();
    return new Set(
      tabs
        .filter((tab): tab is Extract<Tab, { type: 'file' }> => tab.workspaceId === workspace.id && tab.type === 'file')
        .map((tab) => tab.relPath),
    );
  }, [tabs, workspace]);

  useEffect(() => {
    const currentlySelected = model.getSelectedPaths();
    for (const p of currentlySelected) {
      // Only deselect file paths (not directories) that no longer have an open tab
      if (treeData.filePaths.has(p) && !openFileRelPaths.has(p)) {
        model.getItem(p)?.deselect();
        // Sync prevSelectedRef so the next user click is seen as a new addition.
        // No need to increment suppressCountRef here — the deselect's selection
        // change (if any) will be a no-op via sameStringArray because
        // prevSelectedRef is already updated.
        prevSelectedRef.current = prevSelectedRef.current.filter((pp) => pp !== p);
      }
    }
  }, [openFileRelPaths, model, treeData.filePaths]);

  const worktreePath = workspace?.worktreePath;

  const load = useCallback(
    async (silent?: boolean) => {
      if (!worktreePath) return;
      if (!silent) setLoading(true);
      try {
        const nodes = await window.forgepad.fs.getTreeWithStatus(worktreePath);
        setTreeData(treeDataFromNodes(nodes, worktreePath));
      } catch (error) {
        addToast('error', error instanceof Error ? error.message : t('files.failedLoadTree'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [addToast, worktreePath],
  );

  // Initial load — show spinner
  useEffect(() => {
    void load();
  }, [load]);

  // Subsequent file changes — silent refresh (no spinner)
  useEffect(() => {
    if (!worktreePath || gitRefreshEpoch === 0) return;
    void load(true);
  }, [gitRefreshEpoch, load, worktreePath]);

  useEffect(() => {
    model.resetPaths(treeData.paths);
    model.setGitStatus(treeData.gitStatus);
  }, [model, treeData]);

  const selectedContextFiles = useMemo(() => filesForTreeSelection(treeData, selectedPaths), [selectedPaths, treeData]);

  const addFilesToContext = useCallback(
    (relPaths: string[]) => {
      if (!workspace || relPaths.length === 0) return;
      addContextFiles(workspace.id, relPaths);
      addToast(
        'success',
        relPaths.length === 1
          ? t('files.addedToContext', { count: relPaths.length })
          : t('files.addedToContextPlural', { count: relPaths.length }),
      );
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
      <div className="grid w-max min-w-[160px] gap-[3px] rounded-[7px] border border-border bg-panel-2 p-[5px] shadow-[0_14px_32px_rgba(0,0,0,0.22)]">
        {item.kind === 'file' ? (
          <button
            type="button"
            className="flex h-7 items-center gap-[7px] rounded-[5px] bg-transparent px-[9px] text-left text-text hover:bg-panel-3"
            onClick={() => closeAfter(() => openFileTab(workspace.id, item.path))}
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-subtle">
              <IconFile />
            </span>
            <span className="text-[13px]">{t('common.open')}</span>
          </button>
        ) : null}
        <button
          type="button"
          disabled={itemFiles.length === 0}
          className="flex h-7 items-center gap-[7px] rounded-[5px] bg-transparent px-[9px] text-left text-text hover:bg-panel-3 disabled:cursor-not-allowed disabled:text-subtle"
          onClick={() => closeAfter(() => addFilesToContext(itemFiles))}
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-subtle">
            {item.kind === 'file' ? <IconContext /> : <IconFolder />}
          </span>
          <span className="text-[13px]">
            {item.kind === 'file' ? t('files.addToContext') : t('files.addFolder', { count: itemFiles.length })}
          </span>
        </button>
        <button
          type="button"
          className="flex h-7 items-center gap-[7px] rounded-[5px] bg-transparent px-[9px] text-left text-text hover:bg-panel-3"
          onClick={() =>
            closeAfter(() => {
              void navigator.clipboard.writeText(`${workspace.worktreePath}/${item.path}`);
              addToast('info', t('files.pathCopied'));
            })
          }
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-subtle">
            <IconClipboard />
          </span>
          <span className="text-[13px]">{t('files.copyPath')}</span>
        </button>
        <button
          type="button"
          className="flex h-7 items-center gap-[7px] rounded-[5px] bg-transparent px-[9px] text-left text-text hover:bg-panel-3"
          onClick={() =>
            closeAfter(() => {
              void navigator.clipboard.writeText(item.path);
              addToast('info', t('files.relativePathCopied'));
            })
          }
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-subtle">
            <IconClipboard />
          </span>
          <span className="text-[13px]">{t('files.copyRelativePath')}</span>
        </button>
      </div>
    );
  };

  const openManualContextMenu = useCallback(
    (path: string, x: number, y: number) => {
      const name = path.split('/').filter(Boolean).at(-1) ?? path;
      setManualContextMenu({
        item: {
          kind: treeData.filePaths.has(path) ? 'file' : 'directory',
          name,
          path,
        },
        x,
        y,
      });
    },
    [treeData.filePaths],
  );

  const manualMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!manualContextMenu) return;

    const close = () => setManualContextMenu(null);
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && manualMenuRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [manualContextMenu]);

  useEffect(() => {
    setManualContextMenu(null);
  }, [workspace?.id, treeData.paths]);

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

    const onContextMenu = (e: MouseEvent) => {
      const hit = findTreeItemHit(e);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      openManualContextMenu(hit.path, e.clientX, e.clientY);
    };

    // (1) Capture mousedown — record which row and position
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const hit = findTreeItemHit(e);
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

    container.addEventListener('contextmenu', onContextMenu, true);
    container.addEventListener('mousedown', onMouseDown, true);
    container.addEventListener('mousemove', onMouseMove, true);
    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragend', cleanup);
    container.addEventListener('mouseup', cleanup, true);
    return () => {
      container.removeEventListener('contextmenu', onContextMenu, true);
      container.removeEventListener('mousedown', onMouseDown, true);
      container.removeEventListener('mousemove', onMouseMove, true);
      container.removeEventListener('dragstart', onDragStart);
      container.removeEventListener('dragend', cleanup);
      container.removeEventListener('mouseup', cleanup, true);
      cleanup();
    };
  }, [openManualContextMenu]);

  if (!workspace) {
    return <div className="grid min-h-[90px] place-items-center text-muted">{t('files.openProjectFirst')}</div>;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2.5">
      <div ref={treeContainerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 z-2 grid min-h-0 place-items-center bg-bg/72">
            <span className="flex items-center gap-1.5 text-muted text-xs">
              <Spinner name={spinnerStyle} size={16} dotSize={2} />
            </span>
          </div>
        ) : null}
        <FileTree model={model} style={treeThemeStyle} renderContextMenu={renderContextMenu} />
        {manualContextMenu ? (
          <div
            ref={manualMenuRef}
            className="fixed z-[1000]"
            style={{
              left: Math.min(manualContextMenu.x, window.innerWidth - 180),
              top: Math.min(manualContextMenu.y, window.innerHeight - 150),
            }}
            data-file-tree-context-menu-root="true"
            onContextMenu={(event) => event.preventDefault()}
          >
            {renderContextMenu(manualContextMenu.item, { close: () => setManualContextMenu(null) })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
