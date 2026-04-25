import { create } from "zustand";
import type {
  AppSettings,
  ContextBundleResult,
  ContextDiffItem,
  ContextFileItem,
  ContextItem,
  ContextTaskItem,
  DiffCommentItem,
  DiffFileData,
  FileStatus,
  GitBucket,
  GitStatusKind,
  PersistedAppState,
  Project,
  RightPanelMode,
  Tab,
  Task,
  TaskStatus,
  Workspace,
} from "@shared/types";
import { DEFAULT_SETTINGS } from "@shared/types";

type Toast = {
  id: string;
  kind: "info" | "error" | "success";
  message: string;
};

type AppState = {
  projects: Project[];
  workspaces: Workspace[];
  tasks: Task[];
  tabs: Tab[];
  activeWorkspaceId: string | null;
  activeTabId: string | null;
  rightPanelMode: RightPanelMode;
  rightPanelOpen: boolean;
  sidebarOpen: boolean;
  contextItems: ContextItem[];
  composerText: string;
  settings: AppSettings;
  lastBundle: ContextBundleResult | null;
  toasts: Toast[];
  hydrated: boolean;
  hydrate: (state: Partial<PersistedAppState> | null) => void;
  toPersistedState: () => PersistedAppState;
  addToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: string) => void;
  openProject: () => Promise<void>;
  setActiveWorkspace: (workspaceId: string | null) => void;
  createTerminal: (workspaceId?: string) => Promise<string | null>;
  addTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  openFileTab: (workspaceId: string, relPath: string) => void;
  openDiffTab: (workspaceId: string, activePath?: string) => void;
  openContextPreviewTab: (workspaceId?: string) => void;
  setRightPanelMode: (mode: RightPanelMode) => void;
  toggleContextFile: (workspaceId: string, relPath: string) => void;
  addContextFiles: (workspaceId: string, relPaths: string[]) => void;
  addContextDiff: (
    workspaceId: string,
    relPath: string,
    bucket: GitBucket,
    status: GitStatusKind,
  ) => void;
  removeContextItem: (id: string) => void;
  clearWorkspaceContext: (workspaceId: string) => void;
  setComposerText: (value: string) => void;
  createTask: (
    projectId: string,
    workspaceId: string | undefined,
    title: string,
    description: string,
  ) => string | null;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  deleteTask: (taskId: string) => void;
  addTaskToContext: (taskId: string) => void;
  addDiffComment: (
    workspaceId: string,
    relPath: string,
    bucket: GitBucket,
    range: {
      start: number;
      end: number;
      side?: "additions" | "deletions";
      endSide?: "additions" | "deletions";
    },
    text: string,
  ) => void;
  updateFileNote: (id: string, note: string) => void;
  sendContextToTerminal: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => void;
  refreshBranch: (workspaceId: string) => Promise<void>;
};

