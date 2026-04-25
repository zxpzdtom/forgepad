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
  }, [load]);

  const diffOptions: FileDiffOptions<undefined> = {
    theme: "pierre-dark",
    themeType: "dark",
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
    <section className="diff-panel">
      <div className="surface-toolbar">
        <div className="toolbar-title">
          {tab.activePath ? `Changes: ${tab.activePath}` : "Workspace Changes"}
        </div>
        <div className="toolbar-actions">
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
      {loading ? <div className="panel-placeholder">Loading diffs</div> : null}
      {!loading && statuses.length === 0 ? (
        <div className="panel-placeholder">No git changes</div>
      ) : null}
      {!loading && diffs.length === 0 && statuses.length > 0 ? (
        <div className="panel-placeholder">
          Select a changed file from the Changes panel
        </div>
      ) : null}
      <div className="diff-scroll">
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
            <article className="diff-file" key={`${file.bucket}:${file.path}`}>
              <header className="diff-file-header">
                <div>
                  <strong title={file.path}>{file.path}</strong>
                  <span>
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
                <div className="binary-note">Binary diff omitted</div>
              ) : file.patch.trim() ? (
                <PatchDiff
                  patch={file.patch}
                  options={options}
                  disableWorkerPool
                />
              ) : (
                <div className="binary-note">No textual diff available</div>
              )}
              {pending?.file.path === file.path &&
              pending.file.bucket === file.bucket ? (
                <div className="inline-comment-box">
                  <div>
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
                  <div className="inline-actions">
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
                <div className="diff-comments">
                  {fileComments.map((comment) => (
                    <div className="context-item" key={comment.id}>
                      <strong>
                        L{comment.startLine}
                        {comment.endLine !== comment.startLine
                          ? `-L${comment.endLine}`
                          : ""}{" "}
                        {comment.side}
                      </strong>
                      <p>{comment.text}</p>
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
