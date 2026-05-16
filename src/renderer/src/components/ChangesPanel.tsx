import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from '@renderer/i18n';
import { confirmNative } from '@renderer/lib/native-dialog';
import { useAppStore } from '@renderer/store/app-store';
import type { FileStatus, GitBucket, GitStatusKind, Workspace } from '@shared/types';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  GitCommitHorizontal,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { FileIcon } from './FileIcon';
import { Spinner } from './Spinner';

function useActiveWorkspace(): Workspace | undefined {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
}

function statusKey(status: FileStatus): string {
  return `${status.bucket}:${status.path}`;
}

function bucketTitle(bucket: GitBucket, t: (key: string) => string): string {
  if (bucket === 'staged') return t('changes.staged');
  if (bucket === 'untracked') return t('changes.untracked');
  return t('changes.workingTree');
}

type ChangeTreeNode = {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  children: ChangeTreeNode[];
  file?: FileStatus;
  aggregateStatus?: GitStatusKind;
};

const STATUS_PRIORITY: GitStatusKind[] = ['conflicted', 'deleted', 'modified', 'renamed', 'added', 'untracked'];

function statusRank(status: GitStatusKind): number {
  const rank = STATUS_PRIORITY.indexOf(status);
  return rank === -1 ? STATUS_PRIORITY.length : rank;
}

function statusLabel(status: GitStatusKind): string {
  if (status === 'added' || status === 'untracked') return '+';
  if (status === 'deleted') return '-';
  if (status === 'renamed') return 'R';
  if (status === 'conflicted') return '!';
  return 'M';
}

function buildChangeTree(files: FileStatus[]): ChangeTreeNode[] {
  const root: ChangeTreeNode = { name: '', path: '', kind: 'directory', children: [] };
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;
    for (let index = 0; index < parts.length; index++) {
      const name = parts[index];
      const path = parts.slice(0, index + 1).join('/');
      const isFile = index === parts.length - 1;
      let child = current.children.find((node) => node.name === name && node.kind === (isFile ? 'file' : 'directory'));
      if (!child) {
        child = { name, path, kind: isFile ? 'file' : 'directory', children: [] };
        current.children.push(child);
      }
      if (isFile) child.file = file;
      current = child;
    }
  }
  collapseSingleDirectories(root);
  sortAndAggregate(root);
  return root.children;
}

function collapseSingleDirectories(node: ChangeTreeNode) {
  for (const child of node.children) collapseSingleDirectories(child);
  while (node.kind === 'directory' && node.children.length === 1 && node.children[0].kind === 'directory') {
    const only = node.children[0];
    node.name = node.name ? `${node.name}/${only.name}` : only.name;
    node.path = only.path;
    node.children = only.children;
  }
}

function sortAndAggregate(node: ChangeTreeNode): GitStatusKind | undefined {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
  if (node.file) {
    node.aggregateStatus = node.file.status;
    return node.file.status;
  }
  const childStatuses = node.children.map(sortAndAggregate).filter((status): status is GitStatusKind => status != null);
  const aggregate = childStatuses.sort((a, b) => statusRank(a) - statusRank(b))[0];
  node.aggregateStatus = aggregate;
  return aggregate;
}

function collectFiles(node: ChangeTreeNode): FileStatus[] {
  if (node.file) return [node.file];
  return node.children.flatMap(collectFiles);
}

