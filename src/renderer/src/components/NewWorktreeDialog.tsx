import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import { generateRandomBranchName } from '@renderer/lib/random-branch-name';
import { RefreshCw } from 'lucide-react';

export function NewWorktreeDialog({
  projectName,
  repoPath,
  onClose,
  onCreate,
}: {
  projectName: string;
  repoPath: string;
  onClose: () => void;
  onCreate: (branch: string, trackRemote: boolean) => void;
}) {
  const worktreeTrackRemoteByDefault = useAppStore((s) => s.settings.worktreeTrackRemoteByDefault);
  const [branch, setBranch] = useState(generateRandomBranchName);
  const [trackRemote, setTrackRemote] = useState(worktreeTrackRemoteByDefault);
  const [loading, setLoading] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState<'idle' | 'checking' | 'exists' | 'not-found'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Debounced remote branch check
  useEffect(() => {
    if (!trackRemote || !branch.trim()) {
      setRemoteStatus('idle');
      return;
    }
    setRemoteStatus('checking');
    clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(async () => {
      try {
        const branches = await window.forgepad.git.listRemoteBranches(repoPath);
        const trimmed = branch.trim();
        const found = branches.some((b) => b === `origin/${trimmed}` || b === trimmed);
        setRemoteStatus(found ? 'exists' : 'not-found');
      } catch {
        setRemoteStatus('not-found');
      }
    }, 400);
    return () => clearTimeout(checkTimerRef.current);
  }, [branch, trackRemote, repoPath]);

  const handleSubmit = async () => {
    const trimmed = branch.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      onCreate(trimmed, trackRemote);
    } finally {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85" onMouseDown={onClose}>
      <div
        className="w-[min(400px,90vw)] rounded-xl border border-border bg-panel-2 shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-border border-b px-4 py-3">
          <span className="font-[590] text-[14px] text-text">New Worktree — {projectName}</span>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-subtle">Branch name</span>
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                className="h-8 flex-1 rounded-md border border-border bg-panel-3 px-2.5 text-[13px] text-text outline-none focus:border-accent"
                placeholder="e.g. swift-fox"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSubmit();
                }}
              />
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-panel-3 text-subtle hover:bg-panel-2 hover:text-text"
                title="Generate random name"
                onClick={() => setBranch(generateRandomBranchName())}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </label>
          <label className="flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              className="size-3.5 cursor-pointer accent-accent"
              checked={trackRemote}
              onChange={(e) => setTrackRemote(e.target.checked)}
            />
            <span className="text-[12px] text-subtle">Track remote branch</span>
          </label>
          {trackRemote && branch.trim() && (
            <div className="text-[11px]">
              {remoteStatus === 'checking' && <span className="text-subtle">Checking origin/{branch.trim()}…</span>}
              {remoteStatus === 'exists' && (
                <span className="text-text-addition">✓ origin/{branch.trim()} found — will create tracking branch</span>
              )}
              {remoteStatus === 'not-found' && (
                <span className="text-text-warning-status">
                  ✗ origin/{branch.trim()} not found — will create new branch and push
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-border border-t px-4 py-3">
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-border bg-transparent px-3 text-[13px] text-text hover:bg-panel-3"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-transparent bg-accent px-3 text-[13px] text-accent-contrast hover:brightness-110 disabled:opacity-50"
            disabled={!branch.trim() || loading}
            onClick={() => void handleSubmit()}
          >
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
