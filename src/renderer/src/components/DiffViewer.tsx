import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type FileDiffMetadata,
  type FileDiffOptions,
  Virtualizer as PierreVirtualizer,
  parseDiffFromFile,
  type SelectedLineRange,
} from '@pierre/diffs';
import type { DiffLineAnnotation } from '@pierre/diffs/react';
import { PatchDiff, FileDiff as PierreFileDiff, VirtualizerContext } from '@pierre/diffs/react';
import { useResolvedTheme } from '@renderer/app/theme-context';
import { useLspTokenNavigation } from '@renderer/hooks/useLspTokenNavigation';
import { useTranslation } from '@renderer/i18n';
import { useAppStore } from '@renderer/store/app-store';
import type { DiffCommentItem, DiffFileData, FileStatus, Tab, Workspace } from '@shared/types';
import { MessageSquarePlus, RefreshCw } from 'lucide-react';

type DiffTab = Extract<Tab, { type: 'diff' }>;

type DiffViewerProps = {
  tab: DiffTab;
  workspace: Workspace;
};

type PendingComment = {
  file: DiffFileData;
  range: SelectedLineRange;
  text: string;
};

type AnnotationMeta = { kind: 'pending' } | { kind: 'comment'; comment: DiffCommentItem };

const diffViewCache = new Map<
  string,
  {
    statuses: FileStatus[];
    diffs: DiffFileData[];
  }
>();

const diffViewerUnsafeCSS = `
  :host {
    --diffs-font-features: "tnum";
  }

  [data-unmodified-lines] {
    cursor: pointer;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  [data-separator-content] {
    min-width: max-content;
    color: var(--diffs-fg-number);
  }

  [data-diff],
  [data-code],
  [data-line],
  [data-line] span {
    -webkit-user-select: text;
    user-select: text;
  }

`;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif']);

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '');
}

function isImageDiff(file: DiffFileData) {
  return Boolean(file.oldImageUrl || file.newImageUrl);
}

function createSyntheticPatch(file: DiffFileData): string {
  if (file.patch.trim() && (file.status !== 'renamed' || hasPatchHunks(file.patch))) return file.patch;

  if (file.status === 'renamed' && file.newContent != null) {
    const lines = file.newContent.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    const lineCount = lines.length;
    return [
      `diff --git a/${file.oldPath ?? file.path} b/${file.path}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${file.path}`,
      `@@ -0,0 +1,${lineCount} @@`,
      ...lines.map((line) => `+${line}`),
    ].join('\n');
  }

  if ((file.status === 'added' || file.bucket === 'untracked') && file.newContent != null) {
    const lines = file.newContent.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    const lineCount = lines.length;
    return [
      `diff --git a/${file.path} b/${file.path}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${file.path}`,
      `@@ -0,0 +1,${lineCount} @@`,
      ...lines.map((line) => `+${line}`),
    ].join('\n');
  }

  if (file.status === 'deleted' && file.oldContent != null) {
    const lines = file.oldContent.split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    const lineCount = lines.length;
    const oldPath = file.oldPath ?? file.path;
    return [
      `diff --git a/${oldPath} b/${file.path}`,
      'deleted file mode 100644',
      `--- a/${oldPath}`,
      '+++ /dev/null',
      `@@ -1,${lineCount} +0,0 @@`,
      ...lines.map((line) => `-${line}`),
    ].join('\n');
  }

  return file.patch;
}

function createFullFileDiff(file: DiffFileData): FileDiffMetadata | null {
  if (file.oldContent == null || file.newContent == null) return null;

  return parseDiffFromFile(
    {
      name: file.oldPath ?? file.path,
      contents: file.oldContent,
    },
    {
      name: file.path,
      contents: file.newContent,
    },
  );
}

function hasPatchHunks(patch: string): boolean {
  return /^@@\s/m.test(patch);
}

function hasTextualDiff(file: DiffFileData): boolean {
  return (
    hasPatchHunks(file.patch) ||
    (file.status === 'renamed' && file.newContent != null) ||
    ((file.status === 'added' || file.bucket === 'untracked') && file.newContent != null) ||
    (file.status === 'deleted' && file.oldContent != null)
  );
}

function removeRedundantStagedRenameShells(statuses: FileStatus[]): FileStatus[] {
  return statuses.filter((status) => {
    if (status.bucket !== 'staged' || status.status !== 'renamed') return true;

    return !statuses.some(
      (other) =>
        other !== status &&
        other.path === status.path &&
        other.oldPath === status.oldPath &&
        other.bucket !== 'staged' &&
        other.status === 'renamed' &&
        ((other.additions ?? 0) > 0 || (other.deletions ?? 0) > 0),
    );
  });
}

