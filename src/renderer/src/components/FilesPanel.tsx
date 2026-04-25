import { useCallback, useEffect, useMemo, useState } from "react";
import { FilePlus2, RefreshCw } from "lucide-react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { FileTreeContextMenuItem, GitStatusEntry } from "@pierre/trees";
import type { FileNode, Workspace } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";

type TreeData = {
  paths: string[];
  filePaths: Set<string>;
  gitStatus: GitStatusEntry[];
};

function walk(nodes: FileNode[], rootPath: string, result: TreeData) {
  for (const node of nodes) {
    const rel = node.path.startsWith(rootPath)
      ? node.path
          .slice(rootPath.length)
          .replace(/^\/+/, "")
          .replaceAll("\\", "/")
      : node.path;
    if (node.type === "file" && rel) {
      result.paths.push(rel);
      result.filePaths.add(rel);
      if (node.gitStatus) {
        result.gitStatus.push({
          path: rel,
          status: node.gitStatus === "conflicted" ? "modified" : node.gitStatus,
        });
      }
    }
    if (node.children) walk(node.children, rootPath, result);
  }
}

function treeDataFromNodes(nodes: FileNode[], rootPath: string): TreeData {
  const result: TreeData = { paths: [], filePaths: new Set(), gitStatus: [] };
  walk(nodes, rootPath.replace(/\/+$/, ""), result);
  result.paths.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
  return result;
}

function useActiveWorkspace(): Workspace | undefined {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
}

export function FilesPanel() {
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

  const contextFileSet = useMemo(() => {
    return new Set(
      contextItems
        .filter(
          (item) => item.type === "file" && item.workspaceId === workspace?.id,
        )
        .map((item) => item.relPath),
    );
  }, [contextItems, workspace?.id]);

  const { model } = useFileTree({
    id: workspace ? `tree-${workspace.id}` : "tree-empty",
    paths: treeData.paths,
    gitStatus: treeData.gitStatus,
    initialExpansion: 1,
    itemHeight: 26,
    search: true,
    flattenEmptyDirectories: true,
    initialSelectedPaths: [],
    onSelectionChange: (paths) => {
      const next = [...paths];
      setSelectedPaths(next);
      const last = next.at(-1);
      if (workspace && last && treeData.filePaths.has(last))
        openFileTab(workspace.id, last);
    },
    renderRowDecoration: ({ item }) =>
      contextFileSet.has(item.path)
        ? { text: "ctx", title: "In AI context" }
        : null,
    unsafeCSS: `
      :host {
        color-scheme: dark;
        --trees-bg-override: #10131a;
        --trees-bg-muted-override: #1a2230;
        --trees-fg-override: #d7dbe4;
        --trees-fg-muted-override: #8791a3;
        --trees-border-color-override: #2a303b;
        --trees-accent-override: #67d5b5;

        --trees-focus-ring-color-override: #67d5b5;
        --trees-focus-ring-width-override: 1px;
        --trees-focus-ring-offset-override: -1px;

        --trees-search-fg-override: #e2e7ef;
        --trees-search-bg-override: #0c0f15;
        --trees-search-font-weight-override: 600;

        --trees-selected-fg-override: #eef5ff;
        --trees-selected-bg-override: #22323a;
        --trees-selected-focused-border-color-override: #67d5b5;

        --trees-status-added-override: #89d985;
        --trees-status-modified-override: #83b6ff;
        --trees-status-renamed-override: #e9bd61;
        --trees-status-untracked-override: #67d5b5;
        --trees-status-deleted-override: #ff7777;
        --trees-git-added-color-override: #89d985;
        --trees-git-modified-color-override: #83b6ff;
        --trees-git-renamed-color-override: #e9bd61;
        --trees-git-untracked-color-override: #67d5b5;
        --trees-git-deleted-color-override: #ff7777;

        --trees-scrollbar-thumb-override: #3a4352;
        --trees-font-family-override: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --trees-font-size-override: 12px;
        --trees-item-padding-x-override: 7px;
        --trees-item-margin-x-override: 3px;
        --trees-border-radius-override: 6px;
        --trees-padding-inline-override: 8px;
      }
    `,
  });

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const nodes = await window.forgepad.fs.getTreeWithStatus(
        workspace.worktreePath,
      );
      setTreeData(treeDataFromNodes(nodes, workspace.worktreePath));
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : "Failed to load file tree.",
      );
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

  const selectedFiles = selectedPaths.filter((path) =>
    treeData.filePaths.has(path),
  );

  const renderContextMenu = (item: FileTreeContextMenuItem) => {
    if (!workspace || item.kind !== "file") return null;
    return (
      <div className="tree-menu">
        <button
          type="button"
          onClick={() => openFileTab(workspace.id, item.path)}
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => addContextFiles(workspace.id, [item.path])}
        >
          Add to Context
        </button>
      </div>
    );
  };

  if (!workspace) {
    return <div className="panel-placeholder">Open a project first</div>;
  }

  return (
    <section className="panel-body files-panel">
      <div className="panel-toolbar">
        <button
          className="secondary-button"
          type="button"
          disabled={selectedFiles.length === 0}
          onClick={() => addContextFiles(workspace.id, selectedFiles)}
        >
          <FilePlus2 size={15} />
          Add Selected
        </button>
        <button
          className="icon-button"
          type="button"
          title="Refresh tree"
          onClick={load}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="tree-meta">
        <span>{treeData.paths.length.toLocaleString()} files</span>
        <span>{selectedFiles.length} selected</span>
      </div>
      <div className="tree-wrap">
        {loading ? <div className="tree-loading">Refreshing</div> : null}
        <FileTree model={model} renderContextMenu={renderContextMenu} />
      </div>
    </section>
  );
}
