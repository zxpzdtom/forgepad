import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, FolderOpen, FolderPlus, Plus, X } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";
import { Spinner } from "./Spinner";
import type { AgentStatus } from "@shared/agent-lifecycle";

type SidebarWorkspace = { id: string; name: string; branch: string };

/**
 * Derive the "highest priority" agent status for a workspace.
 * Priority: permission > working > review > idle > undefined (no agents).
 */
function useWorkspaceAgentStatus(workspaceId: string): AgentStatus | undefined {
  const tabs = useAppStore((state) => state.tabs);
  const agentStatuses = useAppStore((state) => state.agentStatuses);
  const exitedPtyIds = useAppStore((state) => state.exitedPtyIds);

  return useMemo(() => {
    const agentTabs = tabs.filter(
      (t) =>
        t.workspaceId === workspaceId &&
        t.type === "terminal" &&
        t.isAgent === true,
    );
    if (agentTabs.length === 0) return undefined;

    let highest: AgentStatus | undefined;
    const priority: Record<AgentStatus, number> = {
      idle: 0,
      review: 1,
      working: 2,
      permission: 3,
    };

    for (const tab of agentTabs) {
      if (tab.type !== "terminal") continue;
      const isExited = exitedPtyIds.has(tab.ptyId);
      const status: AgentStatus =
        agentStatuses[tab.ptyId] ?? (isExited ? "idle" : "working");
      if (!highest || priority[status] > priority[highest]) {
        highest = status;
      }
    }
    return highest;
  }, [tabs, agentStatuses, exitedPtyIds, workspaceId]);
}

/** Animated status indicator for workspace items in the sidebar. */
function WorkspaceStatusDot({
  isActive,
  agentStatus,
}: {
  isActive: boolean;
  agentStatus: AgentStatus | undefined;
}) {
  // Working → unicode braille spinner
  if (agentStatus === "working") {
    return (
      <span className="text-accent text-[11px] leading-none">
        <Spinner name="braille" />
      </span>
    );
  }

  // Permission needed → pulsing amber dot
  if (agentStatus === "permission") {
    return (
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-warn" />
      </span>
    );
  }

  // Review (agent finished) → green dot
  if (agentStatus === "review") {
    return <span className="block size-2 rounded-full bg-ok" />;
  }

  // Default static dot
  return (
    <span
      className={`block size-2 rounded-full ${isActive ? "bg-accent" : "bg-muted"}`}
    />
  );
}

