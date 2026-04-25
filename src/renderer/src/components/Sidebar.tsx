import { FolderOpen, GitBranch, Plus, TerminalSquare } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";

export function Sidebar() {
  const projects = useAppStore((state) => state.projects);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const openProject = useAppStore((state) => state.openProject);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const createTerminal = useAppStore((state) => state.createTerminal);

  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        <div>
          <strong>ForgePad</strong>
          <span>AI coding workspace</span>
        </div>
        <button className="icon-button" type="button" title="Open project" onClick={openProject}>
          <Plus size={16} />
        </button>
      </div>

      <button className="primary-button full" type="button" onClick={openProject}>
        <FolderOpen size={16} />
        Open Project
      </button>

      <div className="sidebar-section">
        <div className="section-label">Projects</div>
        {projects.length === 0 ? (
          <div className="soft-note">No projects yet</div>
        ) : (
          projects.map((project) => {
            const projectWorkspaces = workspaces.filter((workspace) => workspace.projectId === project.id);
            return (
              <div className="project-block" key={project.id}>
                <div className="project-name" title={project.repoPath}>
                  {project.name}
                </div>
                {projectWorkspaces.map((workspace) => (
                  <button
                    className={`workspace-row ${workspace.id === activeWorkspaceId ? "active" : ""}`}
                    key={workspace.id}
                    type="button"
                    onClick={() => setActiveWorkspace(workspace.id)}
                  >
                    <GitBranch size={14} />
                    <span>{workspace.name}</span>
                    <small>{workspace.branch || "detached"}</small>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-section grow">
        <div className="section-label">Tasks</div>
        <div className="task-row active">
          <span>Root workspace</span>
          <small>Terminal + context</small>
        </div>
        <div className="task-row">
          <span>Worktree tasks</span>
          <small>Planned</small>
        </div>
      </div>

      <button
        className="secondary-button full"
        type="button"
        disabled={!activeWorkspaceId}
        onClick={() => createTerminal(activeWorkspaceId ?? undefined)}
      >
        <TerminalSquare size={16} />
        New Terminal
      </button>
    </aside>
  );
}
