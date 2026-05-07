import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@renderer/i18n";
import { useAppStore } from "@renderer/store/app-store";
import type {
  FileStatus,
  GitBucket,
  GitStatusKind,
  Workspace,
} from "@shared/types";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  FolderOpen,
  GitCommitHorizontal,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Spinner } from "./Spinner";

function useActiveWorkspace(): Workspace | undefined {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
}

function statusKey(status: FileStatus): string {
  return `${status.bucket}:${status.path}`;
}

function bucketTitle(bucket: GitBucket, t: (key: string) => string): string {
  if (bucket === "staged") return t("changes.staged");
  if (bucket === "untracked") return t("changes.untracked");
  return t("changes.workingTree");
}

// --- Zed-style status indicator ---

function StatusIndicator({ status }: { status: GitStatusKind }) {
  const base =
    "inline-flex size-3 shrink-0 items-center justify-center rounded-[2px] border leading-none";
  if (status === "modified") {
    return (
      <span className={`${base} border-warn text-warn`}>
        <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
          <circle cx="3" cy="3" r="2.5" />
        </svg>
      </span>
    );
  }
  if (status === "added" || status === "untracked") {
    return (
      <span className={`${base} border-ok text-ok`}>
        <svg
          width="7"
          height="7"
          viewBox="0 0 7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="3.5" y1="1" x2="3.5" y2="6" />
          <line x1="1" y1="3.5" x2="6" y2="3.5" />
        </svg>
      </span>
    );
  }
  if (status === "deleted") {
    return (
      <span className={`${base} border-danger text-danger`}>
        <svg
          width="7"
          height="7"
          viewBox="0 0 7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="1" y1="3.5" x2="6" y2="3.5" />
        </svg>
      </span>
    );
  }
  if (status === "renamed") {
    return (
      <span
        className={`${base} border-accent-2 font-extrabold text-[7px] text-accent-2`}
      >
        R
      </span>
    );
  }
  // conflicted
  return (
    <span className={`${base} border-warn font-extrabold text-[7px] text-warn`}>
      !
    </span>
  );
}

// --- Tree data structure ---

type TreeNode = {
  name: string;
  /** Full relative path (for directories this is the dir path) */
  path: string;
  isDir: boolean;
  /** Only for files */
  fileStatus?: FileStatus;
  children: TreeNode[];
  /** Aggregated status for the directory (most severe child status) */
  dirStatus?: GitStatusKind;
};

function buildTree(files: FileStatus[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const partPath = parts.slice(0, i + 1).join("/");

      if (isLast) {
        // leaf file
        current.children.push({
          name: part,
          path: file.path,
          isDir: false,
          fileStatus: file,
          children: [],
        });
      } else {
        // directory
        let dirNode = current.children.find(
          (child) => child.isDir && child.name === part,
        );
        if (!dirNode) {
          dirNode = { name: part, path: partPath, isDir: true, children: [] };
          current.children.push(dirNode);
        }
        current = dirNode;
      }
    }
  }

  // Sort: directories first, then alphabetically
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    for (const child of node.children) {
      if (child.isDir) sortChildren(child);
    }
  };
  sortChildren(root);

  // Collapse single-child directories (flatten)
  const collapse = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.map((node) => {
      if (node.isDir) {
        node.children = collapse(node.children);
        // If directory has exactly one child that is also a directory, merge
        while (node.children.length === 1 && node.children[0].isDir) {
          const child = node.children[0];
          node.name = `${node.name}/${child.name}`;
          node.path = child.path;
          node.children = child.children;
        }
      }
      return node;
    });
  };

  // Compute aggregate status for directories
  const computeDirStatus = (node: TreeNode): GitStatusKind | undefined => {
    if (!node.isDir) return node.fileStatus?.status;
    const childStatuses = node.children
      .map(computeDirStatus)
      .filter((s): s is GitStatusKind => s != null);
    if (childStatuses.length === 0) return undefined;
    // Priority: deleted > modified > renamed > added > untracked > conflicted
    if (childStatuses.includes("deleted")) return "deleted";
    if (childStatuses.includes("modified")) return "modified";
    if (childStatuses.includes("conflicted")) return "conflicted";
    if (childStatuses.includes("renamed")) return "renamed";
    if (childStatuses.includes("added")) return "added";
    return "untracked";
  };

  const collapsed = collapse(root.children);
  for (const node of collapsed) {
    if (node.isDir) {
      node.dirStatus = computeDirStatus(node);
    }
  }

  return collapsed;
}

