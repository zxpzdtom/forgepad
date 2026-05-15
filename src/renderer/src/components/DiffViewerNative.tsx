import { useEffect, useState } from 'react';
import type { DiffFileData, FileStatus, Tab, Workspace } from '@shared/types';

type DiffTab = Extract<Tab, { type: 'diff' }>;

type DiffViewerNativeProps = {
  tab: DiffTab;
  workspace: Workspace;
};

function statusLabel(status: FileStatus): string {
  return `${status.bucket} / ${status.status}`;
}

export function DiffViewerNative({ tab, workspace }: DiffViewerNativeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<DiffFileData[]>([]);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);

    window.forgepad.git
      .getStatus(workspace.worktreePath)
      .then(async (statuses) => {
        const selected = tab.activePath ? statuses.filter((status) => status.path === tab.activePath) : statuses;
        const next = await Promise.all(
          selected.map((status) =>
            window.forgepad.git.getFileDiff(
              workspace.worktreePath,
              status.path,
              status.bucket,
              status.status,
              status.oldPath,
            ) as Promise<DiffFileData>,
          ),
        );
        if (!disposed) setDiffs(next);
      })
      .catch((err) => {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [tab.activePath, workspace.worktreePath]);

  if (loading) {
    return <div className="flex size-full items-center justify-center bg-bg text-muted text-sm">Loading diff...</div>;
  }

  if (error) {
    return <div className="flex size-full items-center justify-center bg-bg p-6 text-danger text-sm">{error}</div>;
  }

  if (diffs.length === 0) {
    return <div className="flex size-full items-center justify-center bg-bg text-muted text-sm">No changes</div>;
  }

  return (
    <div className="size-full overflow-auto bg-bg">
      {diffs.map((file) => (
        <section key={`${file.bucket}:${file.path}`} className="border-border border-b">
          <div className="flex items-center justify-between border-border border-b bg-panel px-3 py-2">
            <div className="min-w-0 truncate font-medium text-[13px] text-text">{file.path}</div>
            <div className="ml-3 shrink-0 text-[11px] text-muted">{statusLabel(file)}</div>
          </div>
          {file.isBinary ? (
            <div className="p-4 text-muted text-sm">Binary file</div>
          ) : (
            <pre className="m-0 overflow-auto p-4 font-mono text-[12px] text-text leading-relaxed">{file.patch}</pre>
          )}
        </section>
      ))}
    </div>
  );
}
