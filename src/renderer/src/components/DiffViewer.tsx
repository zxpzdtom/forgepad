import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@renderer/i18n";
import type { FileDiffOptions, SelectedLineRange } from "@pierre/diffs";
import { getFiletypeFromFileName, processFile } from "@pierre/diffs";
import type { DiffLineAnnotation } from "@pierre/diffs/react";
import { FileDiff, PatchDiff } from "@pierre/diffs/react";
import { useResolvedTheme } from "@renderer/App";
import { useLspTokenNavigation } from "@renderer/hooks/useLspTokenNavigation";
import { useAppStore } from "@renderer/store/app-store";
import type {
  DiffCommentItem,
  DiffFileData,
  FileStatus,
  Tab,
  Workspace,
} from "@shared/types";
import { MessageSquarePlus, RefreshCw } from "lucide-react";

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

type AnnotationMeta =
  | { kind: "pending" }
  | { kind: "comment"; comment: DiffCommentItem };

function DiffContent({
  file,
  options,
  lineAnnotations,
  renderAnnotation,
  selectedLines,
}: {
  file: DiffFileData;
  options: FileDiffOptions<AnnotationMeta>;
  lineAnnotations?: DiffLineAnnotation<AnnotationMeta>[];
  renderAnnotation?: (
    annotation: DiffLineAnnotation<AnnotationMeta>,
  ) => React.ReactNode;
  selectedLines?: SelectedLineRange | null;
}) {
  // Pierre has an infinite-loop bug when the computed language is "text"
  // (same guard as FileEditor). Render a plain <pre> patch instead.
  const isPlainText = useMemo(
    () => getFiletypeFromFileName(file.path) === "text",
    [file.path],
  );

  const fileDiffMetadata = useMemo(() => {
    if (isPlainText) return undefined;
    if (file.oldContent == null && file.newContent == null) {
      console.warn(
        "[DiffContent] no oldContent/newContent, falling back to PatchDiff",
      );
      return undefined;
    }
    const result = processFile(file.patch, {
      oldFile: {
        name: file.oldPath ?? file.path,
        contents: file.oldContent ?? "",
      },
      newFile: { name: file.path, contents: file.newContent ?? "" },
    });
    console.log("[DiffContent] processFile result:", {
      isPartial: result?.isPartial,
      hunks: result?.hunks.length,
      hasResult: result != null,
    });
    return result;
  }, [
    file.patch,
    file.path,
    file.oldPath,
    file.oldContent,
    file.newContent,
    isPlainText,
  ]);

  if (isPlainText) {
    // Show the new file content with line numbers, matching FileEditor's
    // plain-text rendering style, since pierre crashes on language "text".
    const content = file.newContent ?? file.oldContent ?? file.patch ?? "";
    const lines = content.split("\n");
    return (
      <pre
        className="m-0 flex-1 overflow-auto p-4 font-mono text-[13px] text-text"
        style={{ lineHeight: 1.6, tabSize: 4 }}
      >
        <table className="border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td
                  className="select-none pr-4 text-right align-top text-subtle/50"
                  style={{ minWidth: "3em" }}
                >
                  {i + 1}
                </td>
                <td className="whitespace-pre-wrap break-all">
                  {line || "\u00A0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </pre>
    );
  }

  if (fileDiffMetadata) {
    return (
      <FileDiff
        fileDiff={fileDiffMetadata}
        options={options}
        lineAnnotations={lineAnnotations}
        renderAnnotation={renderAnnotation}
        selectedLines={selectedLines}
        disableWorkerPool
      />
    );
  }
  return (
    <PatchDiff
      patch={file.patch}
      options={options}
      lineAnnotations={lineAnnotations}
      renderAnnotation={renderAnnotation}
      selectedLines={selectedLines}
      disableWorkerPool
    />
  );
}

function formatRange(range: SelectedLineRange): string {
  const side = range.side === "deletions" ? "-" : "+";
  if (range.start === range.end) return `${side}${range.start}`;
  return `${side}${range.start}-${range.endSide === "deletions" ? "-" : "+"}${range.end}`;
}

function DiffFileEntry({
  file,
  diffOptions,
  tab,
  workspace,
  pending,
  setPending,
  fileComments,
  addDiffComment,
}: {
  file: DiffFileData;
  diffOptions: FileDiffOptions<AnnotationMeta>;
  tab: DiffTab;
  workspace: Workspace;
  pending: PendingComment | null;
  setPending: (p: PendingComment | null) => void;
  fileComments: DiffCommentItem[];
  addDiffComment: (
    workspaceId: string,
    relPath: string,
    bucket: DiffFileData["bucket"],
    range: SelectedLineRange,
    text: string,
  ) => void;
}) {
  const { t } = useTranslation();
  const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(
    null,
  );
  const isThisFilePending =
    pending?.file.path === file.path && pending.file.bucket === file.bucket;

  // Clear selection highlight when pending comment is dismissed or moves to another file
  useEffect(() => {
    if (!isThisFilePending) {
      setSelectedRange(null);
    }
  }, [isThisFilePending]);

  const { onTokenClick, onTokenEnter, onTokenLeave } = useLspTokenNavigation(
    workspace.worktreePath,
    file.path,
    workspace.id,
    "diff",
  );

  const options: FileDiffOptions<AnnotationMeta> = useMemo(
    () => ({
      ...diffOptions,
      onTokenClick,
      onTokenEnter,
      onTokenLeave,
      onLineSelectionEnd: (range: SelectedLineRange | null) => {
        if (range) {
          setPending({ file, range, text: "" });
          setSelectedRange(range);
        }
      },
    }),
    [diffOptions, file, setPending, onTokenClick, onTokenEnter, onTokenLeave],
  );

  const lineAnnotations = useMemo(() => {
    const annotations: DiffLineAnnotation<AnnotationMeta>[] = [];
    // Existing saved comments
    for (const comment of fileComments) {
      annotations.push({
        side: comment.endSide ?? comment.side,
        lineNumber: comment.endLine,
        metadata: { kind: "comment", comment },
      });
    }
    // Pending comment form
    if (isThisFilePending && pending) {
      annotations.push({
        side: pending.range.endSide ?? pending.range.side,
        lineNumber: pending.range.end,
        metadata: { kind: "pending" },
      });
    }
    return annotations;
  }, [fileComments, isThisFilePending, pending]);

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnotationMeta>) => {
      const meta = annotation.metadata!;
      if (meta.kind === "pending" && isThisFilePending && pending) {
        return (
          <div className="m-2.5 rounded-lg border border-border bg-panel p-2.5">
            <div className="mb-2 flex items-center gap-2 text-accent text-xs">
              <MessageSquarePlus size={15} />
              {t("diff.commentOn", { range: formatRange(pending.range) })}
            </div>
            <textarea
              className="w-full"
              value={pending.text}
              onChange={(event) =>
                setPending({
                  ...pending,
                  text: event.currentTarget.value,
                })
              }
              placeholder={t("diff.addNote")}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  addDiffComment(
                    workspace.id,
                    file.path,
                    file.bucket,
                    pending.range,
                    pending.text,
                  );
                  setPending(null);
                }
              }}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPending(null)}
              >
                {t("common.cancel")}
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
                {t("diff.addComment")}
              </button>
            </div>
          </div>
        );
      }
      if (meta.kind === "comment") {
        const { comment } = meta;
        return (
          <div className="mx-2.5 my-1 grid gap-2 rounded-lg border border-border bg-surface-card p-[9px]">
            <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
              L{comment.startLine}
              {comment.endLine !== comment.startLine
                ? `-L${comment.endLine}`
                : ""}{" "}
              {comment.side}
            </strong>
            <p className="m-0 text-muted text-sm leading-relaxed">
              {comment.text}
            </p>
          </div>
        );
      }
      return null;
    },
    [
      isThisFilePending,
      pending,
      setPending,
      addDiffComment,
      workspace.id,
      file.path,
      file.bucket,
    ],
  );

  return (
    <article className="mb-3.5 w-full rounded-lg bg-surface-card">
      {!tab.activePath && (
        <header className="flex min-h-11 items-center gap-3 border-border border-b bg-panel-2 px-2.5 py-2">
          <div className="grid min-w-0 gap-0.5">
            <strong title={file.path}>{file.path}</strong>
            <span className="text-muted text-xs">
              {file.bucket} · {file.status}
              {file.oldPath
                ? ` · ${t("diff.fromFile", { path: file.oldPath })}`
                : ""}
            </span>
          </div>
        </header>
      )}
      {file.isBinary ? (
        <div className="grid min-h-[90px] place-items-center text-muted">
          {t("diff.binaryOmitted")}
        </div>
      ) : file.patch.trim() ? (
        <DiffContent
          file={file}
          options={options}
          lineAnnotations={lineAnnotations}
          renderAnnotation={renderAnnotation}
          selectedLines={selectedRange}
        />
      ) : (
        <div className="grid min-h-[90px] place-items-center text-muted">
          {t("diff.noTextualDiff")}
        </div>
      )}
    </article>
  );
}