/** Gather all file status keys under a tree node */
function gatherKeys(node: TreeNode): string[] {
  if (!node.isDir && node.fileStatus) return [statusKey(node.fileStatus)];
  return node.children.flatMap(gatherKeys);
}

// --- Tree row component ---

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  selectedKeys,
  onToggleCheck,
  onClickFile,
}: {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  selectedKeys: Set<string>;
  onToggleCheck: (keys: string[], checked: boolean) => void;
  onClickFile: (path: string) => void;
}) {
  const keys = useMemo(() => gatherKeys(node), [node]);
  const allChecked = keys.length > 0 && keys.every((k) => selectedKeys.has(k));
  const someChecked = !allChecked && keys.some((k) => selectedKeys.has(k));

  const status = node.isDir ? node.dirStatus : node.fileStatus?.status;
  const paddingLeft = depth * 16 + 4;

  return (
    <div
      className="group flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-[5px] pr-1.5 text-text hover:bg-white/[0.04]"
      style={{ paddingLeft }}
      onClick={() => {
        if (node.isDir) {
          onToggle();
        } else {
          onClickFile(node.fileStatus!.path);
        }
      }}
    >
      {/* Chevron / spacer */}
      {node.isDir ? (
        <span
          className={`inline-flex size-[18px] shrink-0 items-center justify-center text-muted transition-transform duration-100 ${
            expanded ? "" : "-rotate-90"
          }`}
        >
          <ChevronDown size={14} />
        </span>
      ) : (
        <span className="inline-flex w-[18px] shrink-0" />
      )}

      {/* Icon */}
      {node.isDir ? (
        <FolderOpen size={15} className="shrink-0 text-muted" />
      ) : status ? (
        <StatusIndicator status={status} />
      ) : null}

      {/* Label */}
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
        {node.name}
      </span>

      {/* Trailing: stat counts + checkbox */}
      <span className="flex shrink-0 items-center gap-1.5">
        {!node.isDir && node.fileStatus && (
          <span className="inline-flex items-center gap-1 font-mono text-[11px]">
            {node.fileStatus.additions != null &&
              node.fileStatus.additions > 0 && (
                <span className="text-ok">+{node.fileStatus.additions}</span>
              )}
            {node.fileStatus.deletions != null &&
              node.fileStatus.deletions > 0 && (
                <span className="text-danger">
                  -{node.fileStatus.deletions}
                </span>
              )}
          </span>
        )}
        <input
          type="checkbox"
          className="size-3.5 shrink-0 cursor-pointer accent-accent"
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = someChecked;
          }}
          onChange={(e) => {
            e.stopPropagation();
            onToggleCheck(keys, e.currentTarget.checked);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </span>
    </div>
  );
}

// --- Recursive tree renderer ---

