import { useMemo, useState } from "react";
import {
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
import {
  ChevronRight,
  FolderOpen,
  FolderPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";

function SortableProjectHeader({
  projectId,
  name,
  workspaceCount,
  isCollapsed,
  onToggle,
}: {
  projectId: string;
  name: string;
  workspaceCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: projectId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`flex h-8 w-full cursor-grab items-center gap-1 rounded-md bg-transparent px-1.5 text-left text-text${isDragging ? " opacity-40 z-10" : ""}`}
      type="button"
      onClick={onToggle}
      {...attributes}
      {...listeners}
    >
      <ChevronRight
        size={14}
        className={`text-subtle shrink-0 transition-transform duration-150 ease-[ease]${isCollapsed ? "" : " rotate-90"}`}
      />
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-[620]">{name}</span>
      <small className="shrink-0 text-[11px] text-subtle">{workspaceCount}</small>
    </button>
  );
}

function SortableWorkspaceRow({
  workspace,
  globalIndex,
  isActive,
  onClick,
}: {
  workspace: { id: string; name: string; branch: string };
  globalIndex: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const branchStats = useAppStore((state) => state.branchStats[workspace.id]);
  const stats = branchStats ?? { ahead: 0, behind: 0, additions: 0, deletions: 0 };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workspace.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`relative flex w-full items-start gap-2.5 rounded-md bg-transparent px-3 py-2 text-left${isActive ? " bg-[#172424]" : " hover:bg-panel-2/40"}${isDragging ? " opacity-40 z-10" : ""}`}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      {isActive && (
        <span className="absolute bottom-1 left-1 top-1 w-[3px] rounded-full bg-accent" />
      )}
      <div className="mt-px flex size-5 shrink-0 items-center justify-center">
        <span className={`block size-2 rounded-full ${isActive ? "bg-accent" : "bg-muted"}`} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium">{workspace.name}</span>
          {stats.ahead > 0 && (
            <span className="shrink-0 text-[10px] font-mono text-[#34d399]">↑{stats.ahead}</span>
          )}
          {(stats.additions > 0 || stats.deletions > 0) && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-mono">
              {stats.additions > 0 && (
                <span className="text-[#34d399]">+{stats.additions}</span>
              )}
              {stats.deletions > 0 && (
                <span className="text-[#f87171]">−{stats.deletions}</span>
              )}
            </span>
          )}
        </div>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-subtle">
          {workspace.branch || "detached"}
        </span>
      </div>
      <span className="absolute bottom-[3px] right-1.5 pointer-events-none text-[10px] text-subtle/40 tabular-nums">⌘{globalIndex + 1}</span>
    </button>
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
  const reorderProjects = useAppStore((state) => state.reorderProjects);
  const reorderWorkspaces = useAppStore((state) => state.reorderWorkspaces);

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

    // Check if it's a project-level drag
    if (projects.some((p) => p.id === activeId) && projects.some((p) => p.id === overId)) {
      reorderProjects(activeId, overId);
      return;
    }

    // Check if it's a workspace-level drag (same project)
    const activeWs = workspaces.find((w) => w.id === activeId);
    const overWs = workspaces.find((w) => w.id === overId);
    if (activeWs && overWs && activeWs.projectId === overWs.projectId) {
      reorderWorkspaces(activeWs.projectId, activeId, overId);
    }
  };

  if (!sidebarOpen) {
    return (
      <aside className="flex h-full min-h-0 flex-col items-center gap-1.5 border-r border-border bg-panel px-2 py-2.5">
        <button
          className="icon-button border-transparent"
          type="button"
          title="Expand sidebar"
          onClick={() => useAppStore.setState({ sidebarOpen: true })}
        >
          <PanelLeftOpen size={16} />
        </button>

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
                <button
                  key={wsId}
                  className={`grid size-7 place-items-center rounded-md text-xs font-semibold cursor-pointer border border-transparent${wsId === activeWorkspaceId ? " bg-panel-3 text-accent border-border" : " text-muted bg-transparent hover:bg-panel-2 hover:text-text"}`}
                  type="button"
                  title={`${ws.name} (⌘${idx + 1})`}
                  onClick={() => setActiveWorkspace(wsId)}
                >
                  {ws.name.charAt(0).toUpperCase()}
                </button>
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
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-[38px]">
        <div className="flex items-center gap-2.5">
          <div className="grid size-6.5 place-items-center rounded-md bg-accent text-[13px] font-extrabold text-[#071110]">F</div>
          <span className="text-[15px] font-bold tracking-tight">ForgePad</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="icon-button"
            type="button"
            title="Open project"
            onClick={openProject}
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Collapse sidebar"
            onClick={() => useAppStore.setState({ sidebarOpen: false })}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-1.5 scrollbar-thin">
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
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
                    className={`flex flex-col${projectIdx > 0 ? " mt-2 border-t border-border/30 pt-2" : ""}${hasActive ? " has-active" : ""}`}
                    key={project.id}
                  >
                    <SortableProjectHeader
                      projectId={project.id}
                      name={project.name}
                      workspaceCount={projectWorkspaces.length}
                      isCollapsed={isCollapsed}
                      onToggle={() => toggleProject(project.id)}
                    />

                    {!isCollapsed && (
                      <SortableContext
                        items={wsIds}
                        strategy={verticalListSortingStrategy}
                      >
                        {projectWorkspaces.map((workspace) => (
                          <SortableWorkspaceRow
                            key={workspace.id}
                            workspace={workspace}
                            globalIndex={workspaceIndexMap.get(workspace.id) ?? 0}
                            isActive={workspace.id === activeWorkspaceId}
                            onClick={() => setActiveWorkspace(workspace.id)}
                          />
                        ))}
                      </SortableContext>
                    )}
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