export function DiffViewer({ tab, workspace }: DiffViewerProps) {
  const { t } = useTranslation();
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [diffs, setDiffs] = useState<DiffFileData[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingComment | null>(null);
  const settings = useAppStore((state) => state.settings);
  const resolvedTheme = useResolvedTheme();
  const gitRefreshEpoch = useAppStore((state) => state.gitRefreshEpoch);
  const addToast = useAppStore((state) => state.addToast);
  const addDiffComment = useAppStore((state) => state.addDiffComment);
  const contextItems = useAppStore((state) => state.contextItems);

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
        error instanceof Error ? error.message : t("diff.failedLoadDiffs"),
      );
    } finally {
      setLoading(false);
    }
  }, [addToast, tab.activePath, workspace.worktreePath]);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape key to dismiss pending comment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pending) {
        setPending(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [pending]);

  const diffOptions: FileDiffOptions<AnnotationMeta> = {
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
      <div className="flex min-h-12 items-center justify-between gap-3 border-border border-b bg-panel px-3 py-2">
        <div className="flex min-w-0 items-center gap-[7px] overflow-hidden text-ellipsis whitespace-nowrap font-[510] text-[13px]">
          {tab.activePath
            ? t("diff.changesTitle", { path: tab.activePath })
            : t("diff.workspaceChanges")}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className="icon-button"
            type="button"
            title={t("diff.refresh")}
            onClick={load}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="grid min-h-[90px] place-items-center text-muted">
          {t("diff.loadingDiffs")}
        </div>
      ) : null}
      {!loading && statuses.length === 0 ? (
        <div className="grid min-h-[90px] place-items-center text-muted">
          {t("diff.noGitChanges")}
        </div>
      ) : null}
      {!loading && diffs.length === 0 && statuses.length > 0 ? (
        <div className="grid min-h-[90px] place-items-center text-muted">
          {t("diff.selectFile")}
        </div>
      ) : null}
      <div className="scrollbar-thin scroll-mask flex min-h-0 flex-1 overflow-auto">
        {diffs.map((file) => (
          <DiffFileEntry
            key={`${file.bucket}:${file.path}`}
            file={file}
            diffOptions={diffOptions}
            tab={tab}
            workspace={workspace}
            pending={pending}
            setPending={setPending}
            fileComments={commentsByPath.get(file.path) ?? []}
            addDiffComment={addDiffComment}
          />
        ))}
      </div>
    </section>
  );
}
