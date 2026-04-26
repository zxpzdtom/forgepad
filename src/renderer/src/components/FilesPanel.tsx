import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FilePlus2, RefreshCw } from "lucide-react";
import {
  FileTree,
  useFileTree,
  useFileTreeSelection,
} from "@pierre/trees/react";
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

function filesForTreePath(treeData: TreeData, treePath: string): string[] {
  if (treeData.filePaths.has(treePath)) return [treePath];
  const prefix = treePath.replace(/\/+$/, "") + "/";
  return [...treeData.filePaths].filter((filePath) =>
    filePath.startsWith(prefix),
  );
}

function filesForTreeSelection(treeData: TreeData, selectedPaths: string[]) {
  const files = new Set<string>();
  for (const selectedPath of selectedPaths) {
    for (const filePath of filesForTreePath(treeData, selectedPath)) {
      files.add(filePath);
    }
  }
  return [...files].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
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
  const gitRefreshEpoch = useAppStore((state) => state.gitRefreshEpoch);

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
    icons: { set: "complete", colored: true },
    renderRowDecoration: ({ item }) =>
      contextFileSet.has(item.path)
        ? { text: "ctx", title: "In AI context" }
        : null,
  });

  const selectedTreePaths = useFileTreeSelection(model);
  const prevSelectedRef = useRef<readonly string[]>([]);

  useEffect(() => {
    const prev = prevSelectedRef.current;
    const next = selectedTreePaths;
    if (sameStringArray(prev, next)) return;
    prevSelectedRef.current = [...next];

    setSelectedPaths([...next]);

    const added = next.filter((p) => !prev.includes(p));
    const last = added.at(-1) ?? next.at(-1);
    if (workspace && last && treeData.filePaths.has(last))
      openFileTab(workspace.id, last);
  }, [selectedTreePaths, openFileTab, treeData.filePaths, workspace]);

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
  }, [load, gitRefreshEpoch]);

  useEffect(() => {
    model.resetPaths(treeData.paths);
    model.setGitStatus(treeData.gitStatus);
  }, [model, treeData]);

  const selectedFiles = selectedPaths.filter((path) =>
    treeData.filePaths.has(path),
  );
  const selectedContextFiles = useMemo(
    () => filesForTreeSelection(treeData, selectedPaths),
    [selectedPaths, treeData],
  );

  const addFilesToContext = useCallback(
    (relPaths: string[]) => {
      if (!workspace || relPaths.length === 0) return;
      addContextFiles(workspace.id, relPaths);
      addToast(
        "success",
        `Added ${relPaths.length} file${relPaths.length === 1 ? "" : "s"} to context.`,
      );
    },
    [addContextFiles, addToast, workspace],
  );

  const renderContextMenu = (
    item: FileTreeContextMenuItem,
    context: { close: () => void },
  ) => {
    if (!workspace) return null;
    const itemFiles = filesForTreePath(treeData, item.path);
    const closeAfter = (action: () => void) => {
      action();
      context.close();
    };
    return (
      <div className="tree-menu">
        {item.kind === "file" ? (
          <button
            type="button"
            onClick={() =>
              closeAfter(() => openFileTab(workspace.id, item.path))
            }
          >
            Open
          </button>
        ) : null}
        <button
          type="button"
          disabled={itemFiles.length === 0}
          onClick={() => closeAfter(() => addFilesToContext(itemFiles))}
        >
          {item.kind === "file"
            ? "Add to Context"
            : `Add Folder (${itemFiles.length})`}
        </button>
        <button
          type="button"
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

  if (!workspace) {
    return <div className="panel-placeholder">Open a project first</div>;
  }

  return (
    <section className="panel-body files-panel">
      <div className="panel-toolbar">
        <button
          className="secondary-button"
          type="button"
          disabled={selectedContextFiles.length === 0}
          onClick={() => addFilesToContext(selectedContextFiles)}
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
        <span>
          {selectedFiles.length} selected · {selectedContextFiles.length} in context range
        </span>
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
