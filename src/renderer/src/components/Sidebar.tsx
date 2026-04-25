import { useState } from "react";
import {
  ClipboardList,
  FolderOpen,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  SendHorizontal,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import type { TaskStatus } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";

const taskStatuses: TaskStatus[] = [
  "backlog",
  "ready",
  "running",
  "review",
  "done",
];

export function Sidebar() {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");

  const projects = useAppStore((state) => state.projects);
  const workspaces = useAppStore((state) => state.workspaces);
  const tasks = useAppStore((state) => state.tasks);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const openProject = useAppStore((state) => state.openProject);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const createTask = useAppStore((state) => state.createTask);
  const updateTaskStatus = useAppStore((state) => state.updateTaskStatus);
  const deleteTask = useAppStore((state) => state.deleteTask);
  const addTaskToContext = useAppStore((state) => state.addTaskToContext);

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const activeProject = activeWorkspace
    ? projects.find((project) => project.id === activeWorkspace.projectId)
    : projects[0];
  const visibleTasks = activeProject
    ? tasks.filter((task) => task.projectId === activeProject.id)
    : [];

  const submitTask = () => {
    if (!activeProject) return;
    const taskId = createTask(
      activeProject.id,
      activeWorkspace?.id,
      taskTitle,
      taskDescription,
    );
    if (!taskId) return;
    setTaskTitle("");
    setTaskDescription("");
    setIsCreatingTask(false);
  };

  if (!sidebarOpen) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button
          className="icon-button"
          type="button"
          title="Expand sidebar"
          onClick={() => useAppStore.setState({ sidebarOpen: true })}
        >
          <PanelLeftOpen size={16} />
        </button>

        <div className="sidebar-rail-group">
          <button
            className="icon-button"
            type="button"
            title="Open project"
            onClick={openProject}
          >
            <FolderOpen size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="New task"
            disabled={!activeProject}
            onClick={() => {
              useAppStore.setState({ sidebarOpen: true });
              setIsCreatingTask(true);
            }}
          >
            <ClipboardList size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="New terminal"
            disabled={!activeWorkspaceId}
            onClick={() => createTerminal(activeWorkspaceId ?? undefined)}
          >
            <TerminalSquare size={16} />
          </button>
        </div>

        <div className="sidebar-rail-spacer" />

        <div
          className="sidebar-rail-badge"
          title={`${visibleTasks.length} task${visibleTasks.length === 1 ? "" : "s"}`}
        >
          {visibleTasks.length}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        <div>
          <strong>ForgePad</strong>
          <span>AI coding workspace</span>
        </div>
        <div className="toolbar-actions">
          <button
            className="icon-button"
            type="button"
            title="Collapse sidebar"
            onClick={() => useAppStore.setState({ sidebarOpen: false })}
          >
            <PanelLeftClose size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Open project"
            onClick={openProject}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="sidebar-nav">
        <button
          className="workspace-row active"
          type="button"
          onClick={openProject}
        >
          <FolderOpen size={14} />
          <span>Workspaces</span>
          <small>{projects.length}</small>
        </button>
        <button
          className="workspace-row"
          type="button"
          disabled={!activeProject}
          onClick={() => setIsCreatingTask((value) => !value)}
        >
          <ClipboardList size={14} />
          <span>Tasks</span>
          <small>{visibleTasks.length}</small>
        </button>
      </div>

      <div className="sidebar-section">
        <div className="section-label">Projects</div>
        {projects.length === 0 ? (
          <div className="soft-note">No projects yet</div>
        ) : (
          projects.map((project) => {
            const projectWorkspaces = workspaces.filter(
              (workspace) => workspace.projectId === project.id,
            );
            return (
              <div className="project-block" key={project.id}>
                <div className="project-name" title={project.repoPath}>
                  {project.name}
                </div>
                {projectWorkspaces.map((workspace) => (
                  <button
                    className={`workspace-row project-workspace-row ${workspace.id === activeWorkspaceId ? "active" : ""}`}
                    key={workspace.id}
                    type="button"
                    onClick={() => setActiveWorkspace(workspace.id)}
                  >
                    <GitBranch size={14} />
                    <div>
                      <span>{workspace.name}</span>
                      <small>{workspace.branch || "detached"}</small>
                    </div>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section grow">
          <div className="section-label">Tasks</div>
          <button
            className="secondary-button full"
            type="button"
            disabled={!activeProject}
            onClick={() => setIsCreatingTask((value) => !value)}
          >
            <ClipboardList size={16} />
            New Task
          </button>

          {isCreatingTask ? (
            <div className="task-row active">
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.currentTarget.value)}
                placeholder="Task title"
              />
              <textarea
                value={taskDescription}
                onChange={(event) =>
                  setTaskDescription(event.currentTarget.value)
                }
                placeholder="Describe what the agent should do"
              />
              <button
                className="primary-button full"
                type="button"
                disabled={!taskTitle.trim()}
                onClick={submitTask}
              >
                Create Task
              </button>
            </div>
          ) : null}

          {visibleTasks.length === 0 ? (
            <div className="soft-note">No tasks yet</div>
          ) : (
            visibleTasks.map((task) => (
              <div
                className={`task-row ${task.workspaceId === activeWorkspaceId ? "active" : ""}`}
                key={task.id}
              >
                <span title={task.title}>{task.title}</span>
                <small>
                  {task.status}
                  {task.workspaceId === activeWorkspaceId
                    ? " · current workspace"
                    : ""}
                </small>
                {task.description ? (
                  <small title={task.description}>{task.description}</small>
                ) : null}
                <select
                  value={task.status}
                  onChange={(event) =>
                    updateTaskStatus(
                      task.id,
                      event.currentTarget.value as TaskStatus,
                    )
                  }
                >
                  {taskStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <div className="toolbar-actions">
                  <button
                    className="icon-button small"
                    type="button"
                    title="Add task to context"
                    onClick={() => addTaskToContext(task.id)}
                  >
                    <SendHorizontal size={14} />
                  </button>
                  <button
                    className="icon-button small danger"
                    type="button"
                    title="Delete task"
                    onClick={() => deleteTask(task.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
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