function ImageDiff({ file }: { file: DiffFileData }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="image-diff-pane">
          <div className="image-diff-label">{file.status === 'added' || file.bucket === 'untracked' ? 'Original' : 'Before'}</div>
          {file.oldImageUrl ? (
            <img src={file.oldImageUrl} alt={`${file.path} before`} />
          ) : (
            <div className="image-diff-empty">
              {file.bucket === 'untracked' ? t('changes.untracked') : t('diff.binaryOmitted')}
            </div>
          )}
        </div>
        <div className="image-diff-pane">
          <div className="image-diff-label">After</div>
          {file.newImageUrl ? (
            <img src={file.newImageUrl} alt={`${file.path} after`} />
          ) : (
            <div className="image-diff-empty">{file.status === 'deleted' ? 'Deleted' : t('diff.binaryOmitted')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  renderAnnotation?: (annotation: DiffLineAnnotation<AnnotationMeta>) => React.ReactNode;
  selectedLines?: SelectedLineRange | null;
}) {
  const patch = useMemo(() => createSyntheticPatch(file), [file]);
  const fullFileDiff = useMemo(() => createFullFileDiff(file), [file]);

  const sharedProps = {
    options,
    lineAnnotations,
    renderAnnotation,
    selectedLines,
  };

  return fullFileDiff ? (
    <PierreFileDiff fileDiff={fullFileDiff} {...sharedProps} />
  ) : (
    <PatchDiff patch={patch} {...sharedProps} />
  );
}

function formatRange(range: SelectedLineRange): string {
  const side = range.side === 'deletions' ? '-' : '+';
  if (range.start === range.end) return `${side}${range.start}`;
  return `${side}${range.start}-${range.endSide === 'deletions' ? '-' : '+'}${range.end}`;
}

function DiffFileEntry({
  file,
  diffOptions,
  tab,
  workspace,
  fillHeight,
  pending,
  setPending,
  fileComments,
  addDiffComment,
}: {
  file: DiffFileData;
  diffOptions: FileDiffOptions<AnnotationMeta>;
  tab: DiffTab;
  workspace: Workspace;
  fillHeight: boolean;
  pending: PendingComment | null;
  setPending: (p: PendingComment | null) => void;
  fileComments: DiffCommentItem[];
  addDiffComment: (
    workspaceId: string,
    relPath: string,
    bucket: DiffFileData['bucket'],
    range: SelectedLineRange,
    text: string,
  ) => void;
}) {
  const { t } = useTranslation();
  const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(null);
  const isThisFilePending = pending?.file.path === file.path && pending.file.bucket === file.bucket;

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
    'diff',
  );

  const options: FileDiffOptions<AnnotationMeta> = useMemo(
    () => ({
      ...diffOptions,
      onTokenClick,
      onTokenEnter,
      onTokenLeave,
      onLineSelectionEnd: (range: SelectedLineRange | null) => {
        if (range) {
          setPending({ file, range, text: '' });
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
        metadata: { kind: 'comment', comment },
      });
    }
    // Pending comment form
    if (isThisFilePending && pending) {
      annotations.push({
        side: pending.range.endSide ?? pending.range.side,
        lineNumber: pending.range.end,
        metadata: { kind: 'pending' },
      });
    }
    return annotations;
  }, [fileComments, isThisFilePending, pending]);

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnotationMeta>) => {
      const meta = annotation.metadata!;
      if (meta.kind === 'pending' && isThisFilePending && pending) {
        return (
          <div className="m-2.5 rounded-lg border border-border bg-panel p-2.5">
            <div className="mb-2 flex items-center gap-2 text-accent text-xs">
              <MessageSquarePlus size={15} />
              {t('diff.commentOn', { range: formatRange(pending.range) })}
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
              placeholder={t('diff.addNote')}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  addDiffComment(workspace.id, file.path, file.bucket, pending.range, pending.text);
                  setPending(null);
                }
              }}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button className="secondary-button" type="button" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  addDiffComment(workspace.id, file.path, file.bucket, pending.range, pending.text);
                  setPending(null);
                }}
              >
                {t('diff.addComment')}
              </button>
            </div>
          </div>
        );
      }
      if (meta.kind === 'comment') {
        const { comment } = meta;
        return (
          <div className="mx-2.5 my-1 grid gap-2 rounded-lg border border-border bg-surface-card p-[9px]">
            <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
              L{comment.startLine}
              {comment.endLine !== comment.startLine ? `-L${comment.endLine}` : ''} {comment.side}
            </strong>
            <p className="m-0 text-muted text-sm leading-relaxed">{comment.text}</p>
          </div>
        );
      }
      return null;
    },
    [isThisFilePending, pending, setPending, addDiffComment, workspace.id, file.path, file.bucket, t],
  );

  const isSyntheticAddition = file.status === 'renamed' && !hasPatchHunks(file.patch);
  const entryClassName = [
    'diff-file-entry',
    fillHeight ? 'is-fill-height' : '',
    file.status === 'added' || file.bucket === 'untracked' || isSyntheticAddition ? 'is-addition' : '',
    file.status === 'deleted' ? 'is-deletion' : '',
    'mb-3.5 w-full rounded-lg bg-surface-card',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={entryClassName}>
      {!tab.activePath && (
        <header className="flex min-h-11 items-center gap-3 border-border border-b bg-panel-2 px-2.5 py-2">
          <div className="grid min-w-0 gap-0.5">
            <strong title={file.path}>{file.path}</strong>
            <span className="text-muted text-xs">
              {file.bucket} · {file.status}
              {file.oldPath ? ` · ${t('diff.fromFile', { path: file.oldPath })}` : ''}
            </span>
          </div>
        </header>
      )}
      {isImageDiff(file) ? (
        <ImageDiff file={file} />
      ) : file.isBinary ? (
        <div className="grid min-h-[90px] place-items-center text-muted">{t('diff.binaryOmitted')}</div>
      ) : hasTextualDiff(file) ? (
        <DiffContent
          file={file}
          options={options}
          lineAnnotations={lineAnnotations}
          renderAnnotation={renderAnnotation}
          selectedLines={selectedRange}
        />
      ) : (
        <div className="grid min-h-[90px] place-items-center text-muted">{t('diff.noTextualDiff')}</div>
      )}
    </article>
  );
}

