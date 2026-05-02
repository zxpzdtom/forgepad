import { arrayMove } from '@dnd-kit/sortable';
import type { AgentStatus } from '@shared/agent-lifecycle';
import type {
  AgentPreset,
  AppSettings,
  CodeSelectionItem,
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
  LspSymbolPeekState,
  NotificationSettings,
  NotificationSound,
  PersistedAppState,
  Project,
  RightPanelMode,
  SelectedElementInfo,
  ShortcutActionId,
  ShortcutCombo,
  Tab,
  Task,
  TaskStatus,
  Workspace,
} from '@shared/types';
import { DEFAULT_AGENT_PRESETS, DEFAULT_NOTIFICATION_SETTINGS, DEFAULT_SETTINGS, DEFAULT_SHORTCUTS } from '@shared/types';
import { create } from 'zustand';

export type SettingsSection =
  | 'general'
  | 'agent'
  | 'terminal'
  | 'changes'
  | 'notifications'
  | 'git'
  | 'advanced'
  | 'shortcuts'
  | 'appearance';

type Toast = {
  id: string;
  kind: 'info' | 'error' | 'success';
  message: string;
};

type AppState = {
  projects: Project[];
  workspaces: Workspace[];
  tasks: Task[];
  tabs: Tab[];
  activeWorkspaceId: string | null;
  activeTabId: string | null;
  activeAgentTabId: string | null;
  activeShellTabId: string | null;
  activeFileTabId: string | null;
  /** Per-workspace last-selected agent tab – survives workspace switching */
  workspaceActiveAgentTabIds: Record<string, string>;
  /** File path to reveal in the file tree (set when clicking a file tab). */
  revealFileInTree: { relPath: string; epoch: number } | null;
  rightPanelMode: RightPanelMode;
  rightPanelOpen: boolean;
  sidebarOpen: boolean;
  terminalPanelOpen: boolean;
  settingsOpen: boolean | SettingsSection;
  contextItems: ContextItem[];
  composerText: string;
  settings: AppSettings;
  lastBundle: ContextBundleResult | null;
  toasts: Toast[];
  hydrated: boolean;
  workspaceLoadingIds: Set<string>;
  focusedColumn: 'sidebar' | 'agent' | 'file' | 'rightPanel';
  branchStats: Record<string, { ahead: number; behind: number; additions: number; deletions: number; prNumber?: number | null; prUrl?: string | null }>;
  gitRefreshEpoch: number;
  /** Agent lifecycle statuses keyed by ptyId */
  agentStatuses: Record<string, AgentStatus>;
  /** ptyIds whose process has exited */
  exitedPtyIds: Set<string>;
  /** Browser select mode active state, keyed by tabId */
  browserSelectMode: Record<string, boolean>;
  /** Browser URL history for autocomplete, most recent first */
  browserHistory: import('@shared/types').BrowserHistoryEntry[];
  /** Whether the browser feedback modal is open */
  feedbackModalOpen: boolean;
  /** Pending element selection for feedback modal */
  pendingFeedback: { tabId: string; element: SelectedElementInfo } | null;
  /** LSP symbol peek panel state (Cmd+Click results) */
  symbolPeek: LspSymbolPeekState;
  handleAgentStatusUpdate: (ptyId: string, status: AgentStatus) => void;
  clearAgentStatus: (ptyId: string) => void;
  notifyAgentInput: (ptyId: string) => void;
  markPtyExited: (ptyId: string) => void;
  triggerGitRefresh: () => void;
  hydrate: (state: Partial<PersistedAppState> | null) => void;
  toPersistedState: () => PersistedAppState;
  addToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: string) => void;
  openProject: () => Promise<void>;
  setActiveWorkspace: (workspaceId: string | null) => void;
  createTerminal: (workspaceId?: string, initialCommand?: string) => Promise<string | null>;
  createAgentTerminal: (workspaceId?: string, commandOverride?: string, presetId?: string) => Promise<string | null>;
  addTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: (workspaceId: string, type: 'terminal' | 'file') => void;
  closeTabsToRight: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  openFileTab: (workspaceId: string, relPath: string, lineNumber?: number) => void;
  openExternalFileTab: (workspaceId: string, absPath: string) => void;
  openDiffTab: (workspaceId: string, activePath?: string) => void;
  openContextPreviewTab: (workspaceId?: string) => void;
  setRightPanelMode: (mode: RightPanelMode) => void;
  setTerminalPanelOpen: (open: boolean) => void;
  toggleTerminalPanel: () => Promise<void>;
  toggleContextFile: (workspaceId: string, relPath: string) => void;
  addContextFiles: (workspaceId: string, relPaths: string[]) => void;
  addContextDiff: (workspaceId: string, relPath: string, bucket: GitBucket, status: GitStatusKind) => void;
  removeContextItem: (id: string) => void;
  clearWorkspaceContext: (workspaceId: string) => void;
  setComposerText: (value: string) => void;
  createTask: (projectId: string, workspaceId: string | undefined, title: string, description: string) => string | null;
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
      side?: 'additions' | 'deletions';
      endSide?: 'additions' | 'deletions';
    },
    text: string,
  ) => void;
  addCodeSelection: (
    workspaceId: string,
    relPath: string,
    range: { start: number; end: number; selectedText: string },
    text: string,
  ) => void;
  updateFileNote: (id: string, note: string) => void;
  updateFileIncludeContent: (id: string, includeContent: boolean) => void;
  sendContextToTerminal: () => Promise<void>;
  addCustomTheme: (theme: import('@shared/types').ThemeDefinition) => void;
  removeCustomTheme: (themeId: string) => void;
  renameCustomTheme: (themeId: string, name: string) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  updateShortcut: (actionId: ShortcutActionId, combo: ShortcutCombo) => void;
  resetShortcut: (actionId: ShortcutActionId) => void;
  resetAllShortcuts: () => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  refreshBranch: (workspaceId: string) => Promise<void>;
  addAgentPreset: (preset: AgentPreset) => void;
  removeAgentPreset: (presetId: string) => void;
  updateAgentPreset: (presetId: string, partial: Partial<AgentPreset>) => void;
  updateTerminalSessionId: (tabId: string, sessionId: string) => void;
  renameTab: (tabIdOrPtyId: string, title: string) => void;
  restoreAgentSessions: () => Promise<void>;
  setFocusedColumn: (column: AppState['focusedColumn']) => void;
  refreshBranchStats: (workspaceId?: string) => Promise<void>;
  reorderProjects: (activeId: string, overId: string) => void;
  reorderWorkspaces: (projectId: string, activeId: string, overId: string) => void;
  reorderTabs: (activeId: string, overId: string) => void;
  removeProject: (projectId: string) => void;
  removeWorkspace: (workspaceId: string) => void;
  deleteWorktree: (workspaceId: string) => Promise<void>;
  createWorktree: (projectId: string, branch: string, trackRemote?: boolean) => Promise<void>;
  // Browser tab actions
  createBrowserTab: (url?: string) => void;
  addBrowserHistoryEntry: (url: string, title: string, favicon?: string) => void;
  clearBrowserHistory: () => void;
  updateBrowserNavState: (state: {
    tabId: string;
    url: string;
    title: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
  }) => void;
  setBrowserSelectMode: (tabId: string, active: boolean) => void;
  openFeedbackModal: (tabId: string, element: SelectedElementInfo) => void;
  closeFeedbackModal: () => void;
  submitBrowserFeedback: (comment: string) => void;
  openSymbolPeek: (peek: NonNullable<LspSymbolPeekState>) => void;
  closeSymbolPeek: () => void;
  clearTabTargetLine: (tabId: string) => void;
  updateNotificationSettings: (partial: Partial<NotificationSettings>) => void;
  addCustomSound: (sound: NotificationSound) => void;
  removeCustomSound: (soundId: string) => void;
  renameCustomSound: (soundId: string, name: string) => void;
};