function SortableProjectGroup({
  projectId,
  name,
  workspaceCount,
  isCollapsed,
  hasActive,
  children,
  onToggle,
  onRemove,
}: {
  projectId: string;
  name: string;
  workspaceCount: number;
  isCollapsed: boolean;
  hasActive: boolean;
  children: ReactNode;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: projectId, data: { type: "project" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
    opacity: isDragging ? 0.74 : 1,
    zIndex: isDragging ? 20 : undefined,
    willChange: "transform",
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/sidebar-project flex min-w-0 flex-col rounded-lg${hasActive ? " bg-panel-2/55" : ""}${isDragging ? " shadow-[0_16px_34px_rgba(0,0,0,0.28)] ring-1 ring-accent/25" : ""}`}
    >
      <div
        className="flex h-8 w-full cursor-grab items-center gap-1 rounded-md bg-transparent px-1.5 text-left text-text transition-colors duration-150 hover:bg-panel-2 active:cursor-grabbing"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        {...attributes}
        {...listeners}
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-subtle transition-transform duration-150 ease-[ease]${isCollapsed ? "" : " rotate-90"}`}
        />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-[620]">
          {name}
        </span>
        <small className="shrink-0 text-[11px] text-subtle">
          {workspaceCount}
        </small>
        <button
          className="grid size-5 shrink-0 place-items-center rounded text-subtle opacity-0 transition-opacity hover:bg-panel-3 hover:text-danger group-hover/sidebar-project:opacity-100 focus:opacity-100"
          type="button"
          title="Remove project"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <X size={12} />
        </button>
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
  onRemove,
}: {
  workspace: SidebarWorkspace;
  globalIndex: number;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
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
  const agentStatus = useWorkspaceAgentStatus(workspace.id);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workspace.id, data: { type: "workspace" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
    opacity: isDragging ? 0.68 : 1,
    zIndex: isDragging ? 30 : undefined,
    willChange: "transform",
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/sidebar-workspace relative flex w-full min-w-0 cursor-grab items-start gap-2.5 rounded-md bg-transparent px-3 py-2 pr-8 text-left transition-[background,box-shadow] duration-150 active:cursor-grabbing${isActive ? " bg-[#172424]" : " hover:bg-panel-2/45"}${isDragging ? " shadow-[0_14px_28px_rgba(0,0,0,0.26)] ring-1 ring-accent/20" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...attributes}
      {...listeners}
    >
      {isActive && (
        <span className="absolute bottom-1 left-1 top-1 w-[3px] rounded-full bg-accent" />
      )}
      <div className="mt-px flex size-5 shrink-0 items-center justify-center">
        <WorkspaceStatusDot isActive={isActive} agentStatus={agentStatus} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium">
            {workspace.name}
          </span>
          {hasDiffStats && (
            <span className="flex shrink-0 items-center gap-1 rounded bg-panel-3 px-1.5 py-0.5 text-[10px] font-mono">
              {stats.additions > 0 && (
                <span className="text-[#34d399]">+{stats.additions}</span>
              )}
              {stats.deletions > 0 && (
                <span className="text-[#f87171]">−{stats.deletions}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-subtle">
            {workspace.branch || "detached"}
          </span>
          {hasRemoteStats && (
            <span className="shrink-0 font-mono text-[10px] text-subtle">
              {stats.ahead > 0 ? `↑${stats.ahead}` : ""}
              {stats.ahead > 0 && stats.behind > 0 ? " " : ""}
              {stats.behind > 0 ? `↓${stats.behind}` : ""}
            </span>
          )}
          <span className="shrink-0 text-[10px] text-subtle/40 tabular-nums">
            ⌘{globalIndex + 1}
          </span>
        </div>
      </div>
      <button
        className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded text-subtle opacity-0 transition-opacity hover:bg-panel-3 hover:text-danger group-hover/sidebar-workspace:opacity-100 focus:opacity-100"
        type="button"
        title="Remove branch"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <X size={12} />
      </button>
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
      <div className="flex items-center gap-2.5 py-2 pl-[22px] pr-2">
        <div className="size-3.5 shrink-0 animate-pulse rounded-full bg-border" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="h-3 w-[60%] animate-pulse rounded bg-border" />
          <div className="h-2.5 w-[35%] animate-pulse rounded bg-border" />
        </div>
      </div>
      <div className="flex items-center gap-2.5 py-2 pl-[22px] pr-2">
        <div className="size-3.5 shrink-0 animate-pulse rounded-full bg-border" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="h-3 w-[75%] animate-pulse rounded bg-border" />
          <div className="h-2.5 w-[45%] animate-pulse rounded bg-border" />
        </div>
      </div>
    </div>
  );
}

/** Collapsed sidebar button for a workspace – shows agent status indicator. */
function CollapsedWorkspaceButton({
  workspace,
  index,
  isActive,
  onClick,
}: {
  workspace: SidebarWorkspace;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const agentStatus = useWorkspaceAgentStatus(workspace.id);
  const isWorking = agentStatus === "working";
  const needsPermission = agentStatus === "permission";
  const hasReview = agentStatus === "review";

  return (
    <button
      className={`relative grid size-7 place-items-center rounded-md text-xs font-semibold cursor-pointer border border-transparent${isActive ? " bg-panel-3 text-accent border-border" : " text-muted bg-transparent hover:bg-panel-2 hover:text-text"}`}
      type="button"
      title={`${workspace.name} (⌘${index + 1})`}
      onClick={onClick}
    >
      {isWorking ? (
        <span className="text-accent text-[10px] leading-none">
          <Spinner name="braille" />
        </span>
      ) : (
        workspace.name.charAt(0).toUpperCase()
      )}
      {/* Status pip in top-right corner */}
      {needsPermission && (
        <span className="absolute -right-0.5 -top-0.5 flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-warn" />
        </span>
      )}
      {hasReview && (
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-ok" />
      )}
    </button>
  );
}

export function Sidebar() {
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
    new Set(),
  );

  const projects = useAppStore((state) => state.projects);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const hydrated = useAppStore((state) => state.hydrated);
  const openProject = useAppStore((state) => state.openProject);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const reorderProjects = useAppStore((state) => state.reorderProjects);
  const reorderWorkspaces = useAppStore((state) => state.reorderWorkspaces);
  const removeProject = useAppStore((state) => state.removeProject);
  const removeWorkspace = useAppStore((state) => state.removeWorkspace);

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
    workspaceOrder.forEach((id, idx) => map.set(id, idx));
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
        projects.find(
          (project) =>
            project.id ===
            workspaces.find((workspace) => workspace.id === overId)?.projectId,
        );
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

  const confirmRemoveProject = (projectId: string, projectName: string) => {
    const confirmed = window.confirm(
      `Remove ${projectName} from ForgePad? Files stay on disk.`,
    );
    if (confirmed) removeProject(projectId);
  };

  const confirmRemoveWorkspace = (
    workspaceId: string,
    workspaceName: string,
  ) => {
    const confirmed = window.confirm(
      `Remove ${workspaceName} from ForgePad? Files stay on disk.`,
    );
    if (confirmed) removeWorkspace(workspaceId);
  };

  if (!sidebarOpen) {
    return (
      <aside
        className="flex h-full min-h-0 flex-col items-center gap-1.5 border-r border-border bg-panel px-2 py-2.5"
        onMouseDown={() => setFocusedColumn("sidebar")}
      >
        <div className="grid gap-1">
          {!hydrated ? (
            <>
              <div className="size-7 animate-pulse rounded-md bg-border" />
              <div className="size-7 animate-pulse rounded-md bg-border" />
            </>
          ) : (
            workspaceOrder.slice(0, 9).map((wsId, idx) => {
              const ws = workspaces.find((w) => w.id === wsId);
              if (!ws) return null;
              return (
                <CollapsedWorkspaceButton
                  key={wsId}
                  workspace={ws}
                  index={idx}
                  isActive={wsId === activeWorkspaceId}
                  onClick={() => setActiveWorkspace(wsId)}
                />
              );
            })
          )}
        </div>

        <div className="flex-1" />

        <button
          className="icon-button border-transparent"
          type="button"
          title="Open project"
          onClick={openProject}
        >
          <Plus size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-col border-r border-border bg-panel"
      onMouseDown={() => setFocusedColumn("sidebar")}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-6.5 place-items-center rounded-md bg-accent text-[13px] font-extrabold text-[#071110]">
            F
          </div>
          <span className="text-[15px] font-bold tracking-tight">ForgePad</span>
        </div>
        <button
          className="icon-button"
          type="button"
          title="Open project"
          onClick={openProject}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-1.5 scrollbar-thin scroll-mask-y">
        {!hydrated ? (
          <SidebarSkeleton />
        ) : projects.length === 0 ? (
          <button
            className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border bg-transparent px-2.5 py-3.5 text-[13px] text-muted hover:bg-panel-2 hover:text-text hover:border-subtle cursor-pointer"
            type="button"
            onClick={openProject}
          >
            <FolderOpen size={18} />
            <span>Open a project to get started</span>
          </button>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={projectIds}
              strategy={verticalListSortingStrategy}
            >
              {projects.map((project, projectIdx) => {
                const projectWorkspaces = workspaces.filter(
                  (w) => w.projectId === project.id,
                );
                const isCollapsed = collapsedProjects.has(project.id);
                const hasActive = projectWorkspaces.some(
                  (w) => w.id === activeWorkspaceId,
                );
                const wsIds = projectWorkspaces.map((w) => w.id);

                return (
                  <div
                    className={
                      projectIdx > 0
                        ? "mt-2 border-t border-border/30 pt-2"
                        : ""
                    }
                    key={project.id}
                  >
                    <SortableProjectGroup
                      projectId={project.id}
                      name={project.name}
                      workspaceCount={projectWorkspaces.length}
                      isCollapsed={isCollapsed}
                      hasActive={hasActive}
                      onToggle={() => toggleProject(project.id)}
                      onRemove={() =>
                        confirmRemoveProject(project.id, project.name)
                      }
                    >
                      {!isCollapsed && (
                        <SortableContext
                          items={wsIds}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="grid gap-0.5 pb-1">
                            {projectWorkspaces.map((workspace) => (
                              <SortableWorkspaceRow
                                key={workspace.id}
                                workspace={workspace}
                                globalIndex={
                                  workspaceIndexMap.get(workspace.id) ?? 0
                                }
                                isActive={workspace.id === activeWorkspaceId}
                                onClick={() => setActiveWorkspace(workspace.id)}
                                onRemove={() =>
                                  confirmRemoveWorkspace(
                                    workspace.id,
                                    workspace.branch || workspace.name,
                                  )
                                }
                              />
                            ))}
                          </div>
                        </SortableContext>
                      )}
                    </SortableProjectGroup>
                  </div>
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="border-t border-border p-2">
        <button
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-transparent text-xs text-muted hover:bg-panel-2 hover:text-text hover:border-subtle cursor-pointer"
          type="button"
          onClick={openProject}
        >
          <FolderPlus size={14} />
          <span>Add repository</span>
        </button>
      </div>
    </aside>
  );
}
