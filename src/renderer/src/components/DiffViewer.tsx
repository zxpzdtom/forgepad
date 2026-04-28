import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, RefreshCw } from "lucide-react";
import { PatchDiff } from "@pierre/diffs/react";
import type { FileDiffOptions, SelectedLineRange } from "@pierre/diffs/react";
import type {
  DiffCommentItem,
  DiffFileData,
  FileStatus,
  Tab,
  Workspace,
} from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";
import { useResolvedTheme } from "@renderer/App";

type DiffTab = Extract<Tab, { type: "diff" }>;

type DiffViewerProps = {
  tab: DiffTab;
  workspace: Workspace;
};

type PendingComment = {
  file: DiffFileData;
  range: SelectedLineRange;
  text: string;
};

function keyForStatus(status: Pick<FileStatus, "bucket" | "path">): string {
  return `${status.bucket}:${status.path}`;
}

function formatRange(range: SelectedLineRange): string {
  const side = range.side === "deletions" ? "-" : "+";
  if (range.start === range.end) return `${side}${range.start}`;
  return `${side}${range.start}-${range.endSide === "deletions" ? "-" : "+"}${range.end}`;
}

export function DiffViewer({ tab, workspace }: DiffViewerProps) {
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [diffs, setDiffs] = useState<DiffFileData[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingComment | null>(null);
  const settings = useAppStore((state) => state.settings);
  const resolvedTheme = useResolvedTheme();
  const gitRefreshEpoch = useAppStore((state) => state.gitRefreshEpoch);
  const addToast = useAppStore((state) => state.addToast);
  const addContextDiff = useAppStore((state) => state.addContextDiff);
  const addDiffComment = useAppStore((state) => state.addDiffComment);
  const contextItems = useAppStore((state) => state.contextItems);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const commentsByPath = useMemo(() => {
    const map = new Map<string, DiffCommentItem[]>();
    for (const item of contextItems) {
      if (item.type !== "comment" || item.workspaceId !== workspace.id)
        continue;
      const comments = map.get(item.relPath) ?? [];
      comments.push(item);
      map.set(item.relPath, comments);
    }
    return map;
  }, [contextItems, workspace.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setPending(null);
    try {
      const nextStatuses = await window.forgepad.git.getStatus(
        workspace.worktreePath,
      );
      setStatuses(nextStatuses);
      const prioritized = tab.activePath
        ? nextStatuses.filter((status) => status.path === tab.activePath)
        : nextStatuses;
      const files = await Promise.all(
        prioritized.map((status) =>
          window.forgepad.git.getFileDiff(
            workspace.worktreePath,
            status.path,
            status.bucket,
            status.status,
            status.oldPath,
          ),
        ),
      );
      setDiffs(files);
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : "Failed to load diffs.",
      );
    } finally {
      setLoading(false);
    }
  }, [addToast, tab.activePath, workspace.worktreePath]);

  useEffect(() => {
    void load();
  }, [load, gitRefreshEpoch]);

  const diffOptions: FileDiffOptions<undefined> = {
    theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
    themeType: resolvedTheme,
    diffStyle: settings.diffStyle,
    diffIndicators: settings.diffIndicators,
    lineDiffType: settings.diffLineDiffType,
    overflow: settings.diffOverflow,
    disableBackground: settings.diffDisableBackground,
    expandUnchanged: false,
    disableFileHeader: true,
    enableLineSelection: true,
    lineHoverHighlight: "both",
  };

  return (
    <section className="absolute inset-0 flex min-h-0 min-w-0 flex-col bg-bg">
      <div className="flex min-h-12 items-start justify-between gap-3 border-b border-border bg-panel px-3 py-2">
        <div className="min-w-0 flex items-center gap-[7px] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-[620]">
          {tab.activePath ? `Changes: ${tab.activePath}` : "Workspace Changes"}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="switch-row compact-switch">
            Layout
            <select
              className="toolbar-select"
              value={settings.diffStyle}
              onChange={(event) =>
                updateSettings({
                  diffStyle: event.currentTarget
                    .value as typeof settings.diffStyle,
                  diffInline: event.currentTarget.value === "unified",
                })
              }
            >
              <option value="split">Split</option>
              <option value="unified">Unified</option>
            </select>
          </label>
          <label className="switch-row compact-switch">
            Indicators
            <select
              className="toolbar-select"
              value={settings.diffIndicators}
              onChange={(event) =>
                updateSettings({
                  diffIndicators: event.currentTarget
                    .value as typeof settings.diffIndicators,
                })
              }
            >
              <option value="bars">Bars</option>
              <option value="classic">+/-</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="switch-row compact-switch">
            Inline
            <select
              className="toolbar-select"
              value={settings.diffLineDiffType}
              onChange={(event) =>
                updateSettings({
                  diffLineDiffType: event.currentTarget
                    .value as typeof settings.diffLineDiffType,
                })
              }
            >
              <option value="word-alt">Word alt</option>
              <option value="word">Word</option>
              <option value="char">Character</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="switch-row compact-switch">
            Overflow
            <select
              className="toolbar-select"
              value={settings.diffOverflow}
              onChange={(event) =>
                updateSettings({
                  diffOverflow: event.currentTarget
                    .value as typeof settings.diffOverflow,
                })
              }
            >
              <option value="scroll">Scroll</option>
              <option value="wrap">Wrap</option>
            </select>
          </label>
          <label className="switch-row compact-switch">
            <input
              type="checkbox"
              checked={!settings.diffDisableBackground}
              onChange={(event) =>
                updateSettings({
                  diffDisableBackground: !event.currentTarget.checked,
                })
              }
            />
            Background
          </label>
          <button
            className="icon-button"
            type="button"
            title="Refresh"
            onClick={load}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="grid min-h-[90px] place-items-center text-muted">
          Loading diffs
        </div>
      ) : null}
      {!loading && statuses.length === 0 ? (
        <div className="grid min-h-[90px] place-items-center text-muted">
          No git changes
        </div>
      ) : null}
      {!loading && diffs.length === 0 && statuses.length > 0 ? (
        <div className="grid min-h-[90px] place-items-center text-muted">
          Select a changed file from the Changes panel
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 overflow-auto p-3 scrollbar-thin scroll-mask">
        {diffs.map((file) => {
          const selectedStatus = statuses.find(
            (status) => keyForStatus(status) === `${file.bucket}:${file.path}`,
          );
          const fileComments = commentsByPath.get(file.path) ?? [];
          const options: FileDiffOptions<undefined> = {
            ...diffOptions,
            onLineSelectionEnd: (range) => {
              if (range) setPending({ file, range, text: "" });
            },
          };
          return (
            <article
              className="w-full mb-3.5 rounded-lg border border-border bg-surface-card"
              key={`${file.bucket}:${file.path}`}
            >
              <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border bg-panel-2 px-2.5 py-2">
                <div className="grid min-w-0 gap-0.5">
                  <strong title={file.path}>{file.path}</strong>
                  <span className="text-xs text-muted">
                    {file.bucket} · {file.status}
                    {file.oldPath ? ` · from ${file.oldPath}` : ""}
                  </span>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    addContextDiff(
                      workspace.id,
                      file.path,
                      file.bucket,
                      selectedStatus?.status ?? file.status,
                    )
                  }
                >
                  Add Diff
                </button>
              </header>
              {file.isBinary ? (
                <div className="grid min-h-[90px] place-items-center text-muted">
                  Binary diff omitted
                </div>
              ) : file.patch.trim() ? (
                <PatchDiff
                  patch={file.patch}
                  options={options}
                  disableWorkerPool
                />
              ) : (
                <div className="grid min-h-[90px] place-items-center text-muted">
                  No textual diff available
                </div>
              )}
              {pending?.file.path === file.path &&
              pending.file.bucket === file.bucket ? (
                <div className="m-2.5 rounded-lg border border-border bg-panel p-2.5">
                  <div className="mb-2 flex items-center gap-2 text-xs text-accent">
                    <MessageSquarePlus size={15} />
                    Comment on {formatRange(pending.range)}
                  </div>
                  <textarea
                    value={pending.text}
                    onChange={(event) =>
                      setPending({
                        ...pending,
                        text: event.currentTarget.value,
                      })
                    }
                    placeholder="Add a note for the agent"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setPending(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        addDiffComment(
                          workspace.id,
                          file.path,
                          file.bucket,
                          pending.range,
                          pending.text,
                        );
                        setPending(null);
                      }}
                    >
                      Add Comment
                    </button>
                  </div>
                </div>
              ) : null}
              {fileComments.length > 0 ? (
                <div className="grid gap-2 border-t border-border p-2.5">
                  {fileComments.map((comment) => (
                    <div
                      className="grid gap-2 rounded-lg border border-border bg-surface-card p-[9px]"
                      key={comment.id}
                    >
                      <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
                        L{comment.startLine}
                        {comment.endLine !== comment.startLine
                          ? `-L${comment.endLine}`
                          : ""}{" "}
                        {comment.side}
                      </strong>
                      <p className="m-0 text-sm leading-relaxed text-muted">
                        {comment.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