function id(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

function tabTitle(tab: Tab): string {
  if (tab.type === 'terminal') return tab.title;
  if (tab.type === 'diff') return 'Changes';
  if (tab.type === 'context-preview') return 'Context';
  if (tab.type === 'browser') return tab.title || 'Browser';
  return tab.relPath.split('/').pop() || tab.relPath;
}

function agentLabelForCommand(command: string, presets: AgentPreset[]): string {
  const normalized = command.trim().split(/\s+/)[0];
  const preset = presets.find((item) => item.command.trim().split(/\s+/)[0] === normalized);
  return preset?.label ?? 'Agent';
}

function serializeForSave(state: AppState): PersistedAppState {
  // Snapshot per-workspace agent tab map, including the current workspace's active agent tab
  const workspaceActiveAgentTabIds = { ...state.workspaceActiveAgentTabIds };
  if (state.activeWorkspaceId && state.activeAgentTabId) {
    workspaceActiveAgentTabIds[state.activeWorkspaceId] = state.activeAgentTabId;
  }

  return {
    schemaVersion: 1,
    projects: state.projects,
    workspaces: state.workspaces,
    tasks: state.tasks,
    tabs: state.tabs
      .filter(
        (tab) =>
          tab.type === 'browser' ||
          tab.type !== 'terminal' ||
          (tab.type === 'terminal' && tab.isAgent && tab.sessionId && tab.sessionConfirmed),
      )
      .map((tab) => (tab.type === 'file' ? { ...tab, targetLine: undefined } : tab)),
    activeWorkspaceId: state.activeWorkspaceId,
    activeTabId: state.tabs.find((tab) => tab.id === state.activeTabId)?.type === 'terminal' ? null : state.activeTabId,
    workspaceActiveAgentTabIds,
    rightPanelMode: state.rightPanelMode,
    rightPanelOpen: state.rightPanelOpen,
    sidebarOpen: state.sidebarOpen,
    terminalPanelOpen: state.terminalPanelOpen,
    contextItems: state.contextItems,
    composerText: state.composerText,
    settings: state.settings,
    browserHistory: state.browserHistory,
  };
}

function contextKey(item: ContextItem): string {
  if (item.type === 'file') return `${item.workspaceId}:file:${item.relPath}`;
  if (item.type === 'diff') return `${item.workspaceId}:diff:${item.bucket}:${item.relPath}`;
  if (item.type === 'task') return `${item.workspaceId}:task:${item.taskId}`;
  if (item.type === 'selection') return `${item.workspaceId}:selection:${item.id}`;
  return `${item.workspaceId}:comment:${item.id}`;
}

function findWorkspace(state: AppState, workspaceId?: string | null): Workspace | undefined {
  const idToFind = workspaceId ?? state.activeWorkspaceId;
  return state.workspaces.find((workspace) => workspace.id === idToFind);
}

function closeTerminalTabs(tabs: Tab[]): void {
  for (const tab of tabs) {
    if (tab.type === 'terminal') window.forgepad.pty.destroy(tab.ptyId);
  }
}

export function resolveShortcuts(settings: AppSettings): Record<ShortcutActionId, ShortcutCombo> {
  return {
    ...DEFAULT_SHORTCUTS,
    ...(settings.keyboardShortcuts ?? {}),
  } as Record<ShortcutActionId, ShortcutCombo>;
}

function omitBranchStats(branchStats: AppState['branchStats'], workspaceIds: Set<string>): AppState['branchStats'] {
  return Object.fromEntries(Object.entries(branchStats).filter(([workspaceId]) => !workspaceIds.has(workspaceId)));
}

function activeIdsAfterRemoval(
  state: AppState,
  tabs: Tab[],
  workspaces: Workspace[],
): Pick<AppState, 'activeWorkspaceId' | 'activeTabId' | 'activeAgentTabId' | 'activeShellTabId' | 'activeFileTabId'> {
  const activeWorkspaceId =
    state.activeWorkspaceId && workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : (workspaces[0]?.id ?? null);

  const workspaceTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId);
  const agentTabs = workspaceTabs.filter((tab) => tab.type === 'terminal' && tab.isAgent);
  const shellTabs = workspaceTabs.filter((tab) => tab.type === 'terminal' && !tab.isAgent);
  const fileTabs = workspaceTabs.filter((tab) => tab.type !== 'terminal');

  // Try to restore the remembered agent tab for this workspace first
  const rememberedAgentTabId = activeWorkspaceId ? state.workspaceActiveAgentTabIds[activeWorkspaceId] : undefined;

  const activeAgentTabId =
    // 1. Check the remembered per-workspace agent tab
    rememberedAgentTabId && agentTabs.some((tab) => tab.id === rememberedAgentTabId)
      ? rememberedAgentTabId
      : // 2. Fall back to current global active agent tab (if it belongs to this workspace)
        state.activeAgentTabId && agentTabs.some((tab) => tab.id === state.activeAgentTabId)
        ? state.activeAgentTabId
        : // 3. Fall back to last agent tab
          (agentTabs.at(-1)?.id ?? null);

  const activeShellTabId =
    state.activeShellTabId && shellTabs.some((tab) => tab.id === state.activeShellTabId)
      ? state.activeShellTabId
      : (shellTabs.at(-1)?.id ?? null);
  const activeFileTabId =
    state.activeFileTabId && fileTabs.some((tab) => tab.id === state.activeFileTabId)
      ? state.activeFileTabId
      : (fileTabs.at(-1)?.id ?? null);
  const activeTabId =
    state.activeTabId && workspaceTabs.some((tab) => tab.id === state.activeTabId)
      ? state.activeTabId
      : (activeAgentTabId ?? activeFileTabId ?? workspaceTabs.at(-1)?.id ?? null);

  return {
    activeWorkspaceId,
    activeTabId,
    activeAgentTabId,
    activeShellTabId,
    activeFileTabId,
  };
}

