import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '@renderer/store/app-store';
import type { AgentStatus } from '@shared/agent-lifecycle';
import type { Project } from '@shared/types';
import { FolderOpen, FolderPlus, RefreshCw, Settings } from 'lucide-react';

import { generateRandomBranchName } from '@renderer/lib/random-branch-name';

import { ContextMenu, type ContextMenuSection } from './ContextMenu';
import { Spinner } from './Spinner';

type SidebarWorkspace = {
  id: string;
  name: string;
  branch: string;
  worktreePath: string;
  createdAt: number;
  isRoot: boolean;
};

/* ── Inline SVG icons ─────────────────────────────────────────── */

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="16" />
    </svg>
  );
}

function AddIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12.001 5v14.002M19.002 12.002H5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GitBranchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 9c0 3-2 4-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GitMergeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7.021 8.28v7.127m7.39-3.402H10.02c-1.097 0-3.157-.88-3-3.225"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GitPullRequestIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M2 19V7.549c0-1.444 0-2.166.243-2.733a3 3 0 0 1 1.573-1.573C4.383 3 5.098 3 6.55 3h.494a2 2 0 0 1 1.557.745L10.418 6m0 0H16c1.4 0 2.1 0 2.635.272a2.5 2.5 0 0 1 1.092 1.093C20 7.9 20 8.6 20 10v1m-9.582-5H7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.158 15.514l.298-.742c.734-1.827 1.101-2.74 1.866-3.256C6.088 11 7.076 11 9.052 11h8.06c2.688 0 4.033 0 4.63.879.598.879.098 2.121-.9 4.607l-.298.742c-.734 1.827-1.101 2.74-1.866 3.256-.766.516-1.754.516-3.73.516h-8.06c-2.688 0-4.033 0-4.63-.879-.598-.878-.098-2.121.9-4.607z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClipboardCopyIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M11.502 13h9M13.502 10s-3 2.21-3 3 3 3 3 3M13.998 2h-5a1.5 1.5 0 0 0 0 3h5a1.5 1.5 0 1 0 0-3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.498 3.5c1.554.047 2.48.22 3.121.862.828.827.876 2.129.879 4.638m-12-5.5c-1.553.047-2.48.22-3.121.862-.879.878-.879 2.293-.879 5.121V16c0 2.828 0 4.242.879 5.121C5.255 22 6.67 22 9.498 22h4c2.829 0 4.243 0 5.121-.879.769-.768.865-1.946.877-4.12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderTreeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 7V5.333c0-.777 0-1.166.14-1.467a1.5 1.5 0 0 1 .726-.725C13.168 3 13.556 3 14.333 3c.408 0 .611 0 .8.05.2.052.386.146.548.274.152.12.275.284.519.61L17 5h1.5c.935 0 1.402 0 1.75.201a1.5 1.5 0 0 1 .549.549C21 6.098 21 6.565 21 7.5s0 1.402-.201 1.75a1.5 1.5 0 0 1-.549.549c-.348.201-.815.201-1.75.201H15c-1.414 0-2.121 0-2.56-.44C12 9.122 12 8.415 12 7zM12 18v-1.667c0-.777 0-1.165.14-1.467a1.5 1.5 0 0 1 .726-.726c.302-.14.69-.14 1.467-.14.408 0 .611 0 .8.05.2.052.386.146.548.274.152.12.275.284.519.61L17 16h1.5c.935 0 1.402 0 1.75.201a1.5 1.5 0 0 1 .549.549c.201.348.201.815.201 1.75s0 1.402-.201 1.75a1.5 1.5 0 0 1-.549.549c-.348.201-.815.201-1.75.201H15c-1.414 0-2.121 0-2.56-.44C12 20.122 12 19.415 12 18zM8 7H7c-.93 0-1.395 0-1.776-.102a3 3 0 0 1-2.122-2.122C3 4.395 3 3.93 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 3v10c0 1.87 0 2.804.402 3.5A3 3 0 0 0 4.5 17.598C5.196 18 6.13 18 8 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CancelIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M18 6L6 18m12 0L6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Project avatar (colored square + first letter) ───────────── */

