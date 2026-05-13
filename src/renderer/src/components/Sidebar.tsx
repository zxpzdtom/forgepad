import { type KeyboardEvent, memo, type ReactNode, useEffect, useMemo, useState } from 'react';
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import data from '@emoji-mart/data';
import EmojiPicker from '@emoji-mart/react';
import { useTranslation } from '@renderer/i18n';
import { getDroppedPaths, isInternalDrop } from '@renderer/lib/drag-utils';
import { useAppStore } from '@renderer/store/app-store';
import type { AgentStatus } from '@shared/agent-lifecycle';
import type { Project, WorkspacePanel } from '@shared/types';
import { FolderOpen, FolderPlus, Plus } from 'lucide-react';

import { ContextMenu, type ContextMenuSection } from './ContextMenu';
import { NewWorktreeDialog } from './NewWorktreeDialog';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';

import clsx from 'clsx';

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
      <path d="M18 9c0 3-2 4-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
      className={clsx(
        'flex size-5 shrink-0 items-center justify-center rounded font-[590] text-[#f7f8f8] text-[11px]',
        colorClass,
      )}
    >
      {letter}
    </span>
  );
}

/* ── Relative time formatter ──────────────────────────────────── */

function formatRelativeTime(timestamp: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return t('sidebar.justNow');
  if (minutes < 60) return t('sidebar.minutesAgo', { n: minutes });
  if (hours < 24) return t('sidebar.hoursAgo', { n: hours });
  if (days < 7) return t('sidebar.daysAgo', { n: days });
  if (weeks < 5) return t('sidebar.weeksAgo', { n: weeks });
  if (months < 12) return t('sidebar.monthsAgo', { n: months });
  return t('sidebar.yearsAgo', { n: years });
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
      if (exitedPtyIds.has(tab.ptyId)) continue;
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

  // Working → dotmatrix spinner
  if (agentStatus === 'working') {
    return (
      <span className="text-accent leading-none">
        <Spinner name={spinnerStyle} size={14} dotSize={2} />
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
  const { t } = useTranslation();
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
      className={clsx(
        'group/sidebar-project flex min-w-0 flex-col rounded-lg',
        hasActive && 'bg-panel/60',
        isDragging && 'shadow-[0_16px_34px_rgba(0,0,0,0.28)] ring-1 ring-accent/25',
      )}
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
          title={t('sidebar.newWorktree')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onAddWorktree();
          }}
        >
          <AddIcon />
        </button>
        <ArrowDownIcon
          className={clsx(
            'shrink-0 cursor-pointer text-subtle transition-transform duration-200 ease-[ease]',
            isCollapsed && '-rotate-90',
          )}
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
  isLoading,
  onClick,
  onDelete,
  onContextMenu,
}: {
  workspace: SidebarWorkspace;
  globalIndex: number;
  isActive: boolean;
  isLoading?: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const spinnerStyle = useAppStore((state) => state.settings.spinnerStyle);
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
  const prMerged = branchStats?.prMerged ?? false;
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
      className={clsx(
        'group/sidebar-workspace relative flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150',
        isLoading ? 'cursor-default opacity-60' : 'cursor-grab active:cursor-grabbing',
        !isLoading && !isActive && 'hover:bg-panel-2',
        isDragging && 'bg-panel-2 ring-1 ring-accent/20',
      )}
      role="button"
      tabIndex={isLoading ? -1 : 0}
      onClick={isLoading ? undefined : onClick}
      onKeyDown={isLoading ? undefined : handleKeyDown}
      onContextMenu={isLoading ? undefined : onContextMenu}
      {...(isLoading ? {} : { ...attributes, ...listeners })}
    >
      {isActive && <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-accent" />}
      <div className="mt-[2px] flex size-[14px] shrink-0 items-center justify-center">
        {isLoading ? (
          <span className="text-accent leading-none">
            <Spinner name={spinnerStyle} size={14} dotSize={2} />
          </span>
        ) : agentStatus && agentStatus !== 'idle' ? (
          <WorkspaceStatusDot isActive={isActive} agentStatus={agentStatus} />
        ) : prNumber && prMerged ? (
          <GitMergeIcon className="text-[#22c55e]" />
        ) : (
          <GitBranchIcon className="text-subtle" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={clsx(
              'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-[510] font-mono text-[13px]',
              isActive && 'text-text',
            )}
          >
            {workspace.branch || t('sidebar.detached')}
          </span>
          {!isLoading && prNumber && (
            <span
              role="link"
              tabIndex={0}
              className={clsx(
                'shrink-0 cursor-pointer rounded-[3px] px-[5px] py-px font-[560] font-mono text-[9px] leading-[16px] transition-colors',
                prMerged ? 'bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20' : 'bg-subtle/10 text-subtle hover:bg-subtle/20',
              )}
              title={prUrl ? `Open MR #${prNumber}` : `MR #${prNumber}`}
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
          {!isLoading && hasDiffStats && (
            <span className="flex shrink-0 items-center gap-1 font-mono text-[10px]">
              {stats.additions > 0 && <span className="text-text-addition">+{stats.additions}</span>}
              {stats.deletions > 0 && <span className="text-text-deletion">−{stats.deletions}</span>}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-subtle">
            {isLoading ? 'Creating…' : formatRelativeTime(workspace.createdAt, t)}
          </span>
          {!isLoading && hasRemoteStats && (
            <span className="shrink-0 font-mono text-[10px] text-subtle">
              {stats.ahead > 0 ? `↑${stats.ahead}` : ''}
              {stats.ahead > 0 && stats.behind > 0 ? ' ' : ''}
              {stats.behind > 0 ? `↓${stats.behind}` : ''}
            </span>
          )}
          {!isLoading && globalIndex < 9 && (
            <span className="shrink-0 text-[10px] text-subtle/40 tabular-nums">⌘{globalIndex + 1}</span>
          )}
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
  const { t } = useTranslation();
  const sections: ContextMenuSection[] = [
    {
      label: t('sidebar.menu.openInFinder'),
      icon: <FolderIcon className="size-4" />,
      action: () => {
        void window.forgepad.shell.openPath(project.repoPath);
        onClose();
      },
    },
    {
      label: t('sidebar.menu.copyPath'),
      icon: <ClipboardCopyIcon className="size-4" />,
      action: () => {
        void navigator.clipboard.writeText(project.repoPath);
        onClose();
      },
    },
    {
      label: t('sidebar.menu.newWorktree'),
      icon: <FolderTreeIcon className="size-4" />,
      action: () => {
        onClose();
        onNewWorktree();
      },
    },
    'divider',
    {
      label: t('sidebar.menu.closeProject'),
      icon: <CancelIcon className="size-4" />,
      danger: true,
      action: () => {
        onClose();
        onCloseProject();
      },
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
  const { t } = useTranslation();
  const sections: ContextMenuSection[] = [
    {
      label: t('sidebar.menu.openInFinder'),
      icon: <FolderIcon className="size-4" />,
      action: () => {
        void window.forgepad.shell.openPath(workspace.worktreePath);
        onClose();
      },
    },
    {
      label: t('sidebar.menu.copyProjectPath'),
      icon: <ClipboardCopyIcon className="size-4" />,
      action: () => {
        void navigator.clipboard.writeText(workspace.worktreePath);
        onClose();
      },
    },
    {
      label: t('sidebar.menu.copyBranchName'),
      icon: <GitMergeIcon className="size-4" />,
      action: () => {
        void navigator.clipboard.writeText(workspace.branch);
        onClose();
      },
    },
    ...(onDelete
      ? [
          'divider' as const,
          {
            label: t('sidebar.menu.deleteWorktree'),
            icon: <CancelIcon className="size-4" />,
            danger: true,
            action: () => {
              onClose();
              onDelete();
            },
          },
        ]
      : []),
  ];

  return <ContextMenu sections={sections} x={x} y={y} onClose={onClose} />;
}

/* ── Delete worktree confirmation dialog ─────────────────────── */

function DeleteWorktreeDialog({ branch, onClose, onConfirm }: { branch: string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
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
          <span className="font-[590] text-[14px] text-text">{t('sidebar.deleteWorktree.title')}</span>
        </div>
        <div className="px-4 py-4 text-[13px] text-subtle leading-relaxed">
          {t('sidebar.deleteWorktree.message')} <span className="font-[590] font-mono text-text">{branch}</span>
          {t('sidebar.deleteWorktree.detail')}
        </div>
        <div className="flex justify-end gap-2 border-border border-t px-4 py-3">
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-border bg-transparent px-3 text-[13px] text-text hover:bg-panel-3"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-transparent bg-danger px-3 text-[13px] text-accent-contrast hover:brightness-110 disabled:opacity-50"
            disabled={loading}
            onClick={handleDelete}
          >
            {loading ? t('sidebar.deleteWorktree.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Panel Dot Switcher ───────────────────────────────────────── */

const MAX_VISIBLE_DOTS = 9;
const MAX_PANELS = 9;

function useDotWindow(panels: WorkspacePanel[], activePanelId: string | null) {
  const activeIndex = panels.findIndex((p) => p.id === activePanelId);

  return useMemo(() => {
    if (panels.length <= MAX_VISIBLE_DOTS) {
      return { visiblePanels: panels, startIndex: 0 };
    }

    const half = Math.floor(MAX_VISIBLE_DOTS / 2);
    let windowStart = Math.max(0, activeIndex - half);
    let windowEnd = windowStart + MAX_VISIBLE_DOTS;
    if (windowEnd > panels.length) {
      windowEnd = panels.length;
      windowStart = windowEnd - MAX_VISIBLE_DOTS;
    }

    return {
      visiblePanels: panels.slice(windowStart, windowEnd),
      startIndex: windowStart,
    };
  }, [panels, activeIndex]);
}

/** A single emoji dot in the panel switcher. Active = emoji visible; inactive = dot; hover reveals emoji. */
const PanelDot = memo(function PanelDot({
  panel,
  isActive,
  globalIndex,
  onClick,
  onContextMenu,
}: {
  panel: WorkspacePanel;
  isActive: boolean;
  globalIndex: number;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <Tooltip label={panel.name} shortcut={`⌥${globalIndex + 1}`}>
      <button
        type="button"
        className={clsx('panel-dot', isActive && 'panel-dot--active')}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* Emoji layer — visible when active or hovered */}
        <span className="panel-dot__emoji">{panel.emoji}</span>
        {/* Dot layer — visible when inactive and not hovered */}
        <span className="panel-dot__dot" />
      </button>
    </Tooltip>
  );
});

/**
 * Dialog to create a new panel with name + emoji.
 * Clicking the emoji button opens an emoji-mart picker popover.
 */
function NewPanelDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, emoji: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🚀');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPicker) setShowPicker(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, showPicker]);

  const handleSubmit = () => {
    const finalName = name.trim() || t('sidebar.newPanel.defaultName');
    onCreate(finalName, emoji);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85" onMouseDown={onClose}>
      <div
        className="w-[min(320px,90vw)] rounded-xl border border-border bg-panel-2 shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-border border-b px-4 py-3">
          <span className="font-[590] text-[14px] text-text">{t('sidebar.newPanel.title')}</span>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          {/* Emoji + Name row */}
          <div className="flex items-end gap-2.5">
            <div className="relative flex flex-col gap-1.5">
              <span className="font-[510] text-[11px] text-muted uppercase tracking-wider">{t('sidebar.newPanel.icon')}</span>
              <button
                type="button"
                className="emoji-picker-btn"
                title={t('sidebar.newPanel.chooseEmoji')}
                onClick={() => setShowPicker((v) => !v)}
              >
                {emoji}
              </button>
              {showPicker && (
                <div className="emoji-mart-popover">
                  <EmojiPicker
                    data={data}
                    onEmojiSelect={(picked: { native: string }) => {
                      setEmoji(picked.native);
                      setShowPicker(false);
                    }}
                    theme="dark"
                    set="native"
                    previewPosition="none"
                    skinTonePosition="none"
                    perLine={8}
                    maxFrequentRows={1}
                  />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label className="font-[510] text-[11px] text-muted uppercase tracking-wider" htmlFor="panel-name">
                {t('sidebar.newPanel.name')}
              </label>
              <input
                id="panel-name"
                type="text"
                className="h-8 rounded-md border border-border bg-surface-input px-2.5 text-[13px] text-text placeholder:text-subtle focus:border-accent focus:outline-none"
                placeholder={t('sidebar.newPanel.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
                autoFocus
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-border border-t px-4 py-3">
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-border bg-transparent px-3 text-[13px] text-text hover:bg-panel-3"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-transparent bg-accent px-3 text-[13px] text-accent-contrast hover:brightness-110"
            onClick={handleSubmit}
          >
            {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Dialog to edit an existing panel (rename + change emoji).
 */
function EditPanelDialog({ panel, onClose }: { panel: WorkspacePanel; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(panel.name);
  const [emoji, setEmoji] = useState(panel.emoji);
  const [showPicker, setShowPicker] = useState(false);
  const renamePanel = useAppStore((state) => state.renamePanel);
  const updatePanelEmoji = useAppStore((state) => state.updatePanelEmoji);

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPicker) setShowPicker(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, showPicker]);

  const handleSubmit = () => {
    const finalName = name.trim() || panel.name;
    if (finalName !== panel.name) renamePanel(panel.id, finalName);
    if (emoji !== panel.emoji) updatePanelEmoji(panel.id, emoji);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85" onMouseDown={onClose}>
      <div
        className="w-[min(320px,90vw)] rounded-xl border border-border bg-panel-2 shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-border border-b px-4 py-3">
          <span className="font-[590] text-[14px] text-text">{t('sidebar.editPanel.title')}</span>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-end gap-2.5">
            <div className="relative flex flex-col gap-1.5">
              <span className="font-[510] text-[11px] text-muted uppercase tracking-wider">{t('sidebar.newPanel.icon')}</span>
              <button
                type="button"
                className="emoji-picker-btn"
                title={t('sidebar.newPanel.chooseEmoji')}
                onClick={() => setShowPicker((v) => !v)}
              >
                {emoji}
              </button>
              {showPicker && (
                <div className="emoji-mart-popover">
                  <EmojiPicker
                    data={data}
                    onEmojiSelect={(picked: { native: string }) => {
                      setEmoji(picked.native);
                      setShowPicker(false);
                    }}
                    theme="dark"
                    set="native"
                    previewPosition="none"
                    skinTonePosition="none"
                    perLine={8}
                    maxFrequentRows={1}
                  />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label className="font-[510] text-[11px] text-muted uppercase tracking-wider" htmlFor="edit-panel-name">
                {t('sidebar.newPanel.name')}
              </label>
              <input
                id="edit-panel-name"
                type="text"
                className="h-8 rounded-md border border-border bg-surface-input px-2.5 text-[13px] text-text placeholder:text-subtle focus:border-accent focus:outline-none"
                placeholder={t('sidebar.newPanel.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
                autoFocus
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-border border-t px-4 py-3">
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-border bg-transparent px-3 text-[13px] text-text hover:bg-panel-3"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-transparent bg-accent px-3 text-[13px] text-accent-contrast hover:brightness-110"
            onClick={handleSubmit}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Panel context menu ──────────────────────────────────────── */

function PanelContextMenu({
  panel,
  panelCount,
  x,
  y,
  onClose,
  onEdit,
  onDelete,
}: {
  panel: WorkspacePanel;
  panelCount: number;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const sections: ContextMenuSection[] = [
    {
      label: t('sidebar.menu.editPanel'),
      action: () => {
        onClose();
        onEdit();
      },
    },
    {
      label: t('sidebar.menu.deletePanel'),
      danger: true,
      disabled: panelCount <= 1,
      action: () => {
        onClose();
        onDelete();
      },
    },
  ];

  return <ContextMenu sections={sections} x={x} y={y} onClose={onClose} />;
}

/* ── Delete panel confirmation dialog ────────────────────────── */

function DeletePanelDialog({
  panel,
  projectCount,
  onClose,
  onConfirm,
}: {
  panel: WorkspacePanel;
  projectCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85" onMouseDown={onClose}>
      <div
        className="w-[min(340px,90vw)] rounded-xl border border-border bg-panel-2 shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-border border-b px-4 py-3">
          <span className="font-[590] text-[14px] text-text">{t('sidebar.deletePanel.title')}</span>
        </div>

        <div className="px-4 py-4">
          <p className="text-[13px] text-muted leading-relaxed">
            {t('sidebar.deletePanel.panel')}{' '}
            <span className="font-[590] text-text">
              {panel.emoji} {panel.name}
            </span>{' '}
            {t('sidebar.deletePanel.contains')} <span className="font-[590] text-text">{projectCount}</span>{' '}
            {projectCount > 1 ? t('sidebar.deletePanel.projects') : t('sidebar.deletePanel.project')}.{' '}
            {t('sidebar.deletePanel.detail')}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-border border-t px-4 py-3">
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-border bg-transparent px-3 text-[13px] text-text hover:bg-panel-3"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-transparent bg-danger px-3 text-[13px] text-white hover:brightness-110"
            onClick={onConfirm}
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelSwitcher() {
  const { t } = useTranslation();
  const panels = useAppStore((state) => state.panels);
  const activePanelId = useAppStore((state) => state.activePanelId);
  const setActivePanel = useAppStore((state) => state.setActivePanel);
  const createPanel = useAppStore((state) => state.createPanel);
  const removePanel = useAppStore((state) => state.removePanel);
  const allProjects = useAppStore((state) => state.projects);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editPanel, setEditPanel] = useState<WorkspacePanel | null>(null);
  const [panelMenu, setPanelMenu] = useState<{
    panel: WorkspacePanel;
    x: number;
    y: number;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<WorkspacePanel | null>(null);

  const { visiblePanels, startIndex } = useDotWindow(panels, activePanelId);

  const handleDelete = (panel: WorkspacePanel) => {
    const projectCount = allProjects.filter((p) => p.panelId === panel.id).length;
    if (projectCount > 0) {
      setDeleteConfirm(panel);
    } else {
      removePanel(panel.id);
    }
  };

  return (
    <>
      <div className="panel-switcher">
        <div className="switcher-dot-track">
          {visiblePanels.map((panel, i) => (
            <PanelDot
              key={panel.id}
              panel={panel}
              isActive={panel.id === activePanelId}
              globalIndex={startIndex + i}
              onClick={() => setActivePanel(panel.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setPanelMenu({ panel, x: e.clientX, y: e.clientY });
              }}
            />
          ))}
        </div>

        {panels.length < MAX_PANELS && (
          <Tooltip label={t('sidebar.newPanel')}>
            <button type="button" className="switcher-add" onClick={() => setShowNewDialog(true)}>
              <Plus size={11} />
            </button>
          </Tooltip>
        )}
      </div>

      {showNewDialog && (
        <NewPanelDialog onClose={() => setShowNewDialog(false)} onCreate={(name, emojiVal) => createPanel(name, emojiVal)} />
      )}

      {editPanel && <EditPanelDialog panel={editPanel} onClose={() => setEditPanel(null)} />}

      {panelMenu && (
        <PanelContextMenu
          panel={panelMenu.panel}
          panelCount={panels.length}
          x={panelMenu.x}
          y={panelMenu.y}
          onClose={() => setPanelMenu(null)}
          onEdit={() => setEditPanel(panelMenu.panel)}
          onDelete={() => handleDelete(panelMenu.panel)}
        />
      )}

      {deleteConfirm && (
        <DeletePanelDialog
          panel={deleteConfirm}
          projectCount={allProjects.filter((p) => p.panelId === deleteConfirm.id).length}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => {
            removePanel(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
        />
      )}
    </>
  );
}

/* ── Sidebar ─────────────────────────────────────────────────── */

export function Sidebar() {
  const { t } = useTranslation();
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

  const allProjects = useAppStore((state) => state.projects);
  const panels = useAppStore((state) => state.panels);
  const activePanelId = useAppStore((state) => state.activePanelId);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const hydrated = useAppStore((state) => state.hydrated);
  const openProject = useAppStore((state) => state.openProject);
  const openProjectFromPath = useAppStore((state) => state.openProjectFromPath);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const reorderProjects = useAppStore((state) => state.reorderProjects);
  const reorderWorkspaces = useAppStore((state) => state.reorderWorkspaces);
  const removeProject = useAppStore((state) => state.removeProject);
  const deleteWorktree = useAppStore((state) => state.deleteWorktree);
  const createWorktree = useAppStore((state) => state.createWorktree);
  const workspaceLoadingIds = useAppStore((state) => state.workspaceLoadingIds);

  // Filter projects by active panel
  const projects = useMemo(() => allProjects.filter((p) => p.panelId === activePanelId), [allProjects, activePanelId]);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    // Only respond to external OS file drops, not dnd-kit internal sorts
    if (isInternalDrop(e)) return;
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the aside entirely (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isInternalDrop(e)) return;
    e.preventDefault();
    setIsDragOver(false);
    const paths = getDroppedPaths(e);
    for (const p of paths) {
      void openProjectFromPath(p);
    }
  };

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
      className={clsx(
        'flex h-full min-h-0 min-w-0 flex-col border-border border-r bg-sidebar-bg transition-colors duration-100',
        isDragOver && 'bg-accent/5 ring-2 ring-accent/30 ring-inset',
      )}
      onMouseDown={() => setFocusedColumn('sidebar')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex h-9 shrink-0 items-center border-border border-b px-3">
        <span className="font-semibold text-[11px] text-muted uppercase tracking-wider">{t('sidebar.workspaces')}</span>
      </div>
      <div
        key={activePanelId}
        className="sidebar-panel-content scrollbar-thin scroll-mask-y flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-1.5"
      >
        {!hydrated ? (
          <SidebarSkeleton />
        ) : projects.length === 0 ? (
          <button
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-border border-dashed bg-transparent px-2.5 py-3.5 text-[13px] text-muted hover:border-subtle hover:bg-panel-2 hover:text-text"
            type="button"
            onClick={openProject}
          >
            <FolderOpen size={18} />
            <span>{t('sidebar.openProject')}</span>
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
                        className={clsx(
                          'grid transition-[grid-template-rows] duration-300 ease-in-out',
                          isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
                        )}
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
                                  isLoading={workspaceLoadingIds.has(workspace.id)}
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
          <span>{t('sidebar.addRepo')}</span>
        </button>
      </div>

      {/* Panel switcher — always visible (dots show when ≥2 panels) */}
      <PanelSwitcher />

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
            const confirmed = window.confirm(t('sidebar.removeConfirm', { name: contextMenu.project.name }));
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
