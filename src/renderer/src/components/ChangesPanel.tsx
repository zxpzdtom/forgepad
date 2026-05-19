import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from '@renderer/i18n';
import { confirmNative } from '@renderer/lib/native-dialog';
import { useAppStore } from '@renderer/store/app-store';
import type { FileStatus, GitBucket, GitCommitFileSummary, GitCommitMeta, GitStatusKind, Workspace } from '@shared/types';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  GitCommitHorizontal,
  List,
  ListTree,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { FileIcon } from './FileIcon';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';

const DISCARD_CONFIRM_GRACE_MS = 10_000;

function useActiveWorkspace(): Workspace | undefined {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
}

function statusKey(status: FileStatus): string {
  return `${status.bucket}:${status.path}`;
}

type ChangeSection = 'staged' | 'changes';

function sectionTitle(section: ChangeSection, t: (key: string) => string): string {
  return section === 'staged' ? t('changes.staged') : t('changes.changes');
}

function belongsToSection(status: FileStatus, section: ChangeSection): boolean {
  return section === 'staged' ? status.bucket === 'staged' : status.bucket !== 'staged';
}

type ChangeTreeNode = {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  children: ChangeTreeNode[];
  file?: FileStatus;
  aggregateStatus?: GitStatusKind;
  displayStatus?: GitStatusKind;
};

type CommitTreeNode = {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  children: CommitTreeNode[];
  file?: GitCommitFileSummary;
  aggregateStatus?: GitStatusKind;
  additions: number;
  deletions: number;
};

type ChangesViewMode = 'tree' | 'flat';
type ChangesPanelTab = 'changes' | 'commits';

const COMMIT_HISTORY_LIMIT = 14;

/** Module-level cache for commit history summaries — survives tab switches. */
const commitMetaCache = new Map<string, { metas: GitCommitMeta[]; epoch: number }>();
/** Module-level cache for per-commit file details — avoids re-fetching on re-expand. */
const commitFilesCacheMap = new Map<string, GitCommitFileSummary[]>();

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

function showStagedRenameAsDelete(file: FileStatus, splitStagedRenamePaths: Set<string>): boolean {
  return file.bucket === 'staged' && file.status === 'renamed' && Boolean(file.oldPath) && splitStagedRenamePaths.has(file.path);
}

function displayPath(file: FileStatus, splitStagedRenamePaths: Set<string>): string {
  return showStagedRenameAsDelete(file, splitStagedRenamePaths) ? (file.oldPath ?? file.path) : file.path;
}

function displayStatus(file: FileStatus, splitStagedRenamePaths: Set<string>): GitStatusKind {
  return showStagedRenameAsDelete(file, splitStagedRenamePaths) ? 'deleted' : file.status;
}

function splitDisplayPath(path: string): { name: string; directory: string } {
  const index = path.lastIndexOf('/');
  if (index === -1) return { name: path, directory: '' };
  return {
    name: path.slice(index + 1),
    directory: path.slice(0, index),
  };
}

function compactDirectoryPath(directory: string): string {
  const parts = directory.split('/').filter(Boolean);
  if (parts.length <= 2) return directory;
  return `.../${parts.slice(-2).join('/')}`;
}