function defaultExpandedPaths(nodes: ChangeTreeNode[]): Set<string> {
  const expanded = new Set<string>();
  const walk = (items: ChangeTreeNode[], depth: number) => {
    for (const item of items) {
      if (item.kind !== 'directory') continue;
      if (depth < 2) expanded.add(item.path);
      walk(item.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return expanded;
}

function ChangeStatusBadge({ status }: { status: GitStatusKind }) {
  return <span className={`change-status-box status-${status}`}>{statusLabel(status)}</span>;
}

function ChangeStats({ file }: { file: FileStatus }) {
  const additions = file.additions ?? 0;
  const deletions = file.deletions ?? 0;
  if (additions <= 0 && deletions <= 0) return <span className="change-row-stats" />;
  return (
    <span className="change-row-stats">
      {additions > 0 ? <span className="change-stat-add">+{additions}</span> : null}
      {deletions > 0 ? <span className="change-stat-del">-{deletions}</span> : null}
    </span>
  );
}

function ChangeTreeRow({
  node,
  depth,
  bucket,
  activePath,
  expandedPaths,
  selectedKeys,
  onToggleExpanded,
  onToggleSelection,
  onOpenDiff,
}: {
  node: ChangeTreeNode;
  depth: number;
  bucket: GitBucket;
  activePath?: string;
  expandedPaths: Set<string>;
  selectedKeys: Set<string>;
  onToggleExpanded: (path: string) => void;
  onToggleSelection: (files: FileStatus[]) => void;
  onOpenDiff: (path: string) => void;
}) {
  const isDirectory = node.kind === 'directory';
  const isExpanded = expandedPaths.has(node.path);
  const files = useMemo(() => collectFiles(node), [node]);
  const checkedCount = files.filter((file) => selectedKeys.has(statusKey(file))).length;
  const allChecked = files.length > 0 && checkedCount === files.length;
  const mixed = checkedCount > 0 && !allChecked;
  const status = node.aggregateStatus ?? node.file?.status ?? 'modified';
  const isActive = node.file?.path === activePath;
  const rowClassName = `change-native-row ${isDirectory ? 'is-directory' : 'is-file'}${!isDirectory && isActive ? ' is-active' : ''}`;

  return (
    <>
      <div className={rowClassName} style={{ '--change-depth': depth } as CSSProperties}>
        <button
          className={`change-native-main${isDirectory ? ' is-directory' : ''}`}
          type="button"
          onClick={() => {
            if (isDirectory) onToggleExpanded(node.path);
            else if (node.file) onOpenDiff(node.file.path);
          }}
        >
          <span className={`change-native-chevron${isExpanded ? ' is-expanded' : ''}`}>
            {isDirectory ? <ChevronRight size={14} /> : null}
          </span>
          <span className="change-native-icon">
            {isDirectory ? isExpanded ? <FolderOpen size={15} /> : <Folder size={15} /> : <FileIcon filePath={node.path} size={15} />}
          </span>
          <span className="change-native-name" title={node.file?.oldPath ? `${node.file.oldPath} -> ${node.file.path}` : node.path}>
            {node.name}
          </span>
        </button>
        {node.file ? <ChangeStats file={node.file} /> : <span className="change-row-stats">{files.length}</span>}
        <ChangeStatusBadge status={status} />
        <button
          className={`change-native-check${allChecked ? ' is-checked' : ''}${mixed ? ' is-mixed' : ''}`}
          type="button"
          aria-label={allChecked ? '取消选择' : '选择'}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelection(files);
          }}
        />
      </div>
      {isDirectory && isExpanded ? (
        <div className="change-native-children">
          {node.children.map((child) => (
            <ChangeTreeRow
              key={`${bucket}:${child.path}:${child.kind}`}
              node={child}
              depth={depth + 1}
              bucket={bucket}
              activePath={activePath}
              expandedPaths={expandedPaths}
              selectedKeys={selectedKeys}
              onToggleExpanded={onToggleExpanded}
              onToggleSelection={onToggleSelection}
              onOpenDiff={onOpenDiff}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function ChangesBucketTree({
  bucket,
  files,
  activePath,
  selectedKeys,
  setSelectedKeys,
  onOpenDiff,
}: {
  bucket: GitBucket;
  files: FileStatus[];
  activePath?: string;
  selectedKeys: Set<string>;
  setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  onOpenDiff: (path: string) => void;
}) {
  const { t } = useTranslation();
  const nodes = useMemo(() => buildChangeTree(files), [files]);
  const [expandedPaths, setExpandedPaths] = useState(() => defaultExpandedPaths(nodes));
  const treeSignature = useMemo(() => files.map((file) => file.path).sort().join('\n'), [files]);
  const previousSignatureRef = useRef(treeSignature);
  const selectedCount = useMemo(
    () => files.reduce((count, file) => count + (selectedKeys.has(statusKey(file)) ? 1 : 0), 0),
    [files, selectedKeys],
  );
  const allSelected = files.length > 0 && selectedCount === files.length;
  const partiallySelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (previousSignatureRef.current === treeSignature) return;
    previousSignatureRef.current = treeSignature;
    setExpandedPaths(defaultExpandedPaths(nodes));
  }, [nodes, treeSignature]);

  useEffect(() => {
    const validKeys = new Set(files.map(statusKey));
    setSelectedKeys((current) => new Set([...current].filter((key) => !key.startsWith(`${bucket}:`) || validKeys.has(key))));
  }, [bucket, files, setSelectedKeys]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleSelection = useCallback(
    (targetFiles: FileStatus[]) => {
      const allSelected = targetFiles.length > 0 && targetFiles.every((file) => selectedKeys.has(statusKey(file)));
      setSelectedKeys((current) => {
        const next = new Set(current);
        for (const file of targetFiles) {
          const key = statusKey(file);
          if (allSelected) next.delete(key);
          else next.add(key);
        }
        return next;
      });
    },
    [selectedKeys, setSelectedKeys],
  );

  const toggleBucketSelection = useCallback(() => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const file of files) {
        const key = statusKey(file);
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }, [allSelected, files, setSelectedKeys]);

  return (
    <section className="changes-bucket">
      <div className="changes-bucket-heading">
        <span className="font-[510]">{bucketTitle(bucket, t)}</span>
        <button
          className={`change-bucket-check${allSelected ? ' is-checked' : ''}${partiallySelected ? ' is-mixed' : ''}`}
          type="button"
          aria-label={allSelected ? t('changes.deselectBucket') : t('changes.selectBucket')}
          title={allSelected ? t('changes.deselectBucket') : t('changes.selectBucket')}
          onClick={toggleBucketSelection}
        >
          <span className="change-bucket-count tabular-nums">
            {selectedCount}/{files.length}
          </span>
          <span className="change-native-check-mark" />
        </button>
      </div>
      <div className="change-native-tree">
        {nodes.map((node) => (
          <ChangeTreeRow
            key={`${bucket}:${node.path}:${node.kind}`}
            node={node}
            depth={0}
            bucket={bucket}
            activePath={activePath}
            expandedPaths={expandedPaths}
            selectedKeys={selectedKeys}
            onToggleExpanded={toggleExpanded}
            onToggleSelection={toggleSelection}
            onOpenDiff={onOpenDiff}
          />
        ))}
      </div>
    </section>
  );
}

export function ChangesPanel() {
  const { t } = useTranslation();
  const workspace = useActiveWorkspace();
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null);
  const [generating, setGenerating] = useState(false);
  const addToast = useAppStore((state) => state.addToast);
  const openDiffTab = useAppStore((state) => state.openDiffTab);
  const triggerGitRefresh = useAppStore((state) => state.triggerGitRefresh);
  const gitRefreshEpoch = useAppStore((state) => state.gitRefreshEpoch);
  const spinnerStyle = useAppStore((state) => state.settings.spinnerStyle);
  const commitPromptTemplate = useAppStore((state) => state.settings.commitPromptTemplate);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const branchStats = useAppStore((state) => (activeWorkspaceId ? state.branchStats[activeWorkspaceId] : undefined));
  const activeDiffPath = useAppStore(
    (state) => state.tabs.find((tab) => tab.workspaceId === activeWorkspaceId && tab.type === 'diff')?.activePath,
  );

  const prevSignature = useRef('');

  const load = useCallback(
    async (silent?: boolean) => {
      if (!workspace) return;
      if (!silent) setLoading(true);
      try {
        const next = await window.forgepad.git.getStatus(workspace.worktreePath);
        const sig = next.map((s) => statusKey(s)).join(',');
        setStatuses(next);
        setSelectedKeys((current) => new Set([...current].filter((key) => next.some((status) => statusKey(status) === key))));
        if (sig !== prevSignature.current) {
          prevSignature.current = sig;
          if (silent) triggerGitRefresh();
        }
      } catch (error) {
        addToast('error', error instanceof Error ? error.message : t('changes.failedLoadStatus'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [addToast, workspace, triggerGitRefresh, t],
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

  const selected = useMemo(() => statuses.filter((status) => selectedKeys.has(statusKey(status))), [selectedKeys, statuses]);
  const selectedStageable = useMemo(
    () => selected.filter((status) => status.bucket === 'unstaged' || status.bucket === 'untracked'),
    [selected],
  );
  const selectedStaged = useMemo(() => selected.filter((status) => status.bucket === 'staged'), [selected]);
  const selectedDiscardable = useMemo(() => selected.filter((status) => status.bucket !== 'staged'), [selected]);

  const byBucket = useMemo(() => {
    const buckets: Record<GitBucket, FileStatus[]> = {
      staged: [],
      unstaged: [],
      untracked: [],
    };
    for (const status of statuses) buckets[status.bucket].push(status);
    return buckets;
  }, [statuses]);

  const onOpenDiff = useCallback(
    (path: string) => {
      if (!workspace) return;
      openDiffTab(workspace.id, path);
    },
    [openDiffTab, workspace],
  );

  const mutate = async (kind: 'stage' | 'unstage' | 'discard' | 'commit') => {
    if (!workspace) return;
    try {
      if (kind === 'stage') {
        await window.forgepad.git.stage(
          workspace.worktreePath,
          selectedStageable.map((s) => s.path),
        );
      } else if (kind === 'unstage') {
        await window.forgepad.git.unstage(
          workspace.worktreePath,
          selectedStaged.map((s) => s.path),
        );
      } else if (kind === 'discard') {
        const ok = await confirmNative(t('changes.discardConfirm'));
        if (!ok) return;
        await window.forgepad.git.discard(
          workspace.worktreePath,
          selectedDiscardable.map((s) => ({ path: s.path, bucket: s.bucket })),
        );
      } else if (kind === 'commit') {
        await window.forgepad.git.commit(workspace.worktreePath, commitMessage);
        setCommitMessage('');
      }
      await load();
      triggerGitRefresh();
      addToast('success', t('changes.gitOpCompleted'));
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : t('changes.gitOpFailed'));
    }
  };

  const handleSync = async (kind: 'push' | 'pull') => {
    if (!workspace || syncing) return;
    setSyncing(kind);
    try {
      if (kind === 'push') {
        await window.forgepad.git.push(workspace.worktreePath);
      } else {
        await window.forgepad.git.pull(workspace.worktreePath);
      }
      await load();
      triggerGitRefresh();
      addToast('success', t('changes.gitOpCompleted'));
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : t('changes.gitOpFailed'));
    } finally {
      setSyncing(null);
    }
  };

  const handleGenerateAI = async () => {
    if (!workspace || generating) return;
    setGenerating(true);
    try {
      const message = await window.forgepad.git.generateCommitMessage(workspace.worktreePath, commitPromptTemplate);
      setCommitMessage(message);
      await load();
      triggerGitRefresh();
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : t('changes.gitOpFailed'));
    } finally {
      setGenerating(false);
    }
  };

  if (!workspace) {
    return <div className="grid min-h-[90px] place-items-center text-muted">{t('changes.openProjectFirst')}</div>;
  }

  const bucketOrder: GitBucket[] = ['staged', 'unstaged', 'untracked'];

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden py-2.5 pl-2.5">
      <div className="flex min-h-8 items-center gap-2 pr-2.5">
        <button className="secondary-button" type="button" disabled={selectedStageable.length === 0} onClick={() => mutate('stage')}>
          <Check size={15} />
          {t('changes.stage')}
        </button>
        <button className="secondary-button" type="button" disabled={selectedStaged.length === 0} onClick={() => mutate('unstage')}>
          <RotateCcw size={15} />
          {t('changes.unstage')}
        </button>
        <button
          className="icon-button danger"
          type="button"
          title={t('changes.discardSelected')}
          disabled={selectedDiscardable.length === 0}
          onClick={() => mutate('discard')}
        >
          <Trash2 size={15} />
        </button>
        <button className="icon-button" type="button" title={t('changes.refreshChanges')} onClick={() => void load()}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="changes-list scrollbar-thin flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {loading && (
          <div className="grid min-h-[52px] place-items-center text-muted">
            <span className="flex items-center gap-1.5 text-xs">
              <Spinner name={spinnerStyle} size={16} dotSize={2} />
            </span>
          </div>
        )}
        {!loading && statuses.length === 0 && (
          <div className="grid min-h-[52px] place-items-center text-muted">{t('changes.cleanWorkingTree')}</div>
        )}
        {!loading &&
          bucketOrder.map((bucket) => {
            const files = byBucket[bucket];
            if (files.length === 0) return null;
            return (
              <ChangesBucketTree
                key={bucket}
                bucket={bucket}
                files={files}
                activePath={activeDiffPath}
                selectedKeys={selectedKeys}
                setSelectedKeys={setSelectedKeys}
                onOpenDiff={onOpenDiff}
              />
            );
          })}
      </div>

      <div className="mr-2.5 grid gap-2 border-border border-t pt-2.5">
        <div className="relative">
          <textarea
            className="commit-textarea pr-8"
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.currentTarget.value)}
            placeholder={t('changes.commitMessage')}
          />
          <button
            className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.08] hover:text-accent disabled:pointer-events-none disabled:opacity-40"
            type="button"
            title={t('changes.generateTitle')}
            disabled={generating || statuses.length === 0}
            onClick={() => void handleGenerateAI()}
          >
            {generating ? <Spinner name={spinnerStyle} size={14} dotSize={2} /> : <Sparkles size={14} />}
          </button>
        </div>
        <button className="primary-button w-full" type="button" disabled={!commitMessage.trim()} onClick={() => mutate('commit')}>
          <GitCommitHorizontal size={16} />
          {t('changes.commitStaged')}
        </button>
        <div className="flex gap-2">
          <button
            className="secondary-button flex-1"
            type="button"
            title={t('changes.pullTitle')}
            disabled={syncing !== null}
            onClick={() => void handleSync('pull')}
          >
            {syncing === 'pull' ? <Spinner name={spinnerStyle} size={14} dotSize={2} /> : <ArrowDown size={15} />}
            <span>{t('changes.pull')}</span>
            {branchStats?.behind ? <span className="tabular-nums text-subtle">{branchStats.behind}</span> : null}
          </button>
          <button
            className="secondary-button flex-1"
            type="button"
            title={t('changes.pushTitle')}
            disabled={syncing !== null}
            onClick={() => void handleSync('push')}
          >
            {syncing === 'push' ? <Spinner name={spinnerStyle} size={14} dotSize={2} /> : <ArrowUp size={15} />}
            <span>{t('changes.push')}</span>
            {branchStats?.ahead ? <span className="tabular-nums text-subtle">{branchStats.ahead}</span> : null}
          </button>
        </div>
      </div>
    </section>
  );
}