/** Per-pty timeout handles for auto-clearing stale "working" status. */
const agentWorkingTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Per-pty timeout handles for cancel-detection (user pressed ESC / Ctrl+C). */
const agentCancelTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  workspaces: [],
  tasks: [],
  tabs: [],
  activeWorkspaceId: null,
  activeTabId: null,
  activeAgentTabId: null,
  activeShellTabId: null,
  activeFileTabId: null,
  workspaceActiveAgentTabIds: {},
  revealFileInTree: null,
  rightPanelMode: 'files',
  rightPanelOpen: true,
  sidebarOpen: true,
  terminalPanelOpen: false,
  settingsOpen: false,
  contextItems: [],
  composerText: '',
  settings: { ...DEFAULT_SETTINGS },
  lastBundle: null,
  toasts: [],
  hydrated: false,
  workspaceLoadingIds: new Set<string>(),
  focusedColumn: 'agent',
  branchStats: {},
  gitRefreshEpoch: 0,
  agentStatuses: {},
  exitedPtyIds: new Set<string>(),
  browserSelectMode: {},
  browserHistory: [],
  feedbackModalOpen: false,
  pendingFeedback: null,
  symbolPeek: null,
  handleAgentStatusUpdate: (ptyId, status) => {
    // Reset the working-timeout whenever we receive any hook event.
    // If status is "working", start a timeout that auto-clears to "idle"
    // only after the PTY process has exited (handles ESC cancel /
    // unexpected interruptions).  During LLM inference no hooks fire so
    // we must NOT clear the status while the process is alive — instead
    // we use a generous timeout and double-check exitedPtyIds before
    // clearing.
    const prev = agentWorkingTimers.get(ptyId);
    if (prev) clearTimeout(prev);

    // A new hook event arrived — agent is still active, cancel any
    // pending cancel-detection timer.
    const cancelTimer = agentCancelTimers.get(ptyId);
    if (cancelTimer) {
      clearTimeout(cancelTimer);
      agentCancelTimers.delete(ptyId);
    }

    if (status === 'working') {
      agentWorkingTimers.set(
        ptyId,
        setTimeout(() => {
          agentWorkingTimers.delete(ptyId);
          const s = get();
          // Only auto-clear if the PTY has actually exited.  If the
          // process is still alive the agent is likely inferring (waiting
          // for the LLM API), so we keep the "working" indicator.
          if (s.agentStatuses[ptyId] === 'working' && s.exitedPtyIds.has(ptyId)) {
            set((prev) => {
              const { [ptyId]: _, ...rest } = prev.agentStatuses;
              return { agentStatuses: rest };
            });
          }
        }, 10_000),
      );
    } else {
      agentWorkingTimers.delete(ptyId);
    }

    set((state) => {
      const patch: Partial<AppState> = {
        agentStatuses: { ...state.agentStatuses, [ptyId]: status },
      };

      // If the agent finished ("review") and its tab is currently active, mark idle
      if (status === 'review') {
        const activeTab = state.tabs.find((t) => t.id === state.activeAgentTabId);
        if (activeTab?.type === 'terminal' && activeTab.ptyId === ptyId) {
          patch.agentStatuses = { ...state.agentStatuses, [ptyId]: 'idle' };
        }
      }

      // Mark session as confirmed on first hook event — proves the agent CLI
      // actually used the session, so it's safe to persist & restore later.
      const agentTab = state.tabs.find((t) => t.type === 'terminal' && t.isAgent && t.ptyId === ptyId);
      if (agentTab?.type === 'terminal' && agentTab.sessionId && !agentTab.sessionConfirmed) {
        patch.tabs = (patch.tabs ?? state.tabs).map((t) =>
          t.id === agentTab.id && t.type === 'terminal' ? { ...t, sessionConfirmed: true } : t,
        );
      }

      return patch;
    });
  },
  clearAgentStatus: (ptyId) => {
    const t = agentWorkingTimers.get(ptyId);
    if (t) {
      clearTimeout(t);
      agentWorkingTimers.delete(ptyId);
    }
    const ct = agentCancelTimers.get(ptyId);
    if (ct) {
      clearTimeout(ct);
      agentCancelTimers.delete(ptyId);
    }
    set((state) => {
      if (!state.agentStatuses[ptyId]) return state;
      const { [ptyId]: _, ...rest } = state.agentStatuses;
      return { agentStatuses: rest };
    });
  },
  notifyAgentInput: (ptyId) => {
    // Called when the user types into an agent terminal (e.g. ESC / Ctrl+C).
    // If the agent is currently "working", start a short cancel-detection
    // timeout.  If no new hook event arrives within 3 s the agent was
    // likely interrupted, so we clear the working indicator.
    const status = get().agentStatuses[ptyId];
    if (status !== 'working') return;

    const prev = agentCancelTimers.get(ptyId);
    if (prev) clearTimeout(prev);

    agentCancelTimers.set(
      ptyId,
      setTimeout(() => {
        agentCancelTimers.delete(ptyId);
        if (get().agentStatuses[ptyId] === 'working') {
          set((s) => {
            const { [ptyId]: _, ...rest } = s.agentStatuses;
            return { agentStatuses: rest };
          });
        }
      }, 3_000),
    );
  },
  markPtyExited: (ptyId) => {
    const t = agentWorkingTimers.get(ptyId);
    if (t) {
      clearTimeout(t);
      agentWorkingTimers.delete(ptyId);
    }
    const ct = agentCancelTimers.get(ptyId);
    if (ct) {
      clearTimeout(ct);
      agentCancelTimers.delete(ptyId);
    }
    set((state) => {
      const exitedPtyIds = new Set(state.exitedPtyIds);
      exitedPtyIds.add(ptyId);
      // Clear agent status on process exit (fallback)
      const { [ptyId]: _, ...restStatuses } = state.agentStatuses;
      return { exitedPtyIds, agentStatuses: restStatuses };
    });
  },
  triggerGitRefresh: () => {
    set((state) => ({ gitRefreshEpoch: state.gitRefreshEpoch + 1 }));
    get().refreshBranchStats();
    // Also refresh branch names for all workspaces
    for (const w of get().workspaces) {
      get().refreshBranch(w.id);
    }
  },

  hydrate: (state) => {
    if (state?.schemaVersion !== undefined && state.schemaVersion !== 1) {
      set({ hydrated: true });
      return;
    }

    const rawSettings = {
      ...DEFAULT_SETTINGS,
      ...(state?.settings ?? {}),
      // Ensure new theme fields are always present (migration for old persisted state)
      themeId: (state?.settings as AppSettings | undefined)?.themeId ?? DEFAULT_SETTINGS.themeId,
      customThemes: (state?.settings as AppSettings | undefined)?.customThemes ?? [],
    };
    if (!rawSettings.agentPresets || rawSettings.agentPresets.length === 0) {
      rawSettings.agentPresets = [...DEFAULT_SETTINGS.agentPresets];
    } else {
      // Merge new fields (sessionTemplate, restoreTemplate) from built-in defaults
      // into persisted presets so upgrades take effect automatically.
      rawSettings.agentPresets = rawSettings.agentPresets.map((preset) => {
        const builtIn = DEFAULT_AGENT_PRESETS.find((d) => d.id === preset.id);
        if (!builtIn) return preset;
        return {
          ...preset,
          sessionTemplate: preset.sessionTemplate ?? builtIn.sessionTemplate,
          restoreTemplate: preset.restoreTemplate ?? builtIn.restoreTemplate,
        };
      });
    }
    const matchingDefaultPreset = rawSettings.agentPresets.find(
      (preset) =>
        preset.command === rawSettings.defaultAgentCommand ||
        preset.command.trim().split(/\s+/)[0] === rawSettings.defaultAgentCommand,
    );
    if (matchingDefaultPreset) {
      rawSettings.defaultAgentCommand = matchingDefaultPreset.command;
    }

    // Schema migration: safely merge notification settings with defaults
    rawSettings.notifications = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(rawSettings.notifications ?? {}),
      // Ensure customSounds is always an array
      customSounds: rawSettings.notifications?.customSounds ?? [],
    };

    const settings = rawSettings;
    const projects = state?.projects ?? [];
    const workspaces = state?.workspaces ?? [];
    const tasks = (state?.tasks ?? []).filter((task) => {
      const projectExists = projects.some((project) => project.id === task.projectId);
      const workspaceExists = !task.workspaceId || workspaces.some((workspace) => workspace.id === task.workspaceId);
      return projectExists && workspaceExists;
    });
    const activeWorkspaceId =
      state?.activeWorkspaceId && workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
        ? state.activeWorkspaceId
        : (workspaces[0]?.id ?? null);
    const tabs = (state?.tabs ?? [])
      .filter((tab) => workspaces.some((workspace) => workspace.id === tab.workspaceId))
      .map((tab) =>
        // Reset browser tab transient state on restore
        tab.type === 'browser' ? { ...tab, isLoading: false } : tab,
      );
    const contextItems = (state?.contextItems ?? []).filter((item) => {
      if (!workspaces.some((workspace) => workspace.id === item.workspaceId)) return false;
      if (item.type === 'task') return tasks.some((task) => task.id === item.taskId);
      return true;
    });
    // Restore per-workspace agent tab map, filtering out stale tab IDs
    const tabIdSet = new Set(tabs.map((tab) => tab.id));
    const workspaceActiveAgentTabIds: Record<string, string> = {};
    if (state?.workspaceActiveAgentTabIds) {
      for (const [wsId, tabId] of Object.entries(state.workspaceActiveAgentTabIds)) {
        if (tabIdSet.has(tabId)) {
          workspaceActiveAgentTabIds[wsId] = tabId;
        }
      }
    }

    set({
      projects,
      workspaces,
      tasks,
      tabs,
      activeWorkspaceId,
      activeTabId: tabs.some((tab) => tab.id === state?.activeTabId) ? (state?.activeTabId ?? null) : null,
      workspaceActiveAgentTabIds,
      rightPanelMode: state?.rightPanelMode ?? 'files',
      rightPanelOpen: state?.rightPanelOpen ?? true,
      sidebarOpen: state?.sidebarOpen ?? true,
      terminalPanelOpen: state?.terminalPanelOpen ?? false,
      contextItems,
      composerText: state?.composerText ?? '',
      settings,
      browserHistory: state?.browserHistory ?? [],
      hydrated: true,
    });

    get().restoreAgentSessions();
    get().refreshBranchStats();
    // Refresh branch names in case they changed since last session
    for (const w of get().workspaces) {
      get().refreshBranch(w.id);
    }
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

    const existingProject = get().projects.find((project) => project.repoPath === opened.repoPath);
    if (existingProject) {
      const workspace = get().workspaces.find((item) => item.projectId === existingProject.id && item.isRoot);
      get().setActiveWorkspace(workspace?.id ?? null);
      return;
    }

    const projectId = id();
    const workspaceId = id();

    set((state) => ({
      workspaceLoadingIds: new Set([...state.workspaceLoadingIds, workspaceId]),
    }));

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
    await get().refreshBranchStats(workspaceId);

    set((state) => {
      const next = new Set(state.workspaceLoadingIds);
      next.delete(workspaceId);
      return { workspaceLoadingIds: next };
    });
  },

  setActiveWorkspace: (workspaceId) => {
    const state = get();

    // Save the departing workspace's active agent tab before switching
    const updatedMap = { ...state.workspaceActiveAgentTabIds };
    if (state.activeWorkspaceId && state.activeAgentTabId) {
      updatedMap[state.activeWorkspaceId] = state.activeAgentTabId;
    }

    const derived = activeIdsAfterRemoval(
      {
        ...state,
        activeWorkspaceId: workspaceId,
        workspaceActiveAgentTabIds: updatedMap,
      },
      state.tabs,
      state.workspaces,
    );
    set({ ...derived, workspaceActiveAgentTabIds: updatedMap });
    if (workspaceId) {
      void get().refreshBranchStats(workspaceId);
      void get().refreshBranch(workspaceId);
    }
  },

  createTerminal: async (workspaceId, initialCommand) => {
    const workspace = findWorkspace(get(), workspaceId);
    if (!workspace) return null;
    try {
      const ptyId = await window.forgepad.pty.create(
        workspace.worktreePath,
        get().settings.defaultShell || undefined,
        initialCommand || undefined,
        { FORGEPAD_WORKSPACE_ID: workspace.id },
      );
      const terminalCount = get().tabs.filter((tab) => tab.workspaceId === workspace.id && tab.type === 'terminal').length;
      const defaultTitle = terminalCount === 0 ? 'Terminal' : `Terminal ${terminalCount + 1}`;
      const tab: Tab = {
        id: id(),
        workspaceId: workspace.id,
        type: 'terminal',
        title: initialCommand ? `Run: ${initialCommand.split('&&')[0].trim()}` : defaultTitle,
        ptyId,
      };
      get().addTab(tab);
      set({ terminalPanelOpen: true });
      return ptyId;
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Failed to create terminal.');
      return null;
    }
  },

  createAgentTerminal: async (workspaceId, commandOverride, presetId) => {
    const workspace = findWorkspace(get(), workspaceId);
    if (!workspace) return null;
    const command = commandOverride?.trim() || get().settings.defaultAgentCommand.trim();
    if (!command) {
      get().addToast('error', 'Default agent command is empty.');
      return null;
    }

    // Resolve preset: explicit presetId or match by command's first token
    const presets = get().settings.agentPresets;
    const commandToken = command.split(/\s+/)[0];
    const resolvedPreset = presetId
      ? presets.find((p) => p.id === presetId)
      : presets.find((p) => p.command.trim().split(/\s+/)[0] === commandToken);

    // If the preset defines a sessionTemplate (e.g. Claude's "--session-id {sessionId}"),
    // pre-assign a UUID so the CLI creates a session we can resume later.
    // For CLIs without sessionTemplate, session ID is detected from output.
    const sessionId = resolvedPreset?.sessionTemplate && resolvedPreset?.restoreTemplate ? crypto.randomUUID() : undefined;
    const finalCommand =
      sessionId && resolvedPreset?.sessionTemplate
        ? `${command} ${resolvedPreset.sessionTemplate.replace('{sessionId}', sessionId)}`
        : command;

    try {
      const ptyId = await window.forgepad.pty.create(
        workspace.worktreePath,
        get().settings.defaultShell || undefined,
        finalCommand,
        {
          FORGEPAD_WORKSPACE_ID: workspace.id,
          FORGEPAD_AGENT: '1',
          ...(sessionId ? { FORGEPAD_SESSION_ID: sessionId } : {}),
        },
      );
      const agentCount = get().tabs.filter(
        (tab) => tab.workspaceId === workspace.id && tab.type === 'terminal' && (tab.isAgent || tab.title.startsWith('Agent')),
      ).length;
      const agentLabel = agentLabelForCommand(command, presets);
      const tab: Tab = {
        id: id(),
        workspaceId: workspace.id,
        type: 'terminal',
        title: agentCount === 0 ? agentLabel : `${agentLabel} ${agentCount + 1}`,
        ptyId,
        isAgent: true,
        agentPresetId: resolvedPreset?.id ?? presetId,
        agentCommand: command,
        sessionId,
      };
      get().addTab(tab);
      set((state) => ({
        terminalPanelOpen: true,
        agentStatuses: { ...state.agentStatuses, [ptyId]: 'idle' },
      }));
      return ptyId;
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Failed to create agent terminal.');
      return null;
    }
  },

  addTab: (tab) =>
    set((state) => {
      const patch: Partial<AppState> = {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      };
      if (tab.type === 'terminal' && tab.isAgent) {
        patch.activeAgentTabId = tab.id;
        // Remember per-workspace agent tab selection
        patch.workspaceActiveAgentTabIds = {
          ...state.workspaceActiveAgentTabIds,
          [tab.workspaceId]: tab.id,
        };
      } else if (tab.type === 'terminal') {
        patch.activeShellTabId = tab.id;
      } else {
        patch.activeFileTabId = tab.id;
      }
      return patch;
    }),

  closeTab: (tabId) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (tab?.type === 'terminal') window.forgepad.pty.destroy(tab.ptyId);
    set((state) => {
      const tabs = state.tabs.filter((item) => item.id !== tabId);
      const wsTabs = tabs.filter((item) => item.workspaceId === state.activeWorkspaceId);
      const patch: Partial<AppState> = { tabs };
      if (state.activeTabId === tabId) {
        patch.activeTabId = wsTabs.at(-1)?.id ?? null;
      }
      if (tab?.type === 'terminal' && tab.isAgent && state.activeAgentTabId === tabId) {
        const remaining = wsTabs.filter((t) => t.type === 'terminal' && t.isAgent);
        patch.activeAgentTabId = remaining.at(-1)?.id ?? null;
      }
      if (tab?.type === 'terminal' && !tab.isAgent && state.activeShellTabId === tabId) {
        const remaining = wsTabs.filter((t) => t.type === 'terminal' && !t.isAgent);
        patch.activeShellTabId = remaining.at(-1)?.id ?? null;
      }
      if (tab && tab.type !== 'terminal' && state.activeFileTabId === tabId) {
        const remaining = wsTabs.filter((t) => t.type !== 'terminal');
        patch.activeFileTabId = remaining.at(-1)?.id ?? null;
      }
      // Clean up PTY-related state for closed terminal tabs
      if (tab?.type === 'terminal') {
        const nextExited = new Set(state.exitedPtyIds);
        nextExited.delete(tab.ptyId);
        patch.exitedPtyIds = nextExited;
        const { [tab.ptyId]: _, ...restStatuses } = state.agentStatuses;
        patch.agentStatuses = restStatuses;
      }
      return patch;
    });
  },

  setActiveTab: (tabId) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      const patch: Partial<AppState> = { activeTabId: tabId };
      if (tab?.type === 'terminal' && tab.isAgent) {
        patch.activeAgentTabId = tabId;
        // Remember per-workspace agent tab selection
        patch.workspaceActiveAgentTabIds = {
          ...state.workspaceActiveAgentTabIds,
          [tab.workspaceId]: tabId!,
        };
        // Clear "review" or "permission" when user views the agent tab
        const agentStatus = state.agentStatuses[tab.ptyId];
        if (agentStatus === 'review' || agentStatus === 'permission') {
          patch.agentStatuses = { ...state.agentStatuses, [tab.ptyId]: 'idle' };
        }
      } else if (tab?.type === 'terminal') {
        patch.activeShellTabId = tabId;
      } else {
        patch.activeFileTabId = tabId;
        // Signal file tree to reveal the file when it's a file tab
        if (tab?.type === 'file') {
          patch.revealFileInTree = {
            relPath: tab.relPath,
            epoch: (state.revealFileInTree?.epoch ?? 0) + 1,
          };
        }
      }
      return patch;
    }),

  closeOtherTabs: (tabId) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const toClose = state.tabs.filter((t) => t.workspaceId === tab.workspaceId && t.id !== tabId && t.type === tab.type);
    for (const t of toClose) {
      if (t.type === 'terminal') window.forgepad.pty.destroy(t.ptyId);
    }
    set((s) => {
      const closeIds = new Set(toClose.map((t) => t.id));
      const tabs = s.tabs.filter((t) => !closeIds.has(t.id));
      const patch: Partial<AppState> = { tabs };
      if (tab.type === 'terminal' && tab.isAgent) {
        patch.activeAgentTabId = tabId;
      } else if (tab.type === 'terminal') {
        patch.activeShellTabId = tabId;
      } else {
        patch.activeFileTabId = tabId;
      }
      patch.activeTabId = tabId;
      return patch;
    });
  },

  closeAllTabs: (workspaceId, type) => {
    const state = get();
    const toClose = state.tabs.filter((t) => t.workspaceId === workspaceId && t.type === type);
    for (const t of toClose) {
      if (t.type === 'terminal') window.forgepad.pty.destroy(t.ptyId);
    }
    set((s) => {
      const closeIds = new Set(toClose.map((t) => t.id));
      const tabs = s.tabs.filter((t) => !closeIds.has(t.id));
      const patch: Partial<AppState> = { tabs };
      if (type === 'terminal') {
        const remainingAgents = tabs.filter((t) => t.workspaceId === workspaceId && t.type === 'terminal' && t.isAgent);
        const remainingShells = tabs.filter((t) => t.workspaceId === workspaceId && t.type === 'terminal' && !t.isAgent);
        patch.activeAgentTabId = remainingAgents.at(-1)?.id ?? null;
        patch.activeShellTabId = remainingShells.at(-1)?.id ?? null;
      } else {
        const remaining = tabs.filter((t) => t.workspaceId === workspaceId && t.type !== 'terminal');
        patch.activeFileTabId = remaining.at(-1)?.id ?? null;
      }
      const wsTabs = tabs.filter((t) => t.workspaceId === workspaceId);
      patch.activeTabId = wsTabs.at(-1)?.id ?? null;
      return patch;
    });
  },

  closeTabsToRight: (tabId) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const wsTabs = state.tabs.filter((t) => t.workspaceId === tab.workspaceId);
    const idx = wsTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const toClose = wsTabs.slice(idx + 1).filter((t) => t.type === tab.type);
    for (const t of toClose) {
      if (t.type === 'terminal') window.forgepad.pty.destroy(t.ptyId);
    }
    set((s) => {
      const closeIds = new Set(toClose.map((t) => t.id));
      const tabs = s.tabs.filter((t) => !closeIds.has(t.id));
      const patch: Partial<AppState> = { tabs };
      const wasActiveClosed = closeIds.has(s.activeTabId ?? '');
      if (wasActiveClosed) {
        patch.activeTabId = tabId;
        if (tab.type === 'terminal' && tab.isAgent) {
          patch.activeAgentTabId = tabId;
        } else if (tab.type === 'terminal') {
          patch.activeShellTabId = tabId;
        } else {
          patch.activeFileTabId = tabId;
        }
      }
      return patch;
    });
  },

  openFileTab: (workspaceId, relPath, lineNumber?) => {
    const existing = get().tabs.find((tab) => tab.workspaceId === workspaceId && tab.type === 'file' && tab.relPath === relPath);
    if (existing) {
      if (lineNumber) {
        set({ tabs: get().tabs.map((t) => (t.id === existing.id && t.type === 'file' ? { ...t, targetLine: lineNumber } : t)) });
      }
      get().setActiveTab(existing.id);
      return;
    }
    get().addTab({ id: id(), workspaceId, type: 'file', relPath, targetLine: lineNumber });
  },

  openExternalFileTab: (workspaceId, absPath) => {
    const existing = get().tabs.find(
      (tab) => tab.workspaceId === workspaceId && tab.type === 'file' && tab.absPath === absPath,
    );
    if (existing) {
      get().setActiveTab(existing.id);
      return;
    }
    const fileName = absPath.split('/').pop() ?? absPath;
    get().addTab({ id: id(), workspaceId, type: 'file', relPath: fileName, absPath });
  },

  openDiffTab: (workspaceId, activePath) => {
    const existing = get().tabs.find((tab) => tab.workspaceId === workspaceId && tab.type === 'diff');
    if (existing) {
      set({
        tabs: get().tabs.map((tab) => (tab.id === existing.id && tab.type === 'diff' ? { ...tab, activePath } : tab)),
      });
      get().setActiveTab(existing.id);
      return;
    }
    get().addTab({ id: id(), workspaceId, type: 'diff', activePath });
  },

  openContextPreviewTab: (workspaceId) => {
    const workspace = findWorkspace(get(), workspaceId);
    if (!workspace) return;

    const existing = get().tabs.find((tab) => tab.workspaceId === workspace.id && tab.type === 'context-preview');
    if (existing) {
      get().setActiveTab(existing.id);
      return;
    }

    get().addTab({
      id: id(),
      workspaceId: workspace.id,
      type: 'context-preview',
    });
  },

  setRightPanelMode: (mode) => set({ rightPanelMode: mode, rightPanelOpen: true }),

  setTerminalPanelOpen: (open) => set({ terminalPanelOpen: open }),

  toggleTerminalPanel: async () => {
    const state = get();
    const hasShell = state.tabs.some(
      (tab) => tab.workspaceId === state.activeWorkspaceId && tab.type === 'terminal' && !tab.isAgent,
    );
    if (state.terminalPanelOpen && hasShell) {
      set({ terminalPanelOpen: false });
      return;
    }
    set({ terminalPanelOpen: true });
    if (!hasShell) {
      await get().createTerminal(state.activeWorkspaceId ?? undefined);
    }
  },

  toggleContextFile: (workspaceId, relPath) => {
    const key = `${workspaceId}:file:${relPath}`;
    set((state) => {
      const exists = state.contextItems.some((item) => contextKey(item) === key);
      if (exists)
        return {
          contextItems: state.contextItems.filter((item) => contextKey(item) !== key),
        };
      const next: ContextFileItem = {
        id: id(),
        type: 'file',
        workspaceId,
        relPath,
        includeContent: true,
        addedAt: now(),
      };
      return {
        contextItems: [...state.contextItems, next],
        rightPanelMode: 'context',
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
          type: 'file',
          workspaceId,
          relPath,
          includeContent: true,
          addedAt: now(),
        });
      }
      return {
        contextItems: [...state.contextItems, ...additions],
        rightPanelMode: 'context',
      };
    });
  },

  addContextDiff: (workspaceId, relPath, bucket, status) => {
    set((state) => {
      const key = `${workspaceId}:diff:${bucket}:${relPath}`;
      if (state.contextItems.some((item) => contextKey(item) === key)) return state;
      const next: ContextDiffItem = {
        id: id(),
        type: 'diff',
        workspaceId,
        relPath,
        bucket,
        status,
        addedAt: now(),
      };
      return {
        contextItems: [...state.contextItems, next],
        rightPanelMode: 'context',
      };
    });
  },

  removeContextItem: (itemId) =>
    set((state) => ({
      contextItems: state.contextItems.filter((item) => item.id !== itemId),
    })),

  clearWorkspaceContext: (workspaceId) =>
    set((state) => ({
      contextItems: state.contextItems.filter((item) => item.workspaceId !== workspaceId),
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
      status: 'ready',
      createdAt: now(),
      updatedAt: now(),
    };

    set((state) => ({ tasks: [...state.tasks, task] }));
    return task.id;
  },

  updateTaskStatus: (taskId, status) =>
    set((state) => {
      const tasks = state.tasks.map((task) => (task.id === taskId ? { ...task, status, updatedAt: now() } : task));
      const updatedTask = tasks.find((task) => task.id === taskId);

      return {
        tasks,
        contextItems: state.contextItems.map((item) =>
          item.type === 'task' && item.taskId === taskId && updatedTask
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
        workspace.taskId === taskId ? { ...workspace, taskId: undefined } : workspace,
      ),
      contextItems: state.contextItems.filter((item) => item.type !== 'task' || item.taskId !== taskId),
    })),

  addTaskToContext: (taskId) => {
    const state = get();
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const workspace =
      (task.workspaceId ? state.workspaces.find((item) => item.id === task.workspaceId) : undefined) ??
      state.workspaces.find((item) => item.id === state.activeWorkspaceId && item.projectId === task.projectId) ??
      state.workspaces.find((item) => item.projectId === task.projectId);

    if (!workspace) return;

    const next: ContextTaskItem = {
      id: id(),
      type: 'task',
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
        return { rightPanelMode: 'context', rightPanelOpen: true };
      }
      return {
        contextItems: [...current.contextItems, next],
        rightPanelMode: 'context',
        rightPanelOpen: true,
      };
    });
  },

  addDiffComment: (workspaceId, relPath, bucket, range, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next: DiffCommentItem = {
      id: id(),
      type: 'comment',
      workspaceId,
      relPath,
      bucket,
      side: range.side ?? 'additions',
      endSide: range.endSide,
      startLine: range.start,
      endLine: range.end,
      text: trimmed,
      addedAt: now(),
    };
    set((state) => ({
      contextItems: [...state.contextItems, next],
      rightPanelMode: 'context',
    }));
  },

  addCodeSelection: (workspaceId, relPath, range, text) => {
    const trimmed = text.trim();
    const selectedText = range.selectedText.trim();
    if (!trimmed || !selectedText) return;
    const startLine = Math.min(range.start, range.end);
    const endLine = Math.max(range.start, range.end);
    const next: CodeSelectionItem = {
      id: id(),
      type: 'selection',
      workspaceId,
      relPath,
      startLine,
      endLine,
      selectedText,
      text: trimmed,
      addedAt: now(),
    };
    set((state) => ({
      contextItems: [...state.contextItems, next],
      rightPanelMode: 'context',
      rightPanelOpen: true,
    }));
  },

  updateFileNote: (itemId, note) =>
    set((state) => ({
      contextItems: state.contextItems.map((item) =>
        item.id === itemId && (item.type === 'file' || item.type === 'diff' || item.type === 'task') ? { ...item, note } : item,
      ),
    })),

  updateFileIncludeContent: (itemId, includeContent) =>
    set((state) => ({
      contextItems: state.contextItems.map((item) =>
        item.id === itemId && item.type === 'file' ? { ...item, includeContent } : item,
      ),
    })),

  sendContextToTerminal: async () => {
    const state = get();
    const workspace = findWorkspace(state);
    if (!workspace) return;
    const items = state.contextItems.filter((item) => item.workspaceId === workspace.id);
    const files = items
      .filter((item): item is ContextFileItem => item.type === 'file')
      .map((item) => ({
        relPath: item.relPath,
        note: item.note,
        includeContent: item.includeContent,
      }));
    const diffs = items
      .filter((item): item is ContextDiffItem => item.type === 'diff')
      .map((item) => ({
        relPath: item.relPath,
        bucket: item.bucket,
        status: item.status,
        note: item.note,
      }));
    const tasks = items
      .filter((item): item is ContextTaskItem => item.type === 'task')
      .map((item) => ({
        title: item.title,
        description: item.description,
        status: item.status,
        note: item.note,
      }));
    const comments = items
      .filter((item): item is DiffCommentItem => item.type === 'comment')
      .map(({ id: _id, type: _type, workspaceId: _workspaceId, addedAt: _addedAt, ...comment }) => comment);
    const selections = items
      .filter((item): item is CodeSelectionItem => item.type === 'selection')
      .map(({ id: _id, type: _type, workspaceId: _workspaceId, addedAt: _addedAt, ...selection }) => selection);

    const bundle = await window.forgepad.context.createBundle({
      workspacePath: workspace.worktreePath,
      workspaceName: workspace.name,
      branch: workspace.branch,
      prompt: state.composerText,
      tasks,
      files,
      diffs,
      comments,
      selections,
    });

    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    let terminalTab =
      activeTab?.type === 'terminal'
        ? activeTab
        : (state.tabs.find(
            (tab) =>
              tab.workspaceId === workspace.id && tab.type === 'terminal' && (tab.isAgent || tab.title.startsWith('Agent')),
          ) ?? state.tabs.find((tab) => tab.workspaceId === workspace.id && tab.type === 'terminal'));

    if (!terminalTab) {
      const ptyId = await get().createAgentTerminal(workspace.id);
      terminalTab = get().tabs.find((tab) => tab.type === 'terminal' && tab.ptyId === ptyId);
    }
    if (!terminalTab || terminalTab.type !== 'terminal') return;

    const prompt = `Please read ${bundle.relPath} and complete the task described there.`;
    window.forgepad.pty.write(terminalTab.ptyId, `\x1b[200~${prompt}\x1b[201~\r`);
    set((current) => ({
      lastBundle: bundle,
      activeTabId: terminalTab.id,
      composerText: '',
      contextItems: current.settings.sendAndClearComments
        ? current.contextItems.filter(
            (item) => item.workspaceId !== workspace.id || (item.type !== 'comment' && item.type !== 'selection'),
          )
        : current.contextItems,
    }));
    get().addToast('success', `Sent context: ${bundle.relPath}`);
  },

  addCustomTheme: (theme) =>
    set((state) => ({
      settings: {
        ...state.settings,
        customThemes: [...(state.settings.customThemes ?? []).filter((t) => t.id !== theme.id), theme],
        themeId: theme.id,
      },
    })),

  removeCustomTheme: (themeId) =>
    set((state) => {
      const customThemes = (state.settings.customThemes ?? []).filter((t) => t.id !== themeId);
      const nextThemeId = state.settings.themeId === themeId ? 'dark' : state.settings.themeId;
      return {
        settings: {
          ...state.settings,
          customThemes,
          themeId: nextThemeId,
        },
      };
    }),

  renameCustomTheme: (themeId, name) =>
    set((state) => ({
      settings: {
        ...state.settings,
        customThemes: (state.settings.customThemes ?? []).map((t) => (t.id === themeId ? { ...t, name } : t)),
      },
    })),

  updateSettings: (partial) => set((state) => ({ settings: { ...state.settings, ...partial } })),

  updateShortcut: (actionId, combo) =>
    set((state) => ({
      settings: {
        ...state.settings,
        keyboardShortcuts: {
          ...(state.settings.keyboardShortcuts ?? {}),
          [actionId]: combo,
        },
      },
    })),

  resetShortcut: (actionId) =>
    set((state) => {
      const current = { ...(state.settings.keyboardShortcuts ?? {}) };
      delete current[actionId as keyof typeof current];
      return {
        settings: {
          ...state.settings,
          keyboardShortcuts: Object.keys(current).length > 0 ? current : undefined,
        },
      };
    }),

  resetAllShortcuts: () =>
    set((state) => ({
      settings: {
        ...state.settings,
        keyboardShortcuts: undefined,
      },
    })),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

  refreshBranch: async (workspaceId) => {
    const workspace = get().workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    set((state) => ({
      workspaceLoadingIds: new Set([...state.workspaceLoadingIds, workspaceId]),
    }));
    const branch = await window.forgepad.git.getCurrentBranch(workspace.worktreePath);
    set((state) => {
      const next = new Set(state.workspaceLoadingIds);
      next.delete(workspaceId);
      return {
        workspaces: state.workspaces.map((item) => (item.id === workspaceId ? { ...item, branch } : item)),
        workspaceLoadingIds: next,
      };
    });
  },

  addAgentPreset: (preset) =>
    set((state) => ({
      settings: {
        ...state.settings,
        agentPresets: [...state.settings.agentPresets, preset],
      },
    })),

  removeAgentPreset: (presetId) =>
    set((state) => ({
      settings: {
        ...state.settings,
        agentPresets: state.settings.agentPresets.filter((p) => p.id !== presetId),
      },
    })),

  updateAgentPreset: (presetId, partial) =>
    set((state) => ({
      settings: {
        ...state.settings,
        agentPresets: state.settings.agentPresets.map((p) => (p.id === presetId ? { ...p, ...partial } : p)),
      },
    })),

  updateTerminalSessionId: (tabId, sessionId) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId && tab.type === 'terminal' ? { ...tab, sessionId, sessionConfirmed: true } : tab,
      ),
    })),

  renameTab: (tabIdOrPtyId, title) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.type === 'terminal' && (tab.id === tabIdOrPtyId || tab.ptyId === tabIdOrPtyId) ? { ...tab, title } : tab,
      ),
    })),

  restoreAgentSessions: async () => {
    const state = get();
    const agentTabs = state.tabs.filter(
      (tab): tab is Extract<Tab, { type: 'terminal' }> => tab.type === 'terminal' && tab.isAgent === true && !!tab.sessionId,
    );
    if (agentTabs.length === 0) return;

    for (const tab of agentTabs) {
      const workspace = state.workspaces.find((w) => w.id === tab.workspaceId);
      if (!workspace) continue;

      const preset = state.settings.agentPresets.find((p) => p.id === tab.agentPresetId);
      const restoreTemplate = preset?.restoreTemplate;
      if (!restoreTemplate || !tab.sessionId) continue;

      const command = restoreTemplate.replace('{sessionId}', tab.sessionId);

      try {
        const ptyId = await window.forgepad.pty.create(
          workspace.worktreePath,
          state.settings.defaultShell || undefined,
          command,
          {
            FORGEPAD_WORKSPACE_ID: workspace.id,
            FORGEPAD_AGENT: '1',
            FORGEPAD_SESSION_ID: tab.sessionId,
          },
        );
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, ptyId } : t)),
        }));
      } catch {
        get().addToast('error', `Failed to restore ${tab.title}`);
      }
    }
  },

  setFocusedColumn: (column) => set({ focusedColumn: column }),

  reorderProjects: (activeId, overId) =>
    set((state) => {
      const oldIdx = state.projects.findIndex((p) => p.id === activeId);
      const newIdx = state.projects.findIndex((p) => p.id === overId);
      if (oldIdx === -1 || newIdx === -1) return state;
      return { projects: arrayMove(state.projects, oldIdx, newIdx) };
    }),

  reorderWorkspaces: (projectId, activeId, overId) =>
    set((state) => {
      const projectWorkspaces = state.workspaces.filter((w) => w.projectId === projectId);
      const oldIdx = projectWorkspaces.findIndex((w) => w.id === activeId);
      const newIdx = projectWorkspaces.findIndex((w) => w.id === overId);
      if (oldIdx === -1 || newIdx === -1) return state;
      const reordered = arrayMove(projectWorkspaces, oldIdx, newIdx);
      let nextProjectIndex = 0;
      return {
        workspaces: state.workspaces.map((w) => (w.projectId === projectId ? reordered[nextProjectIndex++] : w)),
      };
    }),

  reorderTabs: (activeId, overId) =>
    set((state) => {
      const oldIdx = state.tabs.findIndex((t) => t.id === activeId);
      const newIdx = state.tabs.findIndex((t) => t.id === overId);
      if (oldIdx === -1 || newIdx === -1) return state;
      return { tabs: arrayMove(state.tabs, oldIdx, newIdx) };
    }),

  removeProject: (projectId) =>
    set((state) => {
      const removedWorkspaceIds = new Set(
        state.workspaces.filter((workspace) => workspace.projectId === projectId).map((workspace) => workspace.id),
      );
      if (removedWorkspaceIds.size === 0) return state;

      const removedTabs = state.tabs.filter((tab) => removedWorkspaceIds.has(tab.workspaceId));
      closeTerminalTabs(removedTabs);

      // Collect ptyIds from removed tabs for cleanup
      const removedPtyIds = new Set(removedTabs.filter((t) => t.type === 'terminal').map((t) => t.ptyId));

      const workspaces = state.workspaces.filter((workspace) => !removedWorkspaceIds.has(workspace.id));
      const tabs = state.tabs.filter((tab) => !removedWorkspaceIds.has(tab.workspaceId));

      // Clean exitedPtyIds
      const nextExited = new Set(state.exitedPtyIds);
      for (const id of removedPtyIds) nextExited.delete(id);

      // Clean agentStatuses
      const nextAgentStatuses = { ...state.agentStatuses };
      for (const id of removedPtyIds) delete nextAgentStatuses[id];

      // Clean workspaceActiveAgentTabIds
      const nextWsAgentTabs = { ...state.workspaceActiveAgentTabIds };
      for (const id of removedWorkspaceIds) delete nextWsAgentTabs[id];

      return {
        projects: state.projects.filter((project) => project.id !== projectId),
        workspaces,
        tabs,
        tasks: state.tasks.filter((task) => task.projectId !== projectId),
        contextItems: state.contextItems.filter((item) => !removedWorkspaceIds.has(item.workspaceId)),
        branchStats: omitBranchStats(state.branchStats, removedWorkspaceIds),
        exitedPtyIds: nextExited,
        agentStatuses: nextAgentStatuses,
        workspaceActiveAgentTabIds: nextWsAgentTabs,
        ...activeIdsAfterRemoval(state, tabs, workspaces),
      };
    }),

  removeWorkspace: (workspaceId) =>
    set((state) => {
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      if (!workspace) return state;

      const removedWorkspaceIds = new Set([workspaceId]);
      const removedTabs = state.tabs.filter((tab) => tab.workspaceId === workspaceId);
      closeTerminalTabs(removedTabs);

      // Collect ptyIds from removed tabs for cleanup
      const removedPtyIds = new Set(removedTabs.filter((t) => t.type === 'terminal').map((t) => t.ptyId));

      const workspaces = state.workspaces.filter((item) => item.id !== workspaceId);
      const projects = state.projects.filter(
        (project) => project.id !== workspace.projectId || workspaces.some((item) => item.projectId === project.id),
      );
      const projectIds = new Set(projects.map((project) => project.id));
      const tabs = state.tabs.filter((tab) => tab.workspaceId !== workspaceId);

      // Clean exitedPtyIds
      const nextExited = new Set(state.exitedPtyIds);
      for (const id of removedPtyIds) nextExited.delete(id);

      // Clean agentStatuses
      const nextAgentStatuses = { ...state.agentStatuses };
      for (const id of removedPtyIds) delete nextAgentStatuses[id];

      // Clean workspaceActiveAgentTabIds
      const { [workspaceId]: _, ...nextWsAgentTabs } = state.workspaceActiveAgentTabIds;

      return {
        projects,
        workspaces,
        tabs,
        tasks: state.tasks
          .filter((task) => projectIds.has(task.projectId))
          .map((task) => (task.workspaceId === workspaceId ? { ...task, workspaceId: undefined, updatedAt: now() } : task)),
        contextItems: state.contextItems.filter((item) => item.workspaceId !== workspaceId),
        branchStats: omitBranchStats(state.branchStats, removedWorkspaceIds),
        exitedPtyIds: nextExited,
        agentStatuses: nextAgentStatuses,
        workspaceActiveAgentTabIds: nextWsAgentTabs,
        ...activeIdsAfterRemoval(state, tabs, workspaces),
      };
    }),

  deleteWorktree: async (workspaceId) => {
    const state = get();
    const workspace = state.workspaces.find((w) => w.id === workspaceId);
    if (!workspace || workspace.isRoot) return;
    const project = state.projects.find((p) => p.id === workspace.projectId);
    if (!project) return;

    try {
      await window.forgepad.git.removeWorktree(
        project.repoPath,
        workspace.worktreePath,
        workspace.branch,
        state.settings.worktreeAutoDeleteBranch,
      );
    } catch (error) {
      get().addToast('error', `Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    get().removeWorkspace(workspaceId);
  },

  createWorktree: async (projectId, branch, trackRemote) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;

    const workspaceId = id();

    set((state) => ({
      workspaceLoadingIds: new Set([...state.workspaceLoadingIds, workspaceId]),
    }));

    try {
      const settings = get().settings;
      const result = await window.forgepad.git.addWorktree(
        project.repoPath,
        branch,
        trackRemote,
        settings.worktreeBaseDir || undefined,
      );

      const workspace: Workspace = {
        id: workspaceId,
        projectId,
        name: branch,
        branch: result.branch,
        worktreePath: result.worktreePath,
        isRoot: false,
        createdAt: now(),
      };

      set((state) => ({
        workspaces: [...state.workspaces, workspace],
        activeWorkspaceId: workspaceId,
        activeTabId: null,
      }));

      await get().createTerminal(workspaceId);
      await get().refreshBranchStats(workspaceId);
    } catch (error) {
      get().addToast('error', `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      set((state) => {
        const next = new Set(state.workspaceLoadingIds);
        next.delete(workspaceId);
        return { workspaceLoadingIds: next };
      });
    }
  },

  refreshBranchStats: async (workspaceId) => {
    const state = get();
    const targets = workspaceId ? state.workspaces.filter((w) => w.id === workspaceId) : state.workspaces;
    const updates: Record<string, { ahead: number; behind: number; additions: number; deletions: number; prNumber?: number | null; prUrl?: string | null }> = {};
    await Promise.all(
      targets.map(async (w) => {
        try {
          const [stats, prInfo] = await Promise.all([
            window.forgepad.git.getBranchStats(w.worktreePath),
            window.forgepad.git.getPrInfo(w.worktreePath).catch(() => null),
          ]);
          updates[w.id] = {
            ...stats,
            prNumber: prInfo?.number ?? null,
            prUrl: prInfo?.url ?? null,
          };
        } catch {
          updates[w.id] = { ahead: 0, behind: 0, additions: 0, deletions: 0 };
        }
      }),
    );
    set((s) => ({ branchStats: { ...s.branchStats, ...updates } }));
  },

  // ── Browser tab actions ──────────────────────────────────────────────────

  createBrowserTab: (url) => {
    const state = get();
    const workspaceId = state.activeWorkspaceId;
    if (!workspaceId) return;
    const tab: Tab = {
      id: id(),
      workspaceId,
      type: 'browser',
      url: url || 'about:blank',
      title: 'Browser',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    };
    get().addTab(tab);
  },

  addBrowserHistoryEntry: (url, title, favicon = '') => {
    if (!url || url === 'about:blank') return;
    set((state) => {
      const existing = state.browserHistory.findIndex((h) => h.url === url);
      // Preserve existing favicon if no new one is provided
      const prevFavicon = existing !== -1 ? state.browserHistory[existing].favicon : '';
      const entry = { url, title: title || url, favicon: favicon || prevFavicon, visitedAt: Date.now() };
      let next: import('@shared/types').BrowserHistoryEntry[];
      if (existing !== -1) {
        // Move to front with updated title/visitedAt
        next = [entry, ...state.browserHistory.filter((_, i) => i !== existing)];
      } else {
        next = [entry, ...state.browserHistory];
        if (next.length > 500) next = next.slice(0, 500);
      }
      return { browserHistory: next };
    });
  },

  clearBrowserHistory: () => {
    set({ browserHistory: [] });
  },

  updateBrowserNavState: (navState) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === navState.tabId && tab.type === 'browser'
          ? {
              ...tab,
              url: navState.url,
              title: navState.title || navState.url,
              isLoading: navState.isLoading,
              canGoBack: navState.canGoBack,
              canGoForward: navState.canGoForward,
            }
          : tab,
      ),
    }));
    // Record history when navigation completes (not mid-load)
  },

  setBrowserSelectMode: (tabId, active) => {
    set((state) => ({
      browserSelectMode: { ...state.browserSelectMode, [tabId]: active },
    }));
  },

  openFeedbackModal: (tabId, element) => {
    set({
      pendingFeedback: { tabId, element },
      feedbackModalOpen: true,
      browserSelectMode: (() => {
        const current = get().browserSelectMode;
        return { ...current, [tabId]: false };
      })(),
    });
  },

  closeFeedbackModal: () => {
    set({ feedbackModalOpen: false, pendingFeedback: null });
  },

  submitBrowserFeedback: (comment) => {
    const state = get();
    const { pendingFeedback } = state;
    if (!pendingFeedback || !comment.trim()) return;

    const { element } = pendingFeedback;

    // Find the active agent tab's ptyId.
    // First try the explicitly-active agent tab, then fall back to any agent
    // tab in the current workspace (the user may have focus in the browser tab
    // so activeAgentTabId might be stale or null).
    const activeAgentTab =
      state.tabs.find((tab) => tab.id === state.activeAgentTabId && tab.type === 'terminal' && tab.isAgent) ??
      state.tabs.find((tab) => tab.workspaceId === state.activeWorkspaceId && tab.type === 'terminal' && tab.isAgent);

    if (activeAgentTab?.type === 'terminal') {
      const prompt = [
        `[Browser Feedback] ${element.pageUrl}`,
        '',
        `Element: ${element.tagName} | Selector: \`${element.selector}\``,
        '```html',
        element.outerHTML,
        '```',
        '',
        `Feedback: ${comment.trim()}`,
        '',
      ].join('\n');

      window.forgepad.pty.write(activeAgentTab.ptyId, prompt);
    } else {
      get().addToast('error', 'No active agent terminal. Please open an agent tab first.');
    }

    get().closeFeedbackModal();
  },

  openSymbolPeek: (peek) => {
    set({ symbolPeek: peek });
  },

  closeSymbolPeek: () => {
    set({ symbolPeek: null });
  },

  clearTabTargetLine: (tabId) => {
    set({ tabs: get().tabs.map((t) => (t.id === tabId && t.type === 'file' ? { ...t, targetLine: undefined } : t)) });
  },

  updateNotificationSettings: (partial) =>
    set((state) => ({
      settings: {
        ...state.settings,
        notifications: { ...state.settings.notifications, ...partial },
      },
    })),

  addCustomSound: (sound) =>
    set((state) => ({
      settings: {
        ...state.settings,
        notifications: {
          ...state.settings.notifications,
          customSounds: [...state.settings.notifications.customSounds, sound],
        },
      },
    })),

  removeCustomSound: (soundId) =>
    set((state) => ({
      settings: {
        ...state.settings,
        notifications: {
          ...state.settings.notifications,
          customSounds: state.settings.notifications.customSounds.filter((s) => s.id !== soundId),
        },
      },
    })),

  renameCustomSound: (soundId, name) =>
    set((state) => ({
      settings: {
        ...state.settings,
        notifications: {
          ...state.settings.notifications,
          customSounds: state.settings.notifications.customSounds.map((s) => (s.id === soundId ? { ...s, name } : s)),
        },
      },
    })),
}));

export function getTabTitle(tab: Tab): string {
  return tabTitle(tab);
}

export function workspaceForTab(workspaces: Workspace[], tab: Tab | undefined): Workspace | undefined {
  if (!tab) return undefined;
  return workspaces.find((workspace) => workspace.id === tab.workspaceId);
}

export function changedFileToDiffData(file: FileStatus): Pick<DiffFileData, 'path' | 'bucket' | 'status' | 'oldPath'> {
  return {
    path: file.path,
    bucket: file.bucket,
    status: file.status,
    oldPath: file.oldPath,
  };
}