export function DiffViewer({ tab, workspace }: DiffViewerProps) {
  const { t } = useTranslation();
  const [virtualizer] = useState(
    () =>
      new PierreVirtualizer({
        overscrollSize: 1200,
        intersectionObserverMargin: 1200,
      }),
  );
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
  const loadRequestIdRef = useRef(0);
  const diffsRef = useRef<DiffFileData[]>([]);

  useEffect(() => {
    diffsRef.current = diffs;
  }, [diffs]);

  const commentsByPath = useMemo(() => {
    const map = new Map<string, DiffCommentItem[]>();
    for (const item of contextItems) {
      if (item.type !== 'comment' || item.workspaceId !== workspace.id) continue;
      const comments = map.get(item.relPath) ?? [];
      comments.push(item);
      map.set(item.relPath, comments);
    }
    return map;
  }, [contextItems, workspace.id]);

  const cacheKey = useMemo(
    () =>
      [
        workspace.id,
        workspace.worktreePath,
        tab.activePath ?? '',
        tab.activeBucket ?? '',
        tab.activeStatus ?? '',
        tab.activeOldPath ?? '',
        tab.commitHash ?? '',
      ].join('\n'),
    [tab.activeBucket, tab.activeOldPath, tab.activePath, tab.activeStatus, tab.commitHash, workspace.id, workspace.worktreePath],
  );

  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    const cached = diffViewCache.get(cacheKey);
    if (cached) {
      setStatuses(cached.statuses);
      setDiffs(cached.diffs);
    }
    setLoading(!cached && diffsRef.current.length === 0);
    setPending(null);
    try {
      if (tab.commitHash && tab.activePath && tab.activeStatus) {
        const file = await window.forgepad.git.getCommitFileDiff(
          workspace.worktreePath,
          tab.commitHash,
          tab.activePath,
          tab.activeStatus,
          tab.activeOldPath,
        );
        if (requestId !== loadRequestIdRef.current) return;
        diffViewCache.set(cacheKey, {
          statuses: [],
          diffs: [file as DiffFileData],
        });
        setStatuses([]);
        setDiffs([file as DiffFileData]);
        return;
      }

      const nextStatuses = await window.forgepad.git.getStatus(workspace.worktreePath);
      if (requestId !== loadRequestIdRef.current) return;
      setStatuses(nextStatuses);
      const visibleStatuses = removeRedundantStagedRenameShells(nextStatuses);
      const prioritized = tab.activePath
        ? visibleStatuses.filter((status) => {
            const pathMatches = status.path === tab.activePath || status.oldPath === tab.activePath;
            const bucketMatches = !tab.activeBucket || status.bucket === tab.activeBucket;
            return pathMatches && bucketMatches;
          })
        : visibleStatuses;
      const files = await Promise.all(
        prioritized.map((status) => {
          const relPath = tab.activePath && status.oldPath === tab.activePath ? tab.activePath : status.path;
          const diffStatus = tab.activeStatus ?? status.status;
          const oldPath = tab.activeOldPath ?? (relPath === status.oldPath ? undefined : status.oldPath);
          return window.forgepad.git.getFileDiff(workspace.worktreePath, relPath, status.bucket, diffStatus, oldPath);
        }),
      );
      const filesWithImageUrls = await Promise.all(
        files.map(async (file) => {
          if (!isImagePath(file.path) || file.status === 'deleted' || !window.forgepad.fs.fileUrl) return file;
          try {
            return { ...file, newImageUrl: await window.forgepad.fs.fileUrl(workspace.worktreePath, file.path) };
          } catch {
            return file;
          }
        }),
      );
      if (requestId !== loadRequestIdRef.current) return;
      diffViewCache.set(cacheKey, {
        statuses: nextStatuses,
        diffs: filesWithImageUrls,
      });
      setDiffs(filesWithImageUrls);
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      addToast('error', error instanceof Error ? error.message : t('diff.failedLoadDiffs'));
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, [addToast, cacheKey, tab.activeBucket, tab.activeOldPath, tab.activePath, tab.activeStatus, tab.commitHash, workspace.worktreePath, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setDiffScrollRegion = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        virtualizer.setup(node);
      } else {
        virtualizer.cleanUp();
      }
    },
    [virtualizer],
  );

  // Escape key to dismiss pending comment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pending) {
        setPending(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [pending]);

  const diffOptions: FileDiffOptions<AnnotationMeta> = useMemo(
    () => ({
      theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light',
      themeType: resolvedTheme,
      diffStyle: settings.diffStyle,
      diffIndicators: settings.diffIndicators,
      lineDiffType: settings.diffLineDiffType,
      // Split + scroll can leave one side visually blank on long renamed files.
      overflow: 'wrap',
      disableBackground: settings.diffDisableBackground,
      expandUnchanged: false,
      disableFileHeader: true,
      enableLineSelection: true,
      lineHoverHighlight: 'both',
      hunkSeparators: 'line-info',
      unsafeCSS: diffViewerUnsafeCSS,
    }),
    [resolvedTheme, settings.diffDisableBackground, settings.diffIndicators, settings.diffLineDiffType, settings.diffStyle],
  );

  return (
    <section className="diff-panel absolute inset-0 flex min-h-0 min-w-0 flex-col bg-bg">
      <div className="flex min-h-12 items-center justify-between gap-3 border-border border-b bg-panel px-3 py-2">
        <div className="flex min-w-0 items-center gap-[7px] overflow-hidden text-ellipsis whitespace-nowrap font-[510] text-[13px]">
          {tab.commitHash && tab.activePath
            ? `${tab.commitSubject ?? tab.commitHash.slice(0, 7)} · ${tab.activePath}`
            : tab.activePath
              ? t('diff.changesTitle', { path: tab.activePath })
              : t('diff.workspaceChanges')}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button className="icon-button" type="button" title={t('diff.refresh')} onClick={load}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      {loading ? <div className="grid min-h-[90px] place-items-center text-muted">{t('diff.loadingDiffs')}</div> : null}
      {!loading && !tab.commitHash && statuses.length === 0 ? (
        <div className="grid min-h-[90px] place-items-center text-muted">{t('diff.noGitChanges')}</div>
      ) : null}
      {!loading && diffs.length === 0 && (tab.commitHash || statuses.length > 0) ? (
        <div className="grid min-h-[90px] place-items-center text-muted">{t('diff.selectFile')}</div>
      ) : null}
      <VirtualizerContext.Provider value={virtualizer}>
        <div
          ref={setDiffScrollRegion}
          className="diff-scroll-region scrollbar-thin scroll-mask flex min-h-0 flex-1 flex-col items-stretch overflow-auto"
        >
          {diffs.map((file) => (
            <DiffFileEntry
              key={`${file.bucket}:${file.path}`}
              file={file}
              diffOptions={diffOptions}
              tab={tab}
              workspace={workspace}
              fillHeight={diffs.length === 1}
              pending={pending}
              setPending={setPending}
              fileComments={commentsByPath.get(file.path) ?? []}
              addDiffComment={addDiffComment}
            />
          ))}
        </div>
      </VirtualizerContext.Provider>
    </section>
  );
}
