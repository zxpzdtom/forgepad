import { useState } from "react";
import {
  ChevronRight,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";

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

function WorkspaceRow({ workspace, isActive, onClick }: {
  workspace: { id: string; name: string; branch: string };
  isActive: boolean;
  onClick: () => void;
}) {
  const branchStats = useAppStore((state) => state.branchStats[workspace.id]);
  const stats = branchStats ?? { ahead: 0, behind: 0, additions: 0, deletions: 0 };

  return (
    <button
      className={`sidebar-workspace${isActive ? " active" : ""}`}
      type="button"
      onClick={onClick}
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

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
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
            projects.map((project) => {
              const projectWorkspaces = workspaces.filter(
                (w) => w.projectId === project.id,
              );
              const isActive = projectWorkspaces.some(
                (w) => w.id === activeWorkspaceId,
              );
              return (
                <button
                  key={project.id}
                  className={`sidebar-rail-item${isActive ? " active" : ""}`}
                  type="button"
                  title={project.name}
                  onClick={() => {
                    const first = projectWorkspaces[0];
                    if (first) setActiveWorkspace(first.id);
                  }}
                >
                  {project.name.charAt(0).toUpperCase()}
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
          projects.map((project) => {
            const projectWorkspaces = workspaces.filter(
              (w) => w.projectId === project.id,
            );
            const isCollapsed = collapsedProjects.has(project.id);
            const hasActive = projectWorkspaces.some(
              (w) => w.id === activeWorkspaceId,
            );

            return (
              <div
                className={`sidebar-project${hasActive ? " has-active" : ""}`}
                key={project.id}
              >
                <button
                  className="sidebar-project-header"
                  type="button"
                  onClick={() => toggleProject(project.id)}
                >
                  <ChevronRight
                    size={14}
                    className={`sidebar-chevron${isCollapsed ? "" : " open"}`}
                  />
                  <span className="sidebar-project-name">{project.name}</span>
                  <small className="sidebar-project-count">
                    {projectWorkspaces.length}
                  </small>
                </button>

                {!isCollapsed &&
                  projectWorkspaces.map((workspace) => (
                    <WorkspaceRow
                      key={workspace.id}
                      workspace={workspace}
                      isActive={workspace.id === activeWorkspaceId}
                      onClick={() => setActiveWorkspace(workspace.id)}
                    />
                  ))}
              </div>
            );
          })
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
