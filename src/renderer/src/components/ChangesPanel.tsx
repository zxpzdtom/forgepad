import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, GitCommitHorizontal, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import type { FileStatus, GitBucket, Workspace } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";

function useActiveWorkspace(): Workspace | undefined {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
}

function statusKey(status: FileStatus): string {
  return `${status.bucket}:${status.path}`;
}

function bucketTitle(bucket: GitBucket): string {
  if (bucket === "staged") return "Staged";
  if (bucket === "untracked") return "Untracked";
  return "Working Tree";
}

function StatusDot({ status }: { status: FileStatus["status"] }) {
  const cls =
    status === "deleted" ? "del" :
    status === "added" || status === "untracked" ? "add" :
    status === "renamed" ? "ren" :
    status === "conflicted" ? "conf" : "mod";
  return <span className={`change-status-dot ${cls}`} title={status} />;
}

export function ChangesPanel() {
  const workspace = useActiveWorkspace();
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const addToast = useAppStore((state) => state.addToast);
  const openDiffTab = useAppStore((state) => state.openDiffTab);
  const addContextDiff = useAppStore((state) => state.addContextDiff);
  const triggerGitRefresh = useAppStore((state) => state.triggerGitRefresh);
  const gitRefreshEpoch = useAppStore((state) => state.gitRefreshEpoch);

  const prevSignature = useRef("");

  const load = useCallback(async (silent?: boolean) => {
    if (!workspace) return;
    if (!silent) setLoading(true);
    try {
      const next = await window.forgepad.git.getStatus(workspace.worktreePath);
      const sig = next.map((s) => statusKey(s)).join(",");
      setStatuses(next);
      setSelectedKeys((current) => new Set([...current].filter((key) => next.some((status) => statusKey(status) === key))));
      if (sig !== prevSignature.current) {
        prevSignature.current = sig;
        if (silent) triggerGitRefresh();
      }
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to load git status.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast, workspace, triggerGitRefresh]);

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
    const buckets: Record<GitBucket, FileStatus[]> = { staged: [], unstaged: [], untracked: [] };
    for (const status of statuses) buckets[status.bucket].push(status);
    return buckets;
  }, [statuses]);

  const mutate = async (kind: "stage" | "unstage" | "discard" | "commit") => {
    if (!workspace) return;
    try {
      if (kind === "stage") {
        await window.forgepad.git.stage(workspace.worktreePath, selected.map((status) => status.path));
      } else if (kind === "unstage") {
        await window.forgepad.git.unstage(workspace.worktreePath, selected.map((status) => status.path));
      } else if (kind === "discard") {
        const ok = window.confirm("Discard selected changes? This cannot be undone.");
        if (!ok) return;
        await window.forgepad.git.discard(
          workspace.worktreePath,
          selected.map((status) => ({ path: status.path, bucket: status.bucket })),
        );
      } else if (kind === "commit") {
        await window.forgepad.git.commit(workspace.worktreePath, commitMessage);
        setCommitMessage("");
      }
      await load();
      triggerGitRefresh();
      addToast("success", "Git operation completed.");
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Git operation failed.");
    }
  };

  if (!workspace) {
    return <div className="grid min-h-[90px] place-items-center text-muted">Open a project first</div>;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-2.5">
      <div className="flex min-h-8 items-center gap-2">
        <button className="secondary-button" type="button" disabled={selected.length === 0} onClick={() => mutate("stage")}>
          <Check size={15} />
          Stage
        </button>
        <button className="secondary-button" type="button" disabled={selected.length === 0} onClick={() => mutate("unstage")}>
          <RotateCcw size={15} />
          Unstage
        </button>
        <button className="icon-button danger" type="button" title="Discard selected" disabled={selected.length === 0} onClick={() => mutate("discard")}>
          <Trash2 size={15} />
        </button>
        <button className="icon-button" type="button" title="Refresh changes" onClick={load}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto scrollbar-thin">
        {loading ? <div className="grid min-h-[52px] place-items-center text-muted">Refreshing changes</div> : null}
        {!loading && statuses.length === 0 ? <div className="grid min-h-[52px] place-items-center text-muted">Clean working tree</div> : null}
        {(["staged", "unstaged", "untracked"] as GitBucket[]).map((bucket) => {
          const items = byBucket[bucket];
          if (items.length === 0) return null;
          return (
            <div className="grid gap-[5px]" key={bucket}>
              <div className="flex justify-between text-xs text-muted">
                <span>{bucketTitle(bucket)}</span>
                <small>{items.length}</small>
              </div>
              {items.map((status) => {
                const key = statusKey(status);
                const checked = selectedKeys.has(key);
                return (
                  <div
                    className={`grid w-full grid-cols-[20px_minmax(0,1fr)_34px] items-center gap-2 rounded-md border border-transparent px-[7px] py-1.5${checked ? " bg-[#22323a]" : " bg-transparent"}`}
                    key={key}
                    role="button"
                    tabIndex={0}
                    onDoubleClick={() => openDiffTab(workspace.id, status.path)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") openDiffTab(workspace.id, status.path);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const next = new Set(selectedKeys);
                        if (event.currentTarget.checked) next.add(key);
                        else next.delete(key);
                        setSelectedKeys(next);
                      }}
                    />
                    <button
                      className="min-w-0 flex items-center justify-between gap-2 text-left bg-transparent text-text"
                      type="button"
                      title={status.path}
                      onClick={() => openDiffTab(workspace.id, status.path)}
                    >
                      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{status.path}</span>
                      <span className="inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap font-mono text-[11px]">
                        {status.additions != null && status.additions > 0 && (
                          <span className="text-ok">+{status.additions}</span>
                        )}
                        {status.deletions != null && status.deletions > 0 && (
                          <span className="text-danger">-{status.deletions}</span>
                        )}
                        <StatusDot status={status.status} />
                      </span>
                    </button>
                    <button
                      className="mini-button"
                      type="button"
                      title="Add diff to context"
                      onClick={() => addContextDiff(workspace.id, status.path, status.bucket, status.status)}
                    >
                      ctx
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 border-t border-border pt-2.5">
        <textarea
          className="commit-textarea"
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.currentTarget.value)}
          placeholder="Commit message"
        />
        <button className="primary-button w-full" type="button" disabled={!commitMessage.trim()} onClick={() => mutate("commit")}>
          <GitCommitHorizontal size={16} />
          Commit Staged
        </button>
      </div>
    </section>
  );
}
