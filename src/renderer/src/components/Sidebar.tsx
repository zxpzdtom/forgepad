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
  GripVertical,
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
      className={`sidebar-project-header${isDragging ? " dragging" : ""}`}
      type="button"
      onClick={onToggle}
      {...attributes}
    >
      <span className="drag-handle" {...listeners}>
        <GripVertical size={12} />
      </span>
      <ChevronRight
        size={14}
        className={`sidebar-chevron${isCollapsed ? "" : " open"}`}
      />
      <span className="sidebar-project-name">{name}</span>
      <small className="sidebar-project-count">{workspaceCount}</small>
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
      className={`sidebar-workspace${isActive ? " active" : ""}${isDragging ? " dragging" : ""}`}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <div className="sidebar-workspace-icon">
        <span className="sidebar-workspace-dot" />
      </div>
      <div className="sidebar-workspace-info">
        <div className="sidebar-workspace-top">
          <span className="sidebar-workspace-name">{workspace.name}</span>
          {stats.ahead > 0 && (
            <span className="sidebar-stat ahead">↑{stats.ahead}</span>
          )}
          {(stats.additions > 0 || stats.deletions > 0) && (
            <span className="sidebar-stat-diff">
              {stats.additions > 0 && (
                <span className="stat-add">+{stats.additions}</span>
              )}
              {stats.deletions > 0 && (
                <span className="stat-del">−{stats.deletions}</span>
              )}
            </span>
          )}
        </div>
        <span className="sidebar-workspace-branch">
          {workspace.branch || "detached"}
        </span>
      </div>
      <span className="sidebar-workspace-index">#{globalIndex + 1}</span>
    </button>
  );
}

function SidebarSkeleton() {
  return (
    <div className="sidebar-skeleton-group">
      <div className="sidebar-skeleton-header">
        <div className="skeleton-bar" style={{ width: "45%" }} />
        <div className="skeleton-bar skeleton-bar-sm" style={{ width: "20px" }} />
      </div>
      <div className="sidebar-skeleton-item">
        <div className="skeleton-circle" />
        <div className="skeleton-bars">
          <div className="skeleton-bar" style={{ width: "60%" }} />
          <div className="skeleton-bar skeleton-bar-sm" style={{ width: "35%" }} />
        </div>
      </div>
      <div className="sidebar-skeleton-item">
        <div className="skeleton-circle" />
        <div className="skeleton-bars">
          <div className="skeleton-bar" style={{ width: "75%" }} />
          <div className="skeleton-bar skeleton-bar-sm" style={{ width: "45%" }} />
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
      <aside className="sidebar sidebar-collapsed">
        <button
          className="icon-button sidebar-toggle"
          type="button"
          title="Expand sidebar"
          onClick={() => useAppStore.setState({ sidebarOpen: true })}
        >
          <PanelLeftOpen size={16} />
        </button>

        <div className="sidebar-rail-items">
          {!hydrated ? (
            <>
              <div className="sidebar-rail-skeleton" />
              <div className="sidebar-rail-skeleton" />
            </>
          ) : (
            workspaceOrder.slice(0, 9).map((wsId, idx) => {
              const ws = workspaces.find((w) => w.id === wsId);
              if (!ws) return null;
              return (
                <button
                  key={wsId}
                  className={`sidebar-rail-item${wsId === activeWorkspaceId ? " active" : ""}`}
                  type="button"
                  title={`${ws.name} (#${idx + 1})`}
                  onClick={() => setActiveWorkspace(wsId)}
                >
                  {ws.name.charAt(0).toUpperCase()}
                </button>
              );
            })
          )}
        </div>

        <div className="sidebar-rail-spacer" />

        <button
          className="icon-button sidebar-toggle"
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
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-logo">F</div>
          <span className="sidebar-brand-name">ForgePad</span>
        </div>
        <div className="toolbar-actions">
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

      <div className="sidebar-content">
        {!hydrated ? (
          <SidebarSkeleton />
        ) : projects.length === 0 ? (
          <button
            className="sidebar-empty-action"
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
              {projects.map((project) => {
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
                    className={`sidebar-project${hasActive ? " has-active" : ""}`}
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

      <div className="sidebar-footer">
        <button
          className="sidebar-footer-action"
          type="button"
          onClick={openProject}
        >
          <Plus size={14} />
          <span>Open Project</span>
        </button>
      </div>
    </aside>
  );
}