function id(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

function tabTitle(tab: Tab): string {
  if (tab.type === "terminal") return tab.title;
  if (tab.type === "diff") return "Changes";
  if (tab.type === "context-preview") return "Context";
  return tab.relPath.split("/").pop() || tab.relPath;
}

function serializeForSave(state: AppState): PersistedAppState {
  return {
    schemaVersion: 1,
    projects: state.projects,
    workspaces: state.workspaces,
    tasks: state.tasks,
    tabs: state.tabs.filter((tab) => tab.type !== "terminal"),
    activeWorkspaceId: state.activeWorkspaceId,
    activeTabId:
      state.tabs.find((tab) => tab.id === state.activeTabId)?.type ===
      "terminal"
        ? null
        : state.activeTabId,
    rightPanelMode: state.rightPanelMode,
    rightPanelOpen: state.rightPanelOpen,
    sidebarOpen: state.sidebarOpen,
    contextItems: state.contextItems,
    composerText: state.composerText,
    settings: state.settings,
  };
}

function contextKey(item: ContextItem): string {
  if (item.type === "file") return `${item.workspaceId}:file:${item.relPath}`;
  if (item.type === "diff")
    return `${item.workspaceId}:diff:${item.bucket}:${item.relPath}`;
  if (item.type === "task") return `${item.workspaceId}:task:${item.taskId}`;
  return `${item.workspaceId}:comment:${item.id}`;
}

function findWorkspace(
  state: AppState,
  workspaceId?: string | null,
): Workspace | undefined {
  const idToFind = workspaceId ?? state.activeWorkspaceId;
  return state.workspaces.find((workspace) => workspace.id === idToFind);
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  workspaces: [],
  tasks: [],
  tabs: [],
  activeWorkspaceId: null,
  activeTabId: null,
  rightPanelMode: "files",
  rightPanelOpen: true,
  sidebarOpen: true,
  contextItems: [],
  composerText: "",
  settings: { ...DEFAULT_SETTINGS },
  lastBundle: null,
  toasts: [],
  hydrated: false,

  hydrate: (state) => {
    if (state?.schemaVersion !== undefined && state.schemaVersion !== 1) {
      set({ hydrated: true });
      return;
    }

    const settings = { ...DEFAULT_SETTINGS, ...(state?.settings ?? {}) };
    const projects = state?.projects ?? [];
    const workspaces = state?.workspaces ?? [];
    const tasks = (state?.tasks ?? []).filter((task) => {
      const projectExists = projects.some(
        (project) => project.id === task.projectId,
      );
      const workspaceExists =
        !task.workspaceId ||
        workspaces.some((workspace) => workspace.id === task.workspaceId);
      return projectExists && workspaceExists;
    });
    const activeWorkspaceId =
      state?.activeWorkspaceId &&
      workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
        ? state.activeWorkspaceId
        : (workspaces[0]?.id ?? null);
    const tabs = (state?.tabs ?? []).filter((tab) =>
      workspaces.some((workspace) => workspace.id === tab.workspaceId),
    );
    const contextItems = (state?.contextItems ?? []).filter((item) => {
      if (!workspaces.some((workspace) => workspace.id === item.workspaceId))
        return false;
      if (item.type === "task")
        return tasks.some((task) => task.id === item.taskId);
      return true;
    });
    set({
      projects,
      workspaces,
      tasks,
      tabs,
      activeWorkspaceId,
      activeTabId: tabs.some((tab) => tab.id === state?.activeTabId)
        ? (state?.activeTabId ?? null)
        : null,
      rightPanelMode: state?.rightPanelMode ?? "files",
      rightPanelOpen: state?.rightPanelOpen ?? true,
      sidebarOpen: state?.sidebarOpen ?? true,
      contextItems,
      composerText: state?.composerText ?? "",
      settings,
      hydrated: true,
    });
  },

  toPersistedState: () => serializeForSave(get()),

  addToast: (kind, message) => {
    const toast: Toast = { id: id(), kind, message };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    setTimeout(() => get().dismissToast(toast.id), 5000);
  },

  dismissToast: (toastId) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== toastId),
    })),

  openProject: async () => {
    const opened = await window.forgepad.app.openProject();
    if (!opened) return;

    const existingProject = get().projects.find(
      (project) => project.repoPath === opened.repoPath,
    );
    if (existingProject) {
      const workspace = get().workspaces.find(
        (item) => item.projectId === existingProject.id && item.isRoot,
      );
      get().setActiveWorkspace(workspace?.id ?? null);
      return;
    }

    const projectId = id();
    const workspaceId = id();
    const project: Project = {
      id: projectId,
      name: opened.name,
      repoPath: opened.repoPath,
      createdAt: now(),
      updatedAt: now(),
    };
    const workspace: Workspace = {
      id: workspaceId,
      projectId,
      name: opened.name,
      branch: opened.branch,
      worktreePath: opened.repoPath,
      isRoot: true,
      createdAt: now(),
    };

    set((state) => ({
      projects: [...state.projects, project],
      workspaces: [...state.workspaces, workspace],
      activeWorkspaceId: workspaceId,
      activeTabId: null,
    }));

    await get().createTerminal(workspaceId);
  },

  setActiveWorkspace: (workspaceId) => {
    const tabs = get().tabs.filter((tab) => tab.workspaceId === workspaceId);
    set({ activeWorkspaceId: workspaceId, activeTabId: tabs[0]?.id ?? null });
  },

  createTerminal: async (workspaceId) => {
    const workspace = findWorkspace(get(), workspaceId);
    if (!workspace) return null;
    try {
      const ptyId = await window.forgepad.pty.create(
        workspace.worktreePath,
        get().settings.defaultShell || undefined,
        undefined,
        { FORGEPAD_WORKSPACE_ID: workspace.id },
      );
      const terminalCount = get().tabs.filter(
        (tab) => tab.workspaceId === workspace.id && tab.type === "terminal",
      ).length;
      const tab: Tab = {
        id: id(),
        workspaceId: workspace.id,
        type: "terminal",
        title:
          terminalCount === 0 ? "Terminal" : `Terminal ${terminalCount + 1}`,
        ptyId,
      };
      get().addTab(tab);
      return ptyId;
    } catch (error) {
      get().addToast(
        "error",
        error instanceof Error ? error.message : "Failed to create terminal.",
      );
      return null;
    }
  },

  addTab: (tab) =>
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id })),

  closeTab: (tabId) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (tab?.type === "terminal") window.forgepad.pty.destroy(tab.ptyId);
    set((state) => {
      const tabs = state.tabs.filter((item) => item.id !== tabId);
      const activeTabId =
        state.activeTabId === tabId
          ? (tabs
              .filter((item) => item.workspaceId === state.activeWorkspaceId)
              .at(-1)?.id ?? null)
          : state.activeTabId;
      return { tabs, activeTabId };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  openFileTab: (workspaceId, relPath) => {
    const existing = get().tabs.find(
      (tab) =>
        tab.workspaceId === workspaceId &&
        tab.type === "file" &&
        tab.relPath === relPath,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    get().addTab({ id: id(), workspaceId, type: "file", relPath });
  },

  openDiffTab: (workspaceId, activePath) => {
    const existing = get().tabs.find(
      (tab) => tab.workspaceId === workspaceId && tab.type === "diff",
    );
    if (existing) {
      set({
        activeTabId: existing.id,
        tabs: get().tabs.map((tab) =>
          tab.id === existing.id && tab.type === "diff"
            ? { ...tab, activePath }
            : tab,
        ),
      });
      return;
    }
    get().addTab({ id: id(), workspaceId, type: "diff", activePath });
  },

  openContextPreviewTab: (workspaceId) => {
    const workspace = findWorkspace(get(), workspaceId);
    if (!workspace) return;

    const existing = get().tabs.find(
      (tab) =>
        tab.workspaceId === workspace.id && tab.type === "context-preview",
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    get().addTab({
      id: id(),
      workspaceId: workspace.id,
      type: "context-preview",
    });
  },

  setRightPanelMode: (mode) =>
    set({ rightPanelMode: mode, rightPanelOpen: true }),

  toggleContextFile: (workspaceId, relPath) => {
    const key = `${workspaceId}:file:${relPath}`;
    set((state) => {
      const exists = state.contextItems.some(
        (item) => contextKey(item) === key,
      );
      if (exists)
        return {
          contextItems: state.contextItems.filter(
            (item) => contextKey(item) !== key,
          ),
        };
      const next: ContextFileItem = {
        id: id(),
        type: "file",
        workspaceId,
        relPath,
        includeContent: true,
        addedAt: now(),
      };
      return {
        contextItems: [...state.contextItems, next],
        rightPanelMode: "context",
      };
    });
  },

  addContextFiles: (workspaceId, relPaths) => {
    set((state) => {
      const keys = new Set(state.contextItems.map(contextKey));
      const additions: ContextFileItem[] = [];
      for (const relPath of relPaths) {
        const key = `${workspaceId}:file:${relPath}`;
        if (keys.has(key)) continue;
        keys.add(key);
        additions.push({
          id: id(),
          type: "file",
          workspaceId,
          relPath,
          includeContent: true,
          addedAt: now(),
        });
      }
      return {
        contextItems: [...state.contextItems, ...additions],
        rightPanelMode: "context",
      };
    });
  },

  addContextDiff: (workspaceId, relPath, bucket, status) => {
    set((state) => {
      const key = `${workspaceId}:diff:${bucket}:${relPath}`;
      if (state.contextItems.some((item) => contextKey(item) === key))
        return state;
      const next: ContextDiffItem = {
        id: id(),
        type: "diff",
        workspaceId,
        relPath,
        bucket,
        status,
        addedAt: now(),
      };
      return {
        contextItems: [...state.contextItems, next],
        rightPanelMode: "context",
      };
    });
  },

  removeContextItem: (itemId) =>
    set((state) => ({
      contextItems: state.contextItems.filter((item) => item.id !== itemId),
    })),

  clearWorkspaceContext: (workspaceId) =>
    set((state) => ({
      contextItems: state.contextItems.filter(
        (item) => item.workspaceId !== workspaceId,
      ),
    })),

  setComposerText: (value) => set({ composerText: value }),

  createTask: (projectId, workspaceId, title, description) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return null;

    const task: Task = {
      id: id(),
      projectId,
      workspaceId,
      title: trimmedTitle,
      description: description.trim(),
      status: "ready",
      createdAt: now(),
      updatedAt: now(),
    };

    set((state) => ({ tasks: [...state.tasks, task] }));
    return task.id;
  },

  updateTaskStatus: (taskId, status) =>
    set((state) => {
      const tasks = state.tasks.map((task) =>
        task.id === taskId ? { ...task, status, updatedAt: now() } : task,
      );
      const updatedTask = tasks.find((task) => task.id === taskId);

      return {
        tasks,
        contextItems: state.contextItems.map((item) =>
          item.type === "task" && item.taskId === taskId && updatedTask
            ? {
                ...item,
                title: updatedTask.title,
                description: updatedTask.description,
                status: updatedTask.status,
              }
            : item,
        ),
      };
    }),

  deleteTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== taskId),
      workspaces: state.workspaces.map((workspace) =>
        workspace.taskId === taskId
          ? { ...workspace, taskId: undefined }
          : workspace,
      ),
      contextItems: state.contextItems.filter(
        (item) => item.type !== "task" || item.taskId !== taskId,
      ),
    })),

  addTaskToContext: (taskId) => {
    const state = get();
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const workspace =
      (task.workspaceId
        ? state.workspaces.find((item) => item.id === task.workspaceId)
        : undefined) ??
      state.workspaces.find(
        (item) =>
          item.id === state.activeWorkspaceId &&
          item.projectId === task.projectId,
      ) ??
      state.workspaces.find((item) => item.projectId === task.projectId);

    if (!workspace) return;

    const next: ContextTaskItem = {
      id: id(),
      type: "task",
      workspaceId: workspace.id,
      taskId: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      addedAt: now(),
    };

    set((current) => {
      const key = contextKey(next);
      if (current.contextItems.some((item) => contextKey(item) === key)) {
        return { rightPanelMode: "context", rightPanelOpen: true };
      }
      return {
        contextItems: [...current.contextItems, next],
        rightPanelMode: "context",
        rightPanelOpen: true,
      };
    });
  },

  addDiffComment: (workspaceId, relPath, bucket, range, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next: DiffCommentItem = {
      id: id(),
      type: "comment",
      workspaceId,
      relPath,
      bucket,
      side: range.side ?? "additions",
      endSide: range.endSide,
      startLine: range.start,
      endLine: range.end,
      text: trimmed,
      addedAt: now(),
    };
    set((state) => ({
      contextItems: [...state.contextItems, next],
      rightPanelMode: "context",
    }));
  },

  updateFileNote: (itemId, note) =>
    set((state) => ({
      contextItems: state.contextItems.map((item) =>
        item.id === itemId &&
        (item.type === "file" || item.type === "diff" || item.type === "task")
          ? { ...item, note }
          : item,
      ),
    })),

  sendContextToTerminal: async () => {
    const state = get();
    const workspace = findWorkspace(state);
    if (!workspace) return;
    const items = state.contextItems.filter(
      (item) => item.workspaceId === workspace.id,
    );
    const files = items
      .filter((item): item is ContextFileItem => item.type === "file")
      .map((item) => ({
        relPath: item.relPath,
        note: item.note,
        includeContent: item.includeContent,
      }));
    const diffs = items
      .filter((item): item is ContextDiffItem => item.type === "diff")
      .map((item) => ({
        relPath: item.relPath,
        bucket: item.bucket,
        status: item.status,
        note: item.note,
      }));
    const tasks = items
      .filter((item): item is ContextTaskItem => item.type === "task")
      .map((item) => ({
        title: item.title,
        description: item.description,
        status: item.status,
        note: item.note,
      }));
    const comments = items
      .filter((item): item is DiffCommentItem => item.type === "comment")
      .map(
        ({
          id: _id,
          type: _type,
          workspaceId: _workspaceId,
          addedAt: _addedAt,
          ...comment
        }) => comment,
      );

    const bundle = await window.forgepad.context.createBundle({
      workspacePath: workspace.worktreePath,
      workspaceName: workspace.name,
      branch: workspace.branch,
      prompt: state.composerText,
      tasks,
      files,
      diffs,
      comments,
    });

    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    let terminalTab =
      activeTab?.type === "terminal"
        ? activeTab
        : state.tabs.find(
            (tab) =>
              tab.workspaceId === workspace.id && tab.type === "terminal",
          );

    if (!terminalTab) {
      const ptyId = await get().createTerminal(workspace.id);
      terminalTab = get().tabs.find(
        (tab) => tab.type === "terminal" && tab.ptyId === ptyId,
      );
    }
    if (!terminalTab || terminalTab.type !== "terminal") return;

    const prompt = `Please read ${bundle.relPath} and complete the task described there.`;
    window.forgepad.pty.write(
      terminalTab.ptyId,
      `\x1b[200~${prompt}\x1b[201~\r`,
    );
    set((current) => ({
      lastBundle: bundle,
      activeTabId: terminalTab.id,
      composerText: "",
      contextItems: current.settings.sendAndClearComments
        ? current.contextItems.filter(
            (item) =>
              item.workspaceId !== workspace.id || item.type !== "comment",
          )
        : current.contextItems,
    }));
    get().addToast("success", `Sent context: ${bundle.relPath}`);
  },

  updateSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),

  refreshBranch: async (workspaceId) => {
    const workspace = get().workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    const branch = await window.forgepad.git.getCurrentBranch(
      workspace.worktreePath,
    );
    set((state) => ({
      workspaces: state.workspaces.map((item) =>
        item.id === workspaceId ? { ...item, branch } : item,
      ),
    }));
  },
}));

export function getTabTitle(tab: Tab): string {
  return tabTitle(tab);
}

export function workspaceForTab(
  workspaces: Workspace[],
  tab: Tab | undefined,
): Workspace | undefined {
  if (!tab) return undefined;
  return workspaces.find((workspace) => workspace.id === tab.workspaceId);
}

export function changedFileToDiffData(
  file: FileStatus,
): Pick<DiffFileData, "path" | "bucket" | "status" | "oldPath"> {
  return {
    path: file.path,
    bucket: file.bucket,
    status: file.status,
    oldPath: file.oldPath,
  };
}