function TreeSection({
  nodes,
  depth,
  expandedPaths,
  toggleExpanded,
  selectedKeys,
  onToggleCheck,
  onClickFile,
}: {
  nodes: TreeNode[];
  depth: number;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
  selectedKeys: Set<string>;
  onToggleCheck: (keys: string[], checked: boolean) => void;
  onClickFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expandedPaths.has(node.path);
        return (
          <div key={node.path}>
            <TreeRow
              node={node}
              depth={depth}
              expanded={isExpanded}
              onToggle={() => toggleExpanded(node.path)}
              selectedKeys={selectedKeys}
              onToggleCheck={onToggleCheck}
              onClickFile={onClickFile}
            />
            {node.isDir && isExpanded && (
              <TreeSection
                nodes={node.children}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                toggleExpanded={toggleExpanded}
                selectedKeys={selectedKeys}
                onToggleCheck={onToggleCheck}
                onClickFile={onClickFile}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// --- Main panel ---

export function ChangesPanel() {
  const { t } = useTranslation();
  const workspace = useActiveWorkspace();
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<"push" | "pull" | null>(null);
  const [generating, setGenerating] = useState(false);
  const addToast = useAppStore((state) => state.addToast);
  const openDiffTab = useAppStore((state) => state.openDiffTab);
  const triggerGitRefresh = useAppStore((state) => state.triggerGitRefresh);
  const gitRefreshEpoch = useAppStore((state) => state.gitRefreshEpoch);
  const spinnerStyle = useAppStore((state) => state.settings.spinnerStyle);
  const commitPromptTemplate = useAppStore(
    (state) => state.settings.commitPromptTemplate,
  );
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const branchStats = useAppStore((state) =>
    activeWorkspaceId ? state.branchStats[activeWorkspaceId] : undefined,
  );

  const prevSignature = useRef("");

  const load = useCallback(
    async (silent?: boolean) => {
      if (!workspace) return;
      if (!silent) setLoading(true);
      try {
        const next = await window.forgepad.git.getStatus(
          workspace.worktreePath,
        );
        const sig = next.map((s) => statusKey(s)).join(",");
        setStatuses(next);
        setSelectedKeys(
          (current) =>
            new Set(
              [...current].filter((key) =>
                next.some((status) => statusKey(status) === key),
              ),
            ),
        );
        if (sig !== prevSignature.current) {
          prevSignature.current = sig;
          if (silent) triggerGitRefresh();
        }
      } catch (error) {
        addToast(
          "error",
          error instanceof Error
            ? error.message
            : t("changes.failedLoadStatus"),
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [addToast, workspace, triggerGitRefresh],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspace || gitRefreshEpoch === 0) return;
    void load(true);
  }, [gitRefreshEpoch, load, workspace]);

  useEffect(() => {
    if (!workspace) return;
    const timer = setInterval(() => {
      void load(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [workspace, load]);

  const selected = useMemo(
    () => statuses.filter((status) => selectedKeys.has(statusKey(status))),
    [selectedKeys, statuses],
  );

  const byBucket = useMemo(() => {
    const buckets: Record<GitBucket, FileStatus[]> = {
      staged: [],
      unstaged: [],
      untracked: [],
    };
    for (const status of statuses) buckets[status.bucket].push(status);
    return buckets;
  }, [statuses]);

  const treesByBucket = useMemo(() => {
    return {
      staged: buildTree(byBucket.staged),
      unstaged: buildTree(byBucket.unstaged),
      untracked: buildTree(byBucket.untracked),
    };
  }, [byBucket]);

  // Auto-expand all directories on first load / when tree changes
  useEffect(() => {
    const allDirPaths = new Set<string>();
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.isDir) {
          allDirPaths.add(node.path);
          walk(node.children);
        }
      }
    };
    walk(treesByBucket.staged);
    walk(treesByBucket.unstaged);
    walk(treesByBucket.untracked);
    setExpandedPaths(allDirPaths);
  }, [treesByBucket]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const onToggleCheck = useCallback((keys: string[], checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, []);

  const onClickFile = useCallback(
    (path: string) => {
      if (workspace) openDiffTab(workspace.id, path);
    },
    [workspace, openDiffTab],
  );

  const mutate = async (kind: "stage" | "unstage" | "discard" | "commit") => {
    if (!workspace) return;
    try {
      if (kind === "stage") {
        await window.forgepad.git.stage(
          workspace.worktreePath,
          selected.map((s) => s.path),
        );
      } else if (kind === "unstage") {
        await window.forgepad.git.unstage(
          workspace.worktreePath,
          selected.map((s) => s.path),
        );
      } else if (kind === "discard") {
        const ok = window.confirm(t("changes.discardConfirm"));
        if (!ok) return;
        await window.forgepad.git.discard(
          workspace.worktreePath,
          selected.map((s) => ({ path: s.path, bucket: s.bucket })),
        );
      } else if (kind === "commit") {
        await window.forgepad.git.commit(workspace.worktreePath, commitMessage);
        setCommitMessage("");
      }
      await load();
      triggerGitRefresh();
      addToast("success", t("changes.gitOpCompleted"));
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : t("changes.gitOpFailed"),
      );
    }
  };

  const handleSync = async (kind: "push" | "pull") => {
    if (!workspace || syncing) return;
    setSyncing(kind);
    try {
      if (kind === "push") {
        await window.forgepad.git.push(workspace.worktreePath);
      } else {
        await window.forgepad.git.pull(workspace.worktreePath);
      }
      await load();
      triggerGitRefresh();
      addToast("success", t("changes.gitOpCompleted"));
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : t("changes.gitOpFailed"),
      );
    } finally {
      setSyncing(null);
    }
  };

  const handleGenerateAI = async () => {
    if (!workspace || generating) return;
    setGenerating(true);
    try {
      const message = await window.forgepad.git.generateCommitMessage(
        workspace.worktreePath,
        commitPromptTemplate,
      );
      setCommitMessage(message);
      // Refresh status — backend may have auto-staged all changes
      await load();
      triggerGitRefresh();
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : t("changes.gitOpFailed"),
      );
    } finally {
      setGenerating(false);
    }
  };

  if (!workspace) {
    return (
      <div className="grid min-h-[90px] place-items-center text-muted">
        {t("changes.openProjectFirst")}
      </div>
    );
  }

  const bucketOrder: GitBucket[] = ["staged", "unstaged", "untracked"];

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-2.5">
      {/* Toolbar */}
      <div className="flex min-h-8 items-center gap-2">
        <button
          className="secondary-button"
          type="button"
          disabled={selected.length === 0}
          onClick={() => mutate("stage")}
        >
          <Check size={15} />
          {t("changes.stage")}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={selected.length === 0}
          onClick={() => mutate("unstage")}
        >
          <RotateCcw size={15} />
          {t("changes.unstage")}
        </button>
        <button
          className="icon-button danger"
          type="button"
          title={t("changes.discardSelected")}
          disabled={selected.length === 0}
          onClick={() => mutate("discard")}
        >
          <Trash2 size={15} />
        </button>
        <button
          className="icon-button"
          type="button"
          title={t("changes.refreshChanges")}
          onClick={load}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Tree view */}
      <div className="scrollbar-thin scroll-mask-y flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {loading && (
          <div className="grid min-h-[52px] place-items-center text-muted">
            <span className="flex items-center gap-1.5 text-xs">
              <Spinner name={spinnerStyle} size={16} dotSize={2} />
            </span>
          </div>
        )}
        {!loading && statuses.length === 0 && (
          <div className="grid min-h-[52px] place-items-center text-muted">
            {t("changes.cleanWorkingTree")}
          </div>
        )}
        {bucketOrder.map((bucket) => {
          const trees = treesByBucket[bucket];
          if (trees.length === 0) return null;
          const bucketFiles = byBucket[bucket];
          return (
            <div key={bucket} className="mb-1">
              <div className="flex items-center justify-between px-1 py-1 text-muted text-xs">
                <span className="font-[510]">{bucketTitle(bucket, t)}</span>
                <span>{bucketFiles.length}</span>
              </div>
              <TreeSection
                nodes={trees}
                depth={0}
                expandedPaths={expandedPaths}
                toggleExpanded={toggleExpanded}
                selectedKeys={selectedKeys}
                onToggleCheck={onToggleCheck}
                onClickFile={onClickFile}
              />
            </div>
          );
        })}
      </div>

      {/* Commit area */}
      <div className="grid gap-2 border-border border-t pt-2.5">
        <div className="relative">
          <textarea
            className="commit-textarea pr-8"
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.currentTarget.value)}
            placeholder={t("changes.commitMessage")}
          />
          <button
            className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.08] hover:text-accent disabled:pointer-events-none disabled:opacity-40"
            type="button"
            title={t("changes.generateTitle")}
            disabled={generating || statuses.length === 0}
            onClick={() => void handleGenerateAI()}
          >
            {generating ? (
              <Spinner name={spinnerStyle} size={14} dotSize={2} />
            ) : (
              <Sparkles size={14} />
            )}
          </button>
        </div>
        <button
          className="primary-button w-full"
          type="button"
          disabled={!commitMessage.trim()}
          onClick={() => mutate("commit")}
        >
          <GitCommitHorizontal size={16} />
          {t("changes.commitStaged")}
        </button>
        <div className="flex gap-2">
          <button
            className="secondary-button flex-1"
            type="button"
            title={t("changes.pullTitle")}
            disabled={syncing !== null}
            onClick={() => handleSync("pull")}
          >
            <ArrowDown size={15} />
            {syncing === "pull" ? t("changes.pulling") : t("changes.pull")}
            {branchStats && branchStats.behind > 0 && syncing !== "pull" && (
              <span className="ml-0.5 rounded-full bg-accent/15 px-1.5 py-px font-mono text-[10px] text-accent">
                {branchStats.behind}
              </span>
            )}
          </button>
          <button
            className="secondary-button flex-1"
            type="button"
            title={t("changes.pushTitle")}
            disabled={
              syncing !== null || !branchStats || branchStats.ahead === 0
            }
            onClick={() => handleSync("push")}
          >
            <ArrowUp size={15} />
            {syncing === "push" ? t("changes.pushing") : t("changes.push")}
            {branchStats && branchStats.ahead > 0 && syncing !== "push" && (
              <span className="ml-0.5 rounded-full bg-accent/15 px-1.5 py-px font-mono text-[10px] text-accent">
                {branchStats.ahead}
              </span>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