function buildChangeTree(files: FileStatus[], splitStagedRenamePaths: Set<string>): ChangeTreeNode[] {
  const root: ChangeTreeNode = { name: '', path: '', kind: 'directory', children: [] };
  for (const file of files) {
    const path = displayPath(file, splitStagedRenamePaths);
    const parts = path.split('/').filter(Boolean);
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
      if (isFile) {
        child.file = file;
        child.displayStatus = displayStatus(file, splitStagedRenamePaths);
      }
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
    const status = node.displayStatus ?? node.file.status;
    node.aggregateStatus = status;
    return status;
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

function changeStats(files: FileStatus[]): { additions: number; deletions: number } {
  return files.reduce(
    (stats, file) => ({
      additions: stats.additions + (file.additions ?? 0),
      deletions: stats.deletions + (file.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  );
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

function buildCommitTree(files: GitCommitFileSummary[]): CommitTreeNode[] {
  const root: CommitTreeNode = { name: '', path: '', kind: 'directory', children: [], additions: 0, deletions: 0 };
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;
    for (let index = 0; index < parts.length; index++) {
      const name = parts[index];
      const path = parts.slice(0, index + 1).join('/');
      const isFile = index === parts.length - 1;
      let child = current.children.find((node) => node.name === name && node.kind === (isFile ? 'file' : 'directory'));
      if (!child) {
        child = { name, path, kind: isFile ? 'file' : 'directory', children: [], additions: 0, deletions: 0 };
        current.children.push(child);
      }
      if (isFile) {
        child.file = file;
        child.aggregateStatus = file.status;
        child.additions = file.additions;
        child.deletions = file.deletions;
      }
      current = child;
    }
  }
  collapseSingleCommitDirectories(root);
  sortAndAggregateCommitTree(root);
  return root.children;
}

function collapseSingleCommitDirectories(node: CommitTreeNode) {
  for (const child of node.children) collapseSingleCommitDirectories(child);
  while (node.kind === 'directory' && node.children.length === 1 && node.children[0].kind === 'directory') {
    const only = node.children[0];
    node.name = node.name ? `${node.name}/${only.name}` : only.name;
    node.path = only.path;
    node.children = only.children;
  }
}

function sortAndAggregateCommitTree(node: CommitTreeNode): GitStatusKind | undefined {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
  if (node.file) return node.file.status;
  let additions = 0;
  let deletions = 0;
  const childStatuses: GitStatusKind[] = [];
  for (const child of node.children) {
    const status = sortAndAggregateCommitTree(child);
    if (status) childStatuses.push(status);
    additions += child.additions;
    deletions += child.deletions;
  }
  node.additions = additions;
  node.deletions = deletions;
  const aggregate = childStatuses.sort((a, b) => statusRank(a) - statusRank(b))[0];
  node.aggregateStatus = aggregate;
  return aggregate;
}

function defaultExpandedCommitPaths(nodes: CommitTreeNode[]): Set<string> {
  const expanded = new Set<string>();
  const walk = (items: CommitTreeNode[], depth: number) => {
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

function ChangeStats({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions <= 0 && deletions <= 0) {
    return <span className="change-row-stats is-empty" />;
  }
  return (
    <span className="change-row-stats">
      {additions > 0 ? <span className="change-stat-add">+{additions}</span> : null}
      {deletions > 0 ? <span className="change-stat-del">-{deletions}</span> : null}
    </span>
  );
}

function CommitHistorySection({
  commits,
  commitFilesMap,
  worktreePath,
  viewMode,
  activeCommitHash,
  activePath,
  onOpenCommitFile,
  onFilesLoaded,
}: {
  commits: GitCommitMeta[];
  commitFilesMap: Map<string, GitCommitFileSummary[]>;
  worktreePath: string;
  viewMode: ChangesViewMode;
  activeCommitHash?: string;
  activePath?: string;
  onOpenCommitFile: (commit: GitCommitMeta, file: GitCommitFileSummary) => void;
  onFilesLoaded: (hash: string, files: GitCommitFileSummary[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(commits[0]?.hash ? [commits[0].hash] : []));
  const loadingFilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setExpanded((current) => {
      const valid = new Set(commits.map((commit) => commit.hash));
      const next = new Set([...current].filter((hash) => valid.has(hash)));
      if (next.size === 0 && commits[0]) next.add(commits[0].hash);
      return next;
    });
  }, [commits]);

  // Load files for expanded commits that don't have data yet
  useEffect(() => {
    for (const hash of expanded) {
      if (!commitFilesMap.has(hash) && !loadingFilesRef.current.has(hash)) {
        loadingFilesRef.current.add(hash);
        window.forgepad.git
          .getCommitFiles(worktreePath, hash)
          .then((files) => {
            commitFilesCacheMap.set(`${worktreePath}:${hash}`, files);
            onFilesLoaded(hash, files);
          })
          .catch(() => {
            // Silently handle errors — row will just show no files
          })
          .finally(() => {
            loadingFilesRef.current.delete(hash);
          });
      }
    }
  }, [expanded, commitFilesMap, worktreePath, onFilesLoaded]);

  const toggleCommit = useCallback((hash: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }, []);

  if (commits.length === 0) return null;

  return (
    <section className="changes-bucket commit-history-section">
      <div className="change-native-tree">
        {commits.map((commit) => {
          const isExpanded = expanded.has(commit.hash);
          const files = commitFilesMap.get(commit.hash);
          return (
            <div className="commit-history-group" key={commit.hash}>
              <button
                className="change-native-row commit-history-row"
                style={{ '--change-depth': 0 } as CSSProperties}
                type="button"
                title={`${commit.shortHash} ${commit.subject}`}
                onClick={() => toggleCommit(commit.hash)}
              >
                <span className={`change-native-chevron${isExpanded ? ' is-expanded' : ''}`}>
                  <ChevronRight size={14} />
                </span>
                <span className="commit-history-subject">{commit.subject}</span>
                <ChangeStats additions={commit.additions} deletions={commit.deletions} />
              </button>
              {isExpanded ? (
                <div className="change-native-children">
                  {files ? (
                    viewMode === 'flat' ? (
                      [...files]
                        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }))
                        .map((file) => (
                          <CommitFileRow
                            key={`${commit.hash}:${file.path}:${file.oldPath ?? ''}`}
                            file={file}
                            active={commit.hash === activeCommitHash && file.path === activePath}
                            showDirectory
                            onOpen={() => onOpenCommitFile(commit, file)}
                          />
                        ))
                    ) : (
                      <CommitTree
                        commit={{ ...commit, files }}
                        active={commit.hash === activeCommitHash ? activePath : undefined}
                        onOpenCommitFile={(c, f) => onOpenCommitFile(commit, f)}
                      />
                    )
                  ) : (
                    <div className="flex items-center justify-center py-2 text-muted">
                      <RefreshCw size={12} className="animate-spin" />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CommitTree({
  commit,
  active,
  onOpenCommitFile,
}: {
  commit: GitCommitMeta & { files: GitCommitFileSummary[] };
  active?: string;
  onOpenCommitFile: (commit: GitCommitMeta, file: GitCommitFileSummary) => void;
}) {
  const nodes = useMemo(() => buildCommitTree(commit.files), [commit.files]);
  const [expandedPaths, setExpandedPaths] = useState(() => defaultExpandedCommitPaths(nodes));
  const treeSignature = useMemo(() => commit.files.map((file) => file.path).sort().join('\n'), [commit.files]);
  const previousSignatureRef = useRef(treeSignature);

  useEffect(() => {
    if (previousSignatureRef.current === treeSignature) return;
    previousSignatureRef.current = treeSignature;
    setExpandedPaths(defaultExpandedCommitPaths(nodes));
  }, [nodes, treeSignature]);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <>
      {nodes.map((node) => (
        <CommitTreeRow
          key={`${commit.hash}:${node.path}:${node.kind}`}
          commit={commit}
          node={node}
          depth={1}
          active={active}
          expandedPaths={expandedPaths}
          onToggleExpanded={toggleExpanded}
          onOpenCommitFile={onOpenCommitFile}
        />
      ))}
    </>
  );
}

function CommitTreeRow({
  commit,
  node,
  depth,
  active,
  expandedPaths,
  onToggleExpanded,
  onOpenCommitFile,
}: {
  commit: GitCommitMeta & { files: GitCommitFileSummary[] };
  node: CommitTreeNode;
  depth: number;
  active?: string;
  expandedPaths: Set<string>;
  onToggleExpanded: (path: string) => void;
  onOpenCommitFile: (commit: GitCommitMeta, file: GitCommitFileSummary) => void;
}) {
  const isDirectory = node.kind === 'directory';
  const isExpanded = expandedPaths.has(node.path);
  const isActive = node.file ? node.file.path === active : false;
  const status = node.aggregateStatus ?? node.file?.status ?? 'modified';

  return (
    <>
      {isDirectory ? (
        <div className="change-native-row commit-file-row is-directory" style={{ '--change-depth': depth } as CSSProperties}>
          <button className="change-native-main is-directory" type="button" onClick={() => onToggleExpanded(node.path)}>
            <span className={`change-native-chevron${isExpanded ? ' is-expanded' : ''}`}>
              <ChevronRight size={14} />
            </span>
            <span className="change-native-icon">{isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}</span>
            <span className="change-native-name" title={node.path}>
              {node.name}
            </span>
          </button>
          <ChangeStats additions={node.additions} deletions={node.deletions} />
          <ChangeStatusBadge status={status} />
        </div>
      ) : node.file ? (
        <CommitFileRow file={node.file} active={isActive} depth={depth} onOpen={() => onOpenCommitFile(commit, node.file!)} />
      ) : null}
      {isDirectory && isExpanded ? (
        <div className="change-native-children">
          {node.children.map((child) => (
            <CommitTreeRow
              key={`${commit.hash}:${child.path}:${child.kind}`}
              commit={commit}
              node={child}
              depth={depth + 1}
              active={active}
              expandedPaths={expandedPaths}
              onToggleExpanded={onToggleExpanded}
              onOpenCommitFile={onOpenCommitFile}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function CommitFileRow({
  file,
  active,
  depth = 1,
  showDirectory = false,
  onOpen,
}: {
  file: GitCommitFileSummary;
  active: boolean;
  depth?: number;
  showDirectory?: boolean;
  onOpen: () => void;
}) {
  const pathParts = splitDisplayPath(file.path);
  return (
    <div className={`change-native-row commit-file-row is-file${active ? ' is-active' : ''}`} style={{ '--change-depth': depth } as CSSProperties}>
      <button className="change-native-main" type="button" onClick={onOpen}>
        <span className="change-native-chevron" />
        <span className="change-native-icon">
          <FileIcon filePath={file.path} size={15} />
        </span>
        <span className="change-flat-label commit-file-label" title={file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path}>
          <span className="change-flat-name">{pathParts.name}</span>
          {showDirectory && pathParts.directory ? <span className="change-flat-path">{compactDirectoryPath(pathParts.directory)}</span> : null}
        </span>
      </button>
      <ChangeStats additions={file.additions} deletions={file.deletions} />
      <ChangeStatusBadge status={file.status} />
    </div>
  );
}

function ChangeTreeRow({
  node,
  depth,
  section,
  splitStagedRenamePaths,
  activePath,
  expandedPaths,
  selectedKeys,
  onToggleExpanded,
  onToggleSelection,
  onOpenDiff,
  onStageFiles,
  onUnstageFiles,
  onDiscardFiles,
}: {
  node: ChangeTreeNode;
  depth: number;
  section: ChangeSection;
  splitStagedRenamePaths: Set<string>;
  activePath?: string;
  expandedPaths: Set<string>;
  selectedKeys: Set<string>;
  onToggleExpanded: (path: string) => void;
  onToggleSelection: (files: FileStatus[]) => void;
  onOpenDiff: (file: FileStatus, displayPath: string, displayStatus: GitStatusKind) => void;
  onStageFiles: (files: FileStatus[]) => void;
  onUnstageFiles: (files: FileStatus[]) => void;
  onDiscardFiles: (files: FileStatus[]) => void;
}) {
  const { t } = useTranslation();
  const isDirectory = node.kind === 'directory';
  const isExpanded = expandedPaths.has(node.path);
  const files = useMemo(() => collectFiles(node), [node]);
  const checkedCount = files.filter((file) => selectedKeys.has(statusKey(file))).length;
  const allChecked = files.length > 0 && checkedCount === files.length;
  const mixed = checkedCount > 0 && !allChecked;
  const status = node.aggregateStatus ?? node.file?.status ?? 'modified';
  const stageableFiles = useMemo(() => files.filter((file) => file.bucket === 'unstaged' || file.bucket === 'untracked'), [files]);
  const stagedFiles = useMemo(() => files.filter((file) => file.bucket === 'staged'), [files]);
  const discardableFiles = useMemo(() => files.filter((file) => file.bucket !== 'staged'), [files]);
  const hasInlineActions = stageableFiles.length > 0 || stagedFiles.length > 0 || discardableFiles.length > 0;
  const fileDisplayStatus = node.file ? displayStatus(node.file, splitStagedRenamePaths) : undefined;
  const nodeDisplayPath = node.file ? displayPath(node.file, splitStagedRenamePaths) : node.path;
  const isActive = node.file ? nodeDisplayPath === activePath : false;
  const stats = useMemo(() => (node.file ? changeStats(files) : null), [files, node.file]);
  const rowClassName = `change-native-row ${isDirectory ? 'is-directory' : 'is-file'}${hasInlineActions ? ' has-actions' : ''}${!isDirectory && isActive ? ' is-active' : ''}${
    fileDisplayStatus === 'deleted' ? ' is-deleted' : ''
  }`;

  return (
    <>
      <div className={rowClassName} style={{ '--change-depth': depth } as CSSProperties}>
        <button
          className={`change-native-main${isDirectory ? ' is-directory' : ''}`}
          type="button"
          onClick={() => {
            if (isDirectory) onToggleExpanded(node.path);
            else if (node.file) onOpenDiff(node.file, nodeDisplayPath, fileDisplayStatus ?? node.file.status);
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
        {stats ? (
          <ChangeStats additions={stats.additions} deletions={stats.deletions} />
        ) : (
          <span className="change-row-stats" />
        )}
        <ChangeStatusBadge status={status} />
        <span className="change-row-actions">
          {stageableFiles.length > 0 ? (
            <Tooltip label={t('changes.stageItem')}>
              <button
                className="change-row-action"
                type="button"
                aria-label={t('changes.stageItem')}
                onClick={(event) => {
                  event.stopPropagation();
                  onStageFiles(stageableFiles);
                }}
              >
                <Plus size={13} />
              </button>
            </Tooltip>
          ) : null}
          {stagedFiles.length > 0 ? (
            <Tooltip label={t('changes.unstageItem')}>
              <button
                className="change-row-action"
                type="button"
                aria-label={t('changes.unstageItem')}
                onClick={(event) => {
                  event.stopPropagation();
                  onUnstageFiles(stagedFiles);
                }}
              >
                <RotateCcw size={13} />
              </button>
            </Tooltip>
          ) : null}
          {discardableFiles.length > 0 ? (
            <Tooltip label={t('changes.discardItem')}>
              <button
                className="change-row-action is-danger"
                type="button"
                aria-label={t('changes.discardItem')}
                onClick={(event) => {
                  event.stopPropagation();
                  onDiscardFiles(discardableFiles);
                }}
              >
                <RotateCcw size={13} />
              </button>
            </Tooltip>
          ) : null}
        </span>
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
              key={`${section}:${child.path}:${child.kind}`}
              node={child}
              depth={depth + 1}
              section={section}
              splitStagedRenamePaths={splitStagedRenamePaths}
              activePath={activePath}
              expandedPaths={expandedPaths}
              selectedKeys={selectedKeys}
              onToggleExpanded={onToggleExpanded}
              onToggleSelection={onToggleSelection}
              onOpenDiff={onOpenDiff}
              onStageFiles={onStageFiles}
              onUnstageFiles={onUnstageFiles}
              onDiscardFiles={onDiscardFiles}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function ChangeFileRow({
  file,
  splitStagedRenamePaths,
  activePath,
  selected,
  onToggleSelection,
  onOpenDiff,
  onStageFiles,
  onUnstageFiles,
  onDiscardFiles,
}: {
  file: FileStatus;
  splitStagedRenamePaths: Set<string>;
  activePath?: string;
  selected: boolean;
  onToggleSelection: (file: FileStatus) => void;
  onOpenDiff: (file: FileStatus, displayPath: string, displayStatus: GitStatusKind) => void;
  onStageFiles: (files: FileStatus[]) => void;
  onUnstageFiles: (files: FileStatus[]) => void;
  onDiscardFiles: (files: FileStatus[]) => void;
}) {
  const { t } = useTranslation();
  const stats = changeStats([file]);
  const path = displayPath(file, splitStagedRenamePaths);
  const pathParts = splitDisplayPath(path);
  const status = displayStatus(file, splitStagedRenamePaths);
  const canStage = file.bucket === 'unstaged' || file.bucket === 'untracked';
  const canUnstage = file.bucket === 'staged';
  const canDiscard = file.bucket !== 'staged';
  const hasInlineActions = canStage || canUnstage || canDiscard;
  const rowClassName = `change-native-row is-file is-flat${hasInlineActions ? ' has-actions' : ''}${path === activePath ? ' is-active' : ''}${
    status === 'deleted' ? ' is-deleted' : ''
  }`;

  return (
    <div className={rowClassName} style={{ '--change-depth': 0 } as CSSProperties}>
      <button className="change-native-main" type="button" onClick={() => onOpenDiff(file, path, status)}>
        <span className="change-native-icon">
          <FileIcon filePath={file.path} size={15} />
        </span>
        <span className="change-flat-label" title={file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path}>
          <span className="change-flat-name">{pathParts.name}</span>
          {pathParts.directory ? <span className="change-flat-path">{compactDirectoryPath(pathParts.directory)}</span> : null}
        </span>
      </button>
      <ChangeStats additions={stats.additions} deletions={stats.deletions} />
      <ChangeStatusBadge status={status} />
      <span className="change-row-actions">
        {canStage ? (
          <Tooltip label={t('changes.stageItem')}>
            <button
              className="change-row-action"
              type="button"
              aria-label={t('changes.stageItem')}
              onClick={(event) => {
                event.stopPropagation();
                onStageFiles([file]);
              }}
            >
              <Plus size={13} />
            </button>
          </Tooltip>
        ) : null}
        {canUnstage ? (
          <Tooltip label={t('changes.unstageItem')}>
            <button
              className="change-row-action"
              type="button"
              aria-label={t('changes.unstageItem')}
              onClick={(event) => {
                event.stopPropagation();
                onUnstageFiles([file]);
              }}
            >
              <RotateCcw size={13} />
            </button>
          </Tooltip>
        ) : null}
        {canDiscard ? (
          <Tooltip label={t('changes.discardItem')}>
            <button
              className="change-row-action is-danger"
              type="button"
              aria-label={t('changes.discardItem')}
              onClick={(event) => {
                event.stopPropagation();
                onDiscardFiles([file]);
              }}
            >
              <RotateCcw size={13} />
            </button>
          </Tooltip>
        ) : null}
      </span>
      <button
        className={`change-native-check${selected ? ' is-checked' : ''}`}
        type="button"
        aria-label={selected ? '取消选择' : '选择'}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelection(file);
        }}
      />
    </div>
  );
}

function ChangesSectionTree({
  section,
  files,
  splitStagedRenamePaths,
  viewMode,
  activePath,
  selectedKeys,
  setSelectedKeys,
  onOpenDiff,
  onStageFiles,
  onUnstageFiles,
  onDiscardFiles,
}: {
  section: ChangeSection;
  files: FileStatus[];
  splitStagedRenamePaths: Set<string>;
  viewMode: ChangesViewMode;
  activePath?: string;
  selectedKeys: Set<string>;
  setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  onOpenDiff: (file: FileStatus, displayPath: string, displayStatus: GitStatusKind) => void;
  onStageFiles: (files: FileStatus[]) => void;
  onUnstageFiles: (files: FileStatus[]) => void;
  onDiscardFiles: (files: FileStatus[]) => void;
}) {
  const { t } = useTranslation();
  const nodes = useMemo(() => buildChangeTree(files, splitStagedRenamePaths), [files, splitStagedRenamePaths]);
  const [expandedPaths, setExpandedPaths] = useState(() => defaultExpandedPaths(nodes));
  const treeSignature = useMemo(
    () =>
      files
        .map((file) => displayPath(file, splitStagedRenamePaths))
        .sort()
        .join('\n'),
    [files, splitStagedRenamePaths],
  );
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
    setSelectedKeys(
      (current) =>
        new Set(
          [...current].filter((key) => {
            const bucket = key.slice(0, key.indexOf(':')) as GitBucket;
            const isSectionKey = section === 'staged' ? bucket === 'staged' : bucket !== 'staged';
            return !isSectionKey || validKeys.has(key);
          }),
        ),
    );
  }, [files, section, setSelectedKeys]);

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

  const toggleFileSelection = useCallback(
    (file: FileStatus) => {
      setSelectedKeys((current) => {
        const next = new Set(current);
        const key = statusKey(file);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [setSelectedKeys],
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
        <span className="font-[510]">{sectionTitle(section, t)}</span>
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
        {viewMode === 'flat'
          ? [...files]
              .sort((a, b) =>
                displayPath(a, splitStagedRenamePaths).localeCompare(displayPath(b, splitStagedRenamePaths), undefined, {
                  numeric: true,
                  sensitivity: 'base',
                }),
              )
              .map((file) => (
                <ChangeFileRow
                  key={statusKey(file)}
                  file={file}
                  splitStagedRenamePaths={splitStagedRenamePaths}
                  activePath={activePath}
                  selected={selectedKeys.has(statusKey(file))}
                  onToggleSelection={toggleFileSelection}
                  onOpenDiff={onOpenDiff}
                  onStageFiles={onStageFiles}
                  onUnstageFiles={onUnstageFiles}
                  onDiscardFiles={onDiscardFiles}
                />
              ))
          : nodes.map((node) => (
              <ChangeTreeRow
                key={`${section}:${node.path}:${node.kind}`}
                node={node}
                depth={0}
                section={section}
                splitStagedRenamePaths={splitStagedRenamePaths}
                activePath={activePath}
                expandedPaths={expandedPaths}
                selectedKeys={selectedKeys}
                onToggleExpanded={toggleExpanded}
                onToggleSelection={toggleSelection}
                onOpenDiff={onOpenDiff}
                onStageFiles={onStageFiles}
                onUnstageFiles={onUnstageFiles}
                onDiscardFiles={onDiscardFiles}
              />
            ))}
      </div>
    </section>
  );
}

export function ChangesPanel({ mode = 'changes' }: { mode?: ChangesPanelTab }) {
  const { t } = useTranslation();
  const workspace = useActiveWorkspace();
  const workspaceId = workspace?.id;
  const worktreePath = workspace?.worktreePath;
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [commitMetas, setCommitMetas] = useState<GitCommitMeta[]>([]);
  const [commitFilesMap, setCommitFilesMap] = useState<Map<string, GitCommitFileSummary[]>>(new Map());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null);
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<ChangesViewMode>('tree');
  const addToast = useAppStore((state) => state.addToast);
  const openDiffTab = useAppStore((state) => state.openDiffTab);
  const triggerGitRefresh = useAppStore((state) => state.triggerGitRefresh);
  const updateBranchChangeStats = useAppStore((state) => state.updateBranchChangeStats);
  const gitRefreshEpoch = useAppStore((state) => state.gitRefreshEpoch);
  const spinnerStyle = useAppStore((state) => state.settings.spinnerStyle);
  const commitPromptTemplate = useAppStore((state) => state.settings.commitPromptTemplate);
  const defaultAgentCommand = useAppStore((state) => state.settings.defaultAgentCommand);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const branchStats = useAppStore((state) => (activeWorkspaceId ? state.branchStats[activeWorkspaceId] : undefined));
  const activeDiffTab = useAppStore((state) => state.tabs.find((tab) => tab.workspaceId === activeWorkspaceId && tab.type === 'diff'));

  const prevSignature = useRef('');
  const loadedWorkspaceIdRef = useRef<string | null>(null);
  const loadedCommitWorkspaceIdRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const statusCacheRef = useRef<Map<string, FileStatus[]>>(new Map());
  const commitTextareaRef = useRef<HTMLTextAreaElement>(null);
  const lastDiscardConfirmedAtRef = useRef(0);
  const gitRefreshEpochRef = useRef(gitRefreshEpoch);
  gitRefreshEpochRef.current = gitRefreshEpoch;

  const load = useCallback(
    async (silent?: boolean) => {
      if (!workspaceId || !worktreePath) return;
      const requestId = ++loadRequestIdRef.current;
      const hasCachedData =
        mode === 'changes' ? loadedWorkspaceIdRef.current === workspaceId : loadedCommitWorkspaceIdRef.current === workspaceId;
      const showBlockingLoading = !silent && !hasCachedData;
      if (showBlockingLoading) setLoading(true);
      try {
        if (mode === 'commits') {
          const currentEpoch = gitRefreshEpochRef.current;
          // Check module-level cache first (survives tab switches)
          const cached = commitMetaCache.get(worktreePath);
          if (cached && cached.epoch === currentEpoch && !silent) {
            if (requestId !== loadRequestIdRef.current) return;
            setCommitMetas(cached.metas);
            // Restore per-commit file caches
            const restoredFiles = new Map<string, GitCommitFileSummary[]>();
            for (const meta of cached.metas) {
              const filesCache = commitFilesCacheMap.get(`${worktreePath}:${meta.hash}`);
              if (filesCache) restoredFiles.set(meta.hash, filesCache);
            }
            setCommitFilesMap(restoredFiles);
            loadedCommitWorkspaceIdRef.current = workspaceId;
          } else {
            // Phase 1: lightweight summary (single git command)
            const metas = await window.forgepad.git.getCommitHistorySummary(worktreePath, COMMIT_HISTORY_LIMIT);
            if (requestId !== loadRequestIdRef.current) return;
            setCommitMetas(metas);
            commitMetaCache.set(worktreePath, { metas, epoch: currentEpoch });
            // Clear stale file caches on refresh
            if (silent) {
              for (const meta of metas) {
                commitFilesCacheMap.delete(`${worktreePath}:${meta.hash}`);
              }
              setCommitFilesMap(new Map());
            }
            loadedCommitWorkspaceIdRef.current = workspaceId;
          }
        } else {
          const next = await window.forgepad.git.getStatus(worktreePath);
          if (requestId !== loadRequestIdRef.current) return;
          const sig = next.map((s) => statusKey(s)).join(',');
          setStatuses(next);
          statusCacheRef.current.set(workspaceId, next);
          loadedWorkspaceIdRef.current = workspaceId;
          updateBranchChangeStats(workspaceId, next);
          setSelectedKeys((current) => new Set([...current].filter((key) => next.some((status) => statusKey(status) === key))));
          if (sig !== prevSignature.current) {
            prevSignature.current = sig;
          }
        }
      } catch (error) {
        if (requestId !== loadRequestIdRef.current) return;
        addToast('error', error instanceof Error ? error.message : t('changes.failedLoadStatus'));
      } finally {
        if (requestId === loadRequestIdRef.current) setLoading(false);
      }
    },
    [addToast, mode, workspaceId, worktreePath, updateBranchChangeStats, t],
  );

  useEffect(() => {
    loadRequestIdRef.current += 1;
    prevSignature.current = '';
    const cached = workspaceId ? statusCacheRef.current.get(workspaceId) : undefined;
    loadedWorkspaceIdRef.current = cached && workspaceId ? workspaceId : null;
    loadedCommitWorkspaceIdRef.current = null;
    setStatuses(cached ?? []);
    setCommitMetas([]);
    setCommitFilesMap(new Map());
    setSelectedKeys(new Set());
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspaceId || gitRefreshEpoch === 0) return;
    void load(true);
  }, [gitRefreshEpoch, load, workspaceId]);

  const selected = useMemo(() => statuses.filter((status) => selectedKeys.has(statusKey(status))), [selectedKeys, statuses]);
  const selectedStageable = useMemo(
    () => selected.filter((status) => status.bucket === 'unstaged' || status.bucket === 'untracked'),
    [selected],
  );
  const selectedStaged = useMemo(() => selected.filter((status) => status.bucket === 'staged'), [selected]);
  const selectedDiscardable = useMemo(() => selected.filter((status) => status.bucket !== 'staged'), [selected]);

  const bySection = useMemo(() => {
    const sections: Record<ChangeSection, FileStatus[]> = {
      staged: [],
      changes: [],
    };
    for (const status of statuses) sections[belongsToSection(status, 'staged') ? 'staged' : 'changes'].push(status);
    return sections;
  }, [statuses]);

  const splitStagedRenamePaths = useMemo(
    () => new Set(statuses.filter((status) => status.bucket !== 'staged').map((status) => status.path)),
    [statuses],
  );

  const onOpenDiff = useCallback(
    (file: FileStatus, path: string, status: GitStatusKind) => {
      if (!workspace) return;
      openDiffTab(workspace.id, path, file.bucket, status, status === 'deleted' ? undefined : file.oldPath);
    },
    [openDiffTab, workspace],
  );

  const onOpenCommitFile = useCallback(
    (commit: GitCommitMeta, file: GitCommitFileSummary) => {
      if (!workspace) return;
      openDiffTab(workspace.id, file.path, 'staged', file.status, file.oldPath, commit.hash, commit.subject);
    },
    [openDiffTab, workspace],
  );

  const handleCommitFilesLoaded = useCallback((hash: string, files: GitCommitFileSummary[]) => {
    setCommitFilesMap((current) => {
      const next = new Map(current);
      next.set(hash, files);
      return next;
    });
  }, []);

  const mutateFiles = useCallback(
    async (kind: 'stage' | 'unstage' | 'discard', targetFiles: FileStatus[]) => {
      if (!workspace || targetFiles.length === 0) return;
      try {
        if (kind === 'stage') {
          const stageable = targetFiles.filter((status) => status.bucket === 'unstaged' || status.bucket === 'untracked');
          if (stageable.length === 0) return;
          await window.forgepad.git.stage(
            workspace.worktreePath,
            stageable.map((s) => s.path),
          );
        } else if (kind === 'unstage') {
          const staged = targetFiles.filter((status) => status.bucket === 'staged');
          if (staged.length === 0) return;
          await window.forgepad.git.unstage(
            workspace.worktreePath,
            staged.map((s) => s.path),
          );
        } else if (kind === 'discard') {
          const discardable = targetFiles.filter((status) => status.bucket !== 'staged');
          if (discardable.length === 0) return;
          const now = Date.now();
          if (now - lastDiscardConfirmedAtRef.current > DISCARD_CONFIRM_GRACE_MS) {
            const ok = await confirmNative(t('changes.discardConfirm'));
            if (!ok) return;
            lastDiscardConfirmedAtRef.current = Date.now();
          }
          await window.forgepad.git.discard(
            workspace.worktreePath,
            discardable.map((s) => ({ path: s.path, bucket: s.bucket })),
          );
        }
        await load();
        triggerGitRefresh();
        addToast('success', t('changes.gitOpCompleted'));
      } catch (error) {
        addToast('error', error instanceof Error ? error.message : t('changes.gitOpFailed'));
      }
    },
    [addToast, load, t, triggerGitRefresh, workspace],
  );

  const mutate = async (kind: 'stage' | 'unstage' | 'discard' | 'commit') => {
    if (!workspace) return;
    if (kind === 'stage') return mutateFiles('stage', selectedStageable);
    if (kind === 'unstage') return mutateFiles('unstage', selectedStaged);
    if (kind === 'discard') return mutateFiles('discard', selectedDiscardable);

    try {
      if (kind === 'commit') {
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
      const message = await window.forgepad.git.generateCommitMessage(
        workspace.worktreePath,
        commitPromptTemplate,
        defaultAgentCommand,
      );
      setCommitMessage(message);
      window.requestAnimationFrame(() => {
        const textarea = commitTextareaRef.current;
        if (!textarea) return;
        const end = message.length;
        textarea.focus();
        textarea.setSelectionRange(end, end);
      });
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : t('changes.gitOpFailed'));
    } finally {
      setGenerating(false);
    }
  };

  if (!workspace) {
    return <div className="grid min-h-[90px] place-items-center text-muted">{t('changes.openProjectFirst')}</div>;
  }

  const sectionOrder: ChangeSection[] = ['staged', 'changes'];
  const showInitialLoading = loading && (mode === 'changes' ? statuses.length === 0 : commitMetas.length === 0);
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden py-2.5 pl-2.5">
      <div className="flex min-h-8 items-center gap-2 pr-2.5">
        {mode === 'changes' ? (
          <>
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
          </>
        ) : null}
        <button className="icon-button" type="button" title={t('changes.refreshChanges')} onClick={() => void load(true)}>
          <RefreshCw size={15} />
        </button>
        <div className="ml-auto view-mode-toggle" role="radiogroup" aria-label={t('changes.viewMode')}>
          <button
            className={`view-mode-btn${viewMode === 'tree' ? ' active' : ''}`}
            type="button"
            role="radio"
            aria-checked={viewMode === 'tree'}
            title={t('changes.treeView')}
            onClick={() => setViewMode('tree')}
          >
            <ListTree size={15} />
          </button>
          <button
            className={`view-mode-btn${viewMode === 'flat' ? ' active' : ''}`}
            type="button"
            role="radio"
            aria-checked={viewMode === 'flat'}
            title={t('changes.flatView')}
            onClick={() => setViewMode('flat')}
          >
            <List size={15} />
          </button>
        </div>
      </div>

      <div className="changes-list scrollbar-thin flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {showInitialLoading && (
          <div className="grid min-h-[52px] place-items-center text-muted">
            <span className="flex items-center gap-1.5 text-xs">
              <Spinner name={spinnerStyle} size={16} dotSize={2} />
            </span>
          </div>
        )}
        {mode === 'changes' && !loading && statuses.length === 0 && (
          <div className="grid min-h-[52px] place-items-center text-muted">{t('changes.cleanWorkingTree')}</div>
        )}
        {mode === 'changes' &&
          !showInitialLoading &&
          sectionOrder.map((section) => {
            const files = bySection[section];
            if (files.length === 0) return null;
            return (
              <ChangesSectionTree
                key={section}
                section={section}
                files={files}
                splitStagedRenamePaths={splitStagedRenamePaths}
                viewMode={viewMode}
                activePath={activeDiffTab?.commitHash ? undefined : activeDiffTab?.activePath}
                selectedKeys={selectedKeys}
                setSelectedKeys={setSelectedKeys}
                onOpenDiff={onOpenDiff}
                onStageFiles={(files) => void mutateFiles('stage', files)}
                onUnstageFiles={(files) => void mutateFiles('unstage', files)}
                onDiscardFiles={(files) => void mutateFiles('discard', files)}
              />
            );
          })}
        {mode === 'commits' && !loading && commitMetas.length === 0 ? (
          <div className="grid min-h-[52px] place-items-center text-muted">{t('changes.noCommits')}</div>
        ) : null}
        {mode === 'commits' && !showInitialLoading && worktreePath ? (
          <CommitHistorySection
            commits={commitMetas}
            commitFilesMap={commitFilesMap}
            worktreePath={worktreePath}
            viewMode={viewMode}
            activeCommitHash={activeDiffTab?.commitHash}
            activePath={activeDiffTab?.activePath}
            onOpenCommitFile={onOpenCommitFile}
            onFilesLoaded={handleCommitFilesLoaded}
          />
        ) : null}
      </div>

      {mode === 'changes' ? (
        <div className="mr-2.5 grid gap-2 border-border border-t pt-2.5">
        <div className="relative">
          <textarea
            ref={commitTextareaRef}
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
      ) : null}
    </section>
  );
}
