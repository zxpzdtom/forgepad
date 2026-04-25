import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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

const treeThemeStyle = {
  colorScheme: "dark",
  "--trees-bg-override": "oklch(20.5% 0 0)",
  "--trees-fg-override": "oklch(98.5% 0 0)",
  "--trees-fg-muted-override": "oklch(75% 0 0)",
  "--trees-bg-muted-override": "oklch(26.9% 0 0)",
  "--trees-search-fg-override": "oklch(85% 0 0)",
  "--trees-search-bg-override": "oklch(20% 0 0)",
  "--trees-border-color-override": "oklch(100% 0 0 / 0.12)",
  "--trees-selected-fg-override": "oklch(97% 0.04 250)",
  "--trees-selected-bg-override": "oklch(35% 0.08 250)",
  "--trees-selected-border-color-override": "oklch(65% 0.2 250)",
  "--trees-selected-focused-border-color-override": "oklch(75% 0.2 250)",
  "--trees-focus-ring-color-override": "oklch(70% 0.15 250)",
  "--trees-font-family-override":
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "--trees-font-size-override": "13px",
  "--trees-padding-inline-override": "10px",
  "--trees-border-radius-override": "6px",
} as CSSProperties;

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
    density: "default",
    search: true,
    flattenEmptyDirectories: true,
    icons: { set: "standard", colored: false },
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
        <FileTree
          model={model}
          style={treeThemeStyle}
          renderContextMenu={renderContextMenu}
        />
      </div>
    </section>
  );
}
