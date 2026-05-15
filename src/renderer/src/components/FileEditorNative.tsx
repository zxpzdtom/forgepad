import { useEffect, useState } from 'react';
import type { Tab, Workspace } from '@shared/types';

type FileTab = Extract<Tab, { type: 'file' }>;

type FileEditorNativeProps = {
  tab: FileTab;
  workspace: Workspace;
};

export function FileEditorNative({ tab, workspace }: FileEditorNativeProps) {
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const readOnly = Boolean(tab.absPath);
  const title = tab.absPath ?? tab.relPath;

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);
    const read = tab.absPath
      ? window.forgepad.fs.readAbsFile(tab.absPath)
      : window.forgepad.fs.readFile(workspace.worktreePath, tab.relPath);

    read
      .then((value) => {
        if (disposed) return;
        setText(value);
        setOriginal(value);
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
  }, [tab.absPath, tab.relPath, workspace.worktreePath]);

  const save = async () => {
    if (readOnly || text === original) return;
    setSaving(true);
    setError(null);
    try {
      await window.forgepad.fs.writeFile(workspace.worktreePath, tab.relPath, text);
      setOriginal(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex size-full min-h-0 flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center justify-between border-border border-b px-3">
        <div className="min-w-0 truncate font-medium text-[13px] text-text">{title}</div>
        <button
          type="button"
          className="secondary-button"
          disabled={readOnly || saving || text === original}
          onClick={save}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {error ? <div className="border-border border-b px-3 py-2 text-danger text-xs">{error}</div> : null}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted text-sm">Loading...</div>
      ) : (
        <textarea
          className="size-full flex-1 resize-none border-0 bg-bg p-4 font-mono text-[13px] text-text outline-none"
          readOnly={readOnly}
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
      )}
    </div>
  );
}