const AVATAR_COLORS = [
  'bg-[#5e6ad2]', // brand indigo
  'bg-[#7170ff]', // accent violet
  'bg-[#828fff]', // accent hover
  'bg-[#7a7fad]', // security lavender
  'bg-[#62666d]', // quaternary gray
  'bg-[#8a8f98]', // tertiary gray
  'bg-[#4a4d55]', // dark gray
  'bg-[#3e3e44]', // border tertiary
  'bg-[#34343a]', // border secondary
  'bg-[#23252a]', // border primary
];

function ProjectAvatar({ name }: { name: string }) {
  const letter = (name[0] ?? '?').toUpperCase();
  // Deterministic color from name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorClass = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return (
    <span
      className={`flex size-5 shrink-0 items-center justify-center rounded font-[590] text-[#f7f8f8] text-[11px] ${colorClass}`}
    >
      {letter}
    </span>
  );
}

/* ── Relative time formatter ──────────────────────────────────── */

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

/**
 * Derive the "highest priority" agent status for a workspace.
 * Priority: permission > working > review > idle > undefined (no agents).
 */
function useWorkspaceAgentStatus(workspaceId: string): AgentStatus | undefined {
  const tabs = useAppStore((state) => state.tabs);
  const agentStatuses = useAppStore((state) => state.agentStatuses);
  const exitedPtyIds = useAppStore((state) => state.exitedPtyIds);

  return useMemo(() => {
    const agentTabs = tabs.filter((t) => t.workspaceId === workspaceId && t.type === 'terminal' && t.isAgent === true);
    if (agentTabs.length === 0) return undefined;

    let highest: AgentStatus | undefined;
    const priority: Record<AgentStatus, number> = {
      idle: 0,
      review: 1,
      working: 2,
      permission: 3,
    };

    for (const tab of agentTabs) {
      if (tab.type !== 'terminal') continue;
      const isExited = exitedPtyIds.has(tab.ptyId);
      const status: AgentStatus = agentStatuses[tab.ptyId] ?? 'idle';
      if (!highest || priority[status] > priority[highest]) {
        highest = status;
      }
    }
    return highest;
  }, [tabs, agentStatuses, exitedPtyIds, workspaceId]);
}

/** Animated status indicator for workspace items in the sidebar. */
function WorkspaceStatusDot({ isActive, agentStatus }: { isActive: boolean; agentStatus: AgentStatus | undefined }) {
  const spinnerStyle = useAppStore((state) => state.settings.spinnerStyle);

  // Working → unicode braille spinner
  if (agentStatus === 'working') {
    return (
      <span className="text-[14px] text-accent leading-none">
        <Spinner name={spinnerStyle as import('unicode-animations').BrailleSpinnerName} />
      </span>
    );
  }

  // Permission needed → pulsing amber dot
  if (agentStatus === 'permission') {
    return (
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-warn" />
      </span>
    );
  }

  // Review (agent finished) → green dot
  if (agentStatus === 'review') {
    return <span className="block size-2 rounded-full bg-ok" />;
  }

  // Default → nothing
  return null;
}

function SortableProjectGroup({
  projectId,
  name,
  isCollapsed,
  hasActive,
  children,
  onToggle,
  onAddWorktree,
  onContextMenu,
}: {
  projectId: string;
  name: string;
  isCollapsed: boolean;
  hasActive: boolean;
  children: ReactNode;
  onToggle: () => void;
  onAddWorktree: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: projectId,
    data: { type: 'project' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
    opacity: isDragging ? 0.74 : 1,
    zIndex: isDragging ? 20 : undefined,
    willChange: 'transform',
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/sidebar-project flex min-w-0 flex-col rounded-lg ${hasActive ? 'bg-panel/60' : ''} ${isDragging ? 'shadow-[0_16px_34px_rgba(0,0,0,0.28)] ring-1 ring-accent/25' : ''}`}
    >
      <div
        className="flex h-8 w-full cursor-grab items-center gap-1.5 rounded-md bg-transparent px-1.5 text-left text-text transition-colors duration-150 hover:bg-panel-2 active:cursor-grabbing"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        onContextMenu={onContextMenu}
        {...attributes}
        {...listeners}
      >
        <ProjectAvatar name={name} />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-[510] text-[13px]">{name}</span>
        <button
          className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-subtle opacity-0 transition-opacity hover:bg-panel-3 hover:text-text focus:opacity-100 group-hover/sidebar-project:opacity-100"
          type="button"
          title="New worktree"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onAddWorktree();
          }}
        >
          <AddIcon />
        </button>
        <ArrowDownIcon
          className={`shrink-0 cursor-pointer text-subtle transition-transform duration-200 ease-[ease]${isCollapsed ? '-rotate-90' : ''}`}
        />
      </div>
      {children}
    </div>
  );
}

function SortableWorkspaceRow({
  workspace,
  globalIndex,
  isActive,
  onClick,
  onDelete,
  onContextMenu,
}: {
  workspace: SidebarWorkspace;
  globalIndex: number;
  isActive: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const branchStats = useAppStore((state) => state.branchStats[workspace.id]);
  const stats = branchStats ?? {
    ahead: 0,
    behind: 0,
    additions: 0,
    deletions: 0,
  };
  const hasDiffStats = stats.additions > 0 || stats.deletions > 0;
  const hasRemoteStats = stats.ahead > 0 || stats.behind > 0;
  const prNumber = branchStats?.prNumber ?? null;
  const prUrl = branchStats?.prUrl ?? null;
  const agentStatus = useWorkspaceAgentStatus(workspace.id);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id,
    data: { type: 'workspace' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
    opacity: isDragging ? 0.68 : 1,
    zIndex: isDragging ? 30 : undefined,
    willChange: 'transform',
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/sidebar-workspace relative flex w-full min-w-0 cursor-grab items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 active:cursor-grabbing ${isActive ? '' : 'hover:bg-panel-2'} ${isDragging ? 'bg-panel-2 ring-1 ring-accent/20' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      {isActive && <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-accent" />}
      <div className="mt-[2px] flex size-[14px] shrink-0 items-center justify-center">
        {agentStatus && agentStatus !== 'idle' ? (
          <WorkspaceStatusDot isActive={isActive} agentStatus={agentStatus} />
        ) : prNumber ? (
          <GitPullRequestIcon className="text-[#a855f7]" />
        ) : (
          <GitBranchIcon className="text-subtle" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-[510]${isActive ? 'text-text' : ''}`}
          >
            {workspace.branch || 'detached'}
          </span>
          {prNumber && (
            <span
              role="link"
              tabIndex={0}
              className="shrink-0 cursor-pointer rounded-[3px] bg-[#a855f7]/10 px-[5px] py-px font-[560] font-mono text-[#a855f7] text-[9px] leading-[16px] transition-colors hover:bg-[#a855f7]/20"
              title={prUrl ? `Open PR #${prNumber}` : `PR #${prNumber}`}
              onClick={(e) => {
                e.stopPropagation();
                if (prUrl) void window.forgepad.shell.openExternal(prUrl);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && prUrl) {
                  e.stopPropagation();
                  void window.forgepad.shell.openExternal(prUrl);
                }
              }}
            >
              #{prNumber}
            </span>
          )}
          {hasDiffStats && (
            <span className="flex shrink-0 items-center gap-1 font-mono text-[10px]">
              {stats.additions > 0 && <span className="text-text-addition">+{stats.additions}</span>}
              {stats.deletions > 0 && <span className="text-text-deletion">−{stats.deletions}</span>}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-subtle">
            {formatRelativeTime(workspace.createdAt)}
          </span>
          {hasRemoteStats && (
            <span className="shrink-0 font-mono text-[10px] text-subtle">
              {stats.ahead > 0 ? `↑${stats.ahead}` : ''}
              {stats.ahead > 0 && stats.behind > 0 ? ' ' : ''}
              {stats.behind > 0 ? `↓${stats.behind}` : ''}
            </span>
          )}
          <span className="shrink-0 text-[10px] text-subtle/40 tabular-nums">⌘{globalIndex + 1}</span>
        </div>
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="h-3 w-[45%] animate-pulse rounded bg-border" />
        <div className="h-2.5 w-5 animate-pulse rounded bg-border" />
      </div>
      <div className="flex flex-col gap-1 px-2 py-1.5">
        <div className="h-3 w-[60%] animate-pulse rounded bg-border" />
        <div className="h-2.5 w-[35%] animate-pulse rounded bg-border" />
      </div>
      <div className="flex flex-col gap-1 px-2 py-1.5">
        <div className="h-3 w-[75%] animate-pulse rounded bg-border" />
        <div className="h-2.5 w-[45%] animate-pulse rounded bg-border" />
      </div>
    </div>
  );
} /* ── Project context menu ──────────────────────────────────────── */

function ProjectContextMenu({
  project,
  x,
  y,
  onClose,
  onNewWorktree,
  onCloseProject,
}: {
  project: Project;
  x: number;
  y: number;
  onClose: () => void;
  onNewWorktree: () => void;
  onCloseProject: () => void;
}) {
  const sections: ContextMenuSection[] = [
    {
      label: 'Open in Finder',
      icon: <FolderIcon className="size-4" />,
      action: () => { void window.forgepad.shell.openPath(project.repoPath); onClose(); },
    },
    {
      label: 'Copy Path',
      icon: <ClipboardCopyIcon className="size-4" />,
      action: () => { void navigator.clipboard.writeText(project.repoPath); onClose(); },
    },
    {
      label: 'New Worktree',
      icon: <FolderTreeIcon className="size-4" />,
      action: () => { onClose(); onNewWorktree(); },
    },
    'divider',
    {
      label: 'Close Project',
      icon: <CancelIcon className="size-4" />,
      danger: true,
      action: () => { onClose(); onCloseProject(); },
    },
  ];

  return <ContextMenu sections={sections} x={x} y={y} onClose={onClose} />;
}

/* ── Workspace context menu ───────────────────────────────────── */

function WorkspaceContextMenu({
  workspace,
  x,
  y,
  onClose,
  onDelete,
}: {
  workspace: SidebarWorkspace;
  x: number;
  y: number;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const sections: ContextMenuSection[] = [
    {
      label: 'Open in Finder',
      icon: <FolderIcon className="size-4" />,
      action: () => { void window.forgepad.shell.openPath(workspace.worktreePath); onClose(); },
    },
    {
      label: 'Copy Project Path',
      icon: <ClipboardCopyIcon className="size-4" />,
      action: () => { void navigator.clipboard.writeText(workspace.worktreePath); onClose(); },
    },
    {
      label: 'Copy Branch Name',
      icon: <GitMergeIcon className="size-4" />,
      action: () => { void navigator.clipboard.writeText(workspace.branch); onClose(); },
    },
    ...(onDelete
      ? [
          'divider' as const,
          {
            label: 'Delete Worktree',
            icon: <CancelIcon className="size-4" />,
            danger: true,
            action: () => { onClose(); onDelete(); },
          },
        ]
      : []),
  ];

  return <ContextMenu sections={sections} x={x} y={y} onClose={onClose} />;
}

/* ── New worktree dialog ──────────────────────────────────────── */

function NewWorktreeDialog({
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

/* ── Delete worktree confirmation dialog ─────────────────────── */

function DeleteWorktreeDialog({ branch, onClose, onConfirm }: { branch: string; onClose: () => void; onConfirm: () => void }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleDelete = () => {
    setLoading(true);
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85" onMouseDown={onClose}>
      <div
        className="w-[min(380px,90vw)] rounded-xl border border-border bg-panel-2 shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-border border-b px-4 py-3">
          <span className="font-[590] text-[14px] text-text">Delete Worktree</span>
        </div>
        <div className="px-4 py-4 text-[13px] text-subtle leading-relaxed">
          Are you sure you want to delete worktree <span className="font-[590] font-mono text-text">{branch}</span>? This will
          remove the worktree directory and delete the local branch.
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
            className="h-8 cursor-pointer rounded-md border border-transparent bg-danger px-3 text-[13px] text-accent-contrast hover:brightness-110 disabled:opacity-50"
            disabled={loading}
            onClick={handleDelete}
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    project: Project;
    x: number;
    y: number;
  } | null>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<{
    workspace: SidebarWorkspace;
    x: number;
    y: number;
  } | null>(null);
  const [worktreeDialog, setWorktreeDialog] = useState<{
    projectId: string;
    projectName: string;
    repoPath: string;
  } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    workspaceId: string;
    branch: string;
  } | null>(null);

  const projects = useAppStore((state) => state.projects);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const hydrated = useAppStore((state) => state.hydrated);
  const openProject = useAppStore((state) => state.openProject);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const reorderProjects = useAppStore((state) => state.reorderProjects);
  const reorderWorkspaces = useAppStore((state) => state.reorderWorkspaces);
  const removeProject = useAppStore((state) => state.removeProject);
  const deleteWorktree = useAppStore((state) => state.deleteWorktree);
  const createWorktree = useAppStore((state) => state.createWorktree);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  const workspaceOrder = useMemo(() => {
    const ordered: string[] = [];
    for (const project of projects) {
      for (const ws of workspaces.filter((w) => w.projectId === project.id)) {
        ordered.push(ws.id);
      }
    }
    return ordered;
  }, [projects, workspaces]);

  const workspaceIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [idx, id] of workspaceOrder.entries()) {
      map.set(id, idx);
    }
    return map;
  }, [workspaceOrder]);

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeProject = projects.find((project) => project.id === activeId);
    if (activeProject) {
      const overProject =
        projects.find((project) => project.id === overId) ??
        projects.find((project) => project.id === workspaces.find((workspace) => workspace.id === overId)?.projectId);
      if (overProject && activeProject.id !== overProject.id) {
        reorderProjects(activeProject.id, overProject.id);
      }
      return;
    }

    const activeWs = workspaces.find((w) => w.id === activeId);
    const overWs = workspaces.find((w) => w.id === overId);
    if (activeWs && overWs && activeWs.projectId === overWs.projectId) {
      reorderWorkspaces(activeWs.projectId, activeId, overId);
    }
  };

  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-col border-border border-r bg-sidebar-bg"
      onMouseDown={() => setFocusedColumn('sidebar')}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-border border-b px-3">
        <span className="font-semibold text-[11px] text-muted uppercase tracking-wider">Workspaces</span>
        <button
          className="icon-button small border-transparent"
          type="button"
          title="设置"
          onClick={() => useAppStore.setState({ settingsOpen: true })}
        >
          <Settings size={15} />
        </button>
      </div>
      <div className="scrollbar-thin scroll-mask-y flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-1.5">
        {!hydrated ? (
          <SidebarSkeleton />
        ) : projects.length === 0 ? (
          <button
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-border border-dashed bg-transparent px-2.5 py-3.5 text-[13px] text-muted hover:border-subtle hover:bg-panel-2 hover:text-text"
            type="button"
            onClick={openProject}
          >
            <FolderOpen size={18} />
            <span>Open a project to get started</span>
          </button>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
              {projects.map((project, projectIdx) => {
                const projectWorkspaces = workspaces.filter((w) => w.projectId === project.id);
                const isCollapsed = collapsedProjects.has(project.id);
                const hasActive = projectWorkspaces.some((w) => w.id === activeWorkspaceId);
                const wsIds = projectWorkspaces.map((w) => w.id);

                return (
                  <div className={projectIdx > 0 ? 'mt-2 border-border border-t pt-2' : ''} key={project.id}>
                    <SortableProjectGroup
                      projectId={project.id}
                      name={project.name}
                      isCollapsed={isCollapsed}
                      hasActive={hasActive}
                      onToggle={() => toggleProject(project.id)}
                      onAddWorktree={() =>
                        setWorktreeDialog({
                          projectId: project.id,
                          projectName: project.name,
                          repoPath: project.repoPath,
                        })
                      }
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({
                          project,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                    >
                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
                      >
                        <div className="overflow-hidden">
                          <SortableContext items={wsIds} strategy={verticalListSortingStrategy}>
                            <div className="flex flex-col pb-1">
                              {projectWorkspaces.map((workspace) => (
                                <SortableWorkspaceRow
                                  key={workspace.id}
                                  workspace={workspace}
                                  globalIndex={workspaceIndexMap.get(workspace.id) ?? 0}
                                  isActive={workspace.id === activeWorkspaceId}
                                  onClick={() => setActiveWorkspace(workspace.id)}
                                  onDelete={
                                    workspace.isRoot
                                      ? undefined
                                      : () =>
                                          setDeleteDialog({
                                            workspaceId: workspace.id,
                                            branch: workspace.branch,
                                          })
                                  }
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setWorkspaceContextMenu({
                                      workspace,
                                      x: e.clientX,
                                      y: e.clientY,
                                    });
                                  }}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </div>
                      </div>
                    </SortableProjectGroup>
                  </div>
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="border-border border-t p-2">
        <button
          className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border border-dashed bg-transparent text-muted text-xs hover:border-subtle hover:bg-panel-2 hover:text-text"
          type="button"
          onClick={openProject}
        >
          <FolderPlus size={14} />
          <span>Add repository</span>
        </button>
      </div>

      {contextMenu && (
        <ProjectContextMenu
          project={contextMenu.project}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onNewWorktree={() =>
            setWorktreeDialog({
              projectId: contextMenu.project.id,
              projectName: contextMenu.project.name,
              repoPath: contextMenu.project.repoPath,
            })
          }
          onCloseProject={() => {
            const confirmed = window.confirm(`Remove ${contextMenu.project.name} from ForgePad? Files stay on disk.`);
            if (confirmed) removeProject(contextMenu.project.id);
          }}
        />
      )}

      {workspaceContextMenu && (
        <WorkspaceContextMenu
          workspace={workspaceContextMenu.workspace}
          x={workspaceContextMenu.x}
          y={workspaceContextMenu.y}
          onClose={() => setWorkspaceContextMenu(null)}
          onDelete={
            workspaceContextMenu.workspace.isRoot
              ? undefined
              : () => {
                  setWorkspaceContextMenu(null);
                  setDeleteDialog({
                    workspaceId: workspaceContextMenu.workspace.id,
                    branch: workspaceContextMenu.workspace.branch,
                  });
                }
          }
        />
      )}

      {worktreeDialog && (
        <NewWorktreeDialog
          projectName={worktreeDialog.projectName}
          repoPath={worktreeDialog.repoPath}
          onClose={() => setWorktreeDialog(null)}
          onCreate={(branch, trackRemote) => void createWorktree(worktreeDialog.projectId, branch, trackRemote)}
        />
      )}

      {deleteDialog && (
        <DeleteWorktreeDialog
          branch={deleteDialog.branch}
          onClose={() => setDeleteDialog(null)}
          onConfirm={() => {
            void deleteWorktree(deleteDialog.workspaceId);
            setDeleteDialog(null);
          }}
        />
      )}
    </aside>
  );
}
