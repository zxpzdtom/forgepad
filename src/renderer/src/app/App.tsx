import {
  lazy,
  type MouseEvent as ReactMouseEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgentColumn } from "@renderer/components/AgentColumn";
import { agentPresetIcon } from "@renderer/components/AgentIcons";
import { AgentQuickBar } from "@renderer/components/AgentQuickBar";
import { AgentTabBar } from "@renderer/components/AgentTabBar";
import { FileColumn } from "@renderer/components/FileColumn";
import { PetWidget } from "@renderer/components/pets/PetWidget";
import { QuickSearch } from "@renderer/components/QuickSearch";
import { RightPanel } from "@renderer/components/RightPanel";
import { SketchyFilters } from "@renderer/components/SketchyFilters";
import { Sidebar } from "@renderer/components/Sidebar";
import { TabBar } from "@renderer/components/TabBar";
import { TerminalDock } from "@renderer/components/TerminalDock";
import { ToastStack } from "@renderer/components/ToastStack";
import { TopBar } from "@renderer/components/TopBar";
import { useAgentLifecycle } from "@renderer/hooks/useAgentLifecycle";
import { type ResolvedTheme, useTheme } from "@renderer/hooks/useTheme";
import { I18nProvider, useTranslation } from "@renderer/i18n";
import {
  getDroppedFileEntries,
  getDroppedPaths,
  hasDraggableFiles,
  isInternalDrop,
} from "@renderer/lib/drag-utils";
import { eventMatchesCombo } from "@renderer/lib/shortcut-utils";
import { useAppStore } from "@renderer/store/app-store";
import { ThemeContext } from "@renderer/app/theme-context";
import type {
  AgentSessionHistoryItem,
  PersistedAppState,
  PetPlayAction,
  ShortcutActionId,
  Tab,
  Workspace,
} from "@shared/types";
import { DEFAULT_SHORTCUTS } from "@shared/types";
import {
  WorkerPoolContextProvider,
  type WorkerInitializationRenderOptions,
  type WorkerPoolOptions,
} from "@pierre/diffs/react";
import { Allotment } from "allotment";
import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import {
  Bot,
  FolderOpen,
  GitBranch,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

const SettingsPanel = lazy(() =>
  import("@renderer/components/SettingsPanel").then((module) => ({
    default: module.SettingsPanel,
  })),
);

const STARTUP_FILE_PREVIEW_BYTES = 256 * 1024;

function isMarkdownPreviewPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function findPersistedActiveFile(
  state: Partial<PersistedAppState> | null,
): { tab: Extract<Tab, { type: "file" }>; workspace: Workspace } | null {
  const workspaces = state?.workspaces ?? [];
  const tabs = state?.tabs ?? [];
  const activeWorkspaceId =
    state?.activeWorkspaceId && workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : (workspaces[0]?.id ?? null);
  if (!activeWorkspaceId) return null;

  const workspace = workspaces.find((item) => item.id === activeWorkspaceId);
  if (!workspace) return null;

  const fileTabs = tabs.filter(
    (tab): tab is Extract<Tab, { type: "file" }> => tab.workspaceId === activeWorkspaceId && tab.type === "file",
  );
  const rememberedId = state?.workspaceActiveFileTabIds?.[activeWorkspaceId];
  const activeTab = tabs.find((tab) => tab.id === state?.activeTabId);
  const restoredActiveFileId =
    activeTab?.workspaceId === activeWorkspaceId && activeTab.type === "file" ? activeTab.id : undefined;
  const activeFileTab =
    fileTabs.find((tab) => tab.id === rememberedId) ??
    fileTabs.find((tab) => tab.id === restoredActiveFileId) ??
    fileTabs.at(-1);

  return activeFileTab ? { tab: activeFileTab, workspace } : null;
}

function prewarmPersistedActiveFile(state: Partial<PersistedAppState> | null): void {
  const active = findPersistedActiveFile(state);
  if (!active || active.tab.externalUrl) return;

  if (active.tab.absPath) {
    void window.forgepad.fs.readAbsFilePreview(active.tab.absPath, STARTUP_FILE_PREVIEW_BYTES).catch(() => {});
  } else {
    void window.forgepad.fs
      .readFilePreview(active.workspace.worktreePath, active.tab.relPath, STARTUP_FILE_PREVIEW_BYTES)
      .catch(() => {});
  }

  if (isMarkdownPreviewPath(active.tab.relPath)) {
    void import("@renderer/components/FileEditor").then((module) => module.preloadMarkdownPreview?.());
  }
}

const pierreWorkerPoolOptions: WorkerPoolOptions = {
  poolSize: Math.max(2, Math.min(4, navigator.hardwareConcurrency || 2)),
  totalASTLRUCacheSize: 80,
  workerFactory: () =>
    new Worker(new URL("@pierre/diffs/worker/worker.js", import.meta.url), {
      type: "module",
    }),
};

const pierreHighlighterOptions: WorkerInitializationRenderOptions = {
  langs: [
    "bash",
    "css",
    "html",
    "javascript",
    "json",
    "jsx",
    "markdown",
    "python",
    "rust",
    "swift",
    "tsx",
    "typescript",
  ],
  preferredHighlighter: "shiki-js",
  tokenizeMaxLineLength: 800,
};

const NATIVE_DRAG_REGION_SELECTOR = [
  ".app-topbar",
  ".sidebar > :first-child",
  ".boot-screen",
  ".popout-tabbar",
].join(",");

const NATIVE_NO_DRAG_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable=\"true\"]",
  "[role=\"button\"]",
  "[role=\"tab\"]",
  "[role=\"radio\"]",
  "[role=\"radiogroup\"]",
  "[role=\"menu\"]",
  "[role=\"listbox\"]",
  ".tabs-scroll",
  ".toolbar-actions",
  ".toolbar-select",
  ".tabbar-actions",
  ".right-panel-tabs",
  ".right-panel-actions",
  ".popout-tab-item",
].join(",");

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]'),
  );
}

const OPEN_WITH_IDE_IDS = new Set(['zed', 'vscode', 'cursor', 'windsurf', 'intellij', 'xcode']);
const OPEN_WITH_TERMINAL_IDS = new Set(['terminal', 'iterm', 'iterm2', 'ghostty', 'wezterm']);

function fileTabOpenPath(tab: Extract<Tab, { type: 'file' }>, workspacePath: string) {
  if (tab.absPath) return tab.absPath;
  if (tab.externalUrl) return null;
  return `${workspacePath}/${tab.relPath}`;
}

function BootScreen() {
  const { t } = useTranslation();
  return (
    <div className="boot-screen flex size-full flex-col items-center justify-center overflow-hidden bg-bg p-8 text-center">
      <div className="boot-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="mt-5 font-semibold text-[22px] text-text">{t("app.name")}</div>
    </div>
  );
}

function relativeSessionTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  return `${Math.floor(diff / day)} 天前`;
}

function agentLabelFromSession(session: AgentSessionHistoryItem): string {
  if (session.agentPresetId === "claude") return "Claude";
  if (session.agentPresetId === "codex") return "Codex";
  if (session.agentPresetId === "gemini") return "Gemini";
  return session.agentPresetId ?? "Agent";
}

function AppInner() {
  const resolvedTheme = useTheme();
  const prefersReducedMotion = useReducedMotion();
  useAgentLifecycle();
  const { t } = useTranslation();
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const terminalHeightRef = useRef(240);
  const [sidebarSize, setSidebarSize] = useState(() => Number(window.localStorage.getItem("forgepad.sidebar.width")) || 260);
  const [rightPanelSize, setRightPanelSize] = useState(() => Number(window.localStorage.getItem("forgepad.rightPanel.width")) || 390);
  const [resizingSide, setResizingSide] = useState<"left" | "right" | null>(null);
  const [terminalResizing, setTerminalResizing] = useState(false);
  const verticalSplitRef = useRef<{
    reset: () => void;
    resize: (sizes: number[]) => void;
  } | null>(null);
  const columnsSplitRef = useRef<{
    reset: () => void;
    resize: (sizes: number[]) => void;
  } | null>(null);
  const fileColumnWidthRef = useRef<number | null>(null);
  const prevShellDockVisibleRef = useRef(false);
  const hydrated = useAppStore((state) => state.hydrated);
  const projects = useAppStore((state) => state.projects);
  const workspaces = useAppStore((state) => state.workspaces);
  const tabs = useAppStore((state) => state.tabs);
  const agentSessionHistory = useAppStore((state) => state.agentSessionHistory);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const focusedColumn = useAppStore((state) => state.focusedColumn);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const terminalPanelOpen = useAppStore((state) => state.terminalPanelOpen);
  const openProject = useAppStore((state) => state.openProject);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const resumeAgentSession = useAppStore((state) => state.resumeAgentSession);
  const importExternalAgentSessions = useAppStore((state) => state.importExternalAgentSessions);
  const createBrowserTab = useAppStore((state) => state.createBrowserTab);
  const defaultBrowserHomepage = useAppStore(
    (state) => state.settings.defaultBrowserHomepage,
  );
  const closeTab = useAppStore((state) => state.closeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const navigatePanel = useAppStore((state) => state.navigatePanel);
  const setRightPanelMode = useAppStore((state) => state.setRightPanelMode);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const toggleTerminalPanel = useAppStore((state) => state.toggleTerminalPanel);
  const triggerGitRefresh = useAppStore((state) => state.triggerGitRefresh);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const addToast = useAppStore((state) => state.addToast);
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const petSettings = useAppStore((s) => s.settings.pets);
  const appIconVariant = useAppStore((s) => s.settings.appIconVariant);
  const shortcuts = useMemo(
    () => ({ ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) }),
    [keyboardShortcuts],
  );

  useEffect(() => {
    if (!window.forgepad.app2.startWindowDrag) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.detail > 1) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(NATIVE_NO_DRAG_SELECTOR)) return;
      if (!target.closest(NATIVE_DRAG_REGION_SELECTOR)) return;

      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      window.forgepad.app2.startWindowDrag?.();
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, []);

  useEffect(() => {
    let disposed = false;
    window.forgepad.state
      .load()
      .then((state) => {
        if (!disposed) {
          prewarmPersistedActiveFile(state);
          useAppStore.getState().hydrate(state);
        }
      })
      .catch((error) => {
        useAppStore.getState().hydrate(null);
        useAppStore
          .getState()
          .addToast(
            "error",
            error instanceof Error
              ? error.message
              : t("app.toast.failedLoadState"),
          );
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.forgepad.pet.sendSettings(petSettings);
  }, [hydrated, petSettings]);

  useEffect(() => {
    let saveTimer: number | undefined;
    const unsubscribe = useAppStore.subscribe((state) => {
      if (!state.hydrated) return;
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        window.forgepad.state.save(state.toPersistedState()).catch((error) => {
          state.addToast(
            "error",
            error instanceof Error
              ? error.message
              : t("app.toast.failedSaveState"),
          );
        });
      }, 400);
    });
    return () => {
      if (saveTimer) window.clearTimeout(saveTimer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.forgepad.app.setIcon(appIconVariant).catch((error) => {
      addToast(
        "error",
        error instanceof Error ? error.message : "Failed to apply app icon.",
      );
    });
  }, [addToast, appIconVariant, hydrated]);

  // Listen for native menu "Settings" click
  useEffect(() => {
    return window.forgepad.menu.onOpenSettings(() => {
      useAppStore.setState({ settingsOpen: true });
    });
  }, []);

  // Listen for extension tab creation requests and hand them to the native browser window.
  useEffect(() => {
    return window.forgepad.extension.onTabCreate((data) => {
      if (window.forgepad.browser.openWindow) {
        void window.forgepad.browser.openWindow(data.url || "about:blank", "Browser");
      }
    });
  }, []);

  const openBrowser = useCallback(
    (url?: string) => {
      if (window.forgepad.browser.openWindow) {
        void window.forgepad.browser.openWindow(
          url || defaultBrowserHomepage || "about:blank",
          "Browser",
        );
        return undefined;
      }
      return createBrowserTab(url);
    },
    [createBrowserTab, defaultBrowserHomepage],
  );

  useEffect(() => {
    // Build action handler map for configurable keyboard shortcuts
    const getTabsForFocusedColumn = () => {
      const state = useAppStore.getState();
      const workspaceTabs = state.tabs.filter(
        (tab) => tab.workspaceId === state.activeWorkspaceId,
      );

      if (focusedColumn === "agent") {
        return workspaceTabs.filter(
          (tab) => tab.type === "terminal" && tab.isAgent,
        );
      }
      if (focusedColumn === "terminal") {
        return workspaceTabs.filter(
          (tab) => tab.type === "terminal" && !tab.isAgent,
        );
      }
      if (focusedColumn === "file") {
        return workspaceTabs.filter((tab) => tab.type !== "terminal");
      }

      return workspaceTabs;
    };

    const getActiveTabIdForFocusedColumn = () => {
      const state = useAppStore.getState();
      const columnTabs = getTabsForFocusedColumn();
      const columnTabIds = new Set(columnTabs.map((tab) => tab.id));

      if (
        focusedColumn === "agent" &&
        state.activeAgentTabId &&
        columnTabIds.has(state.activeAgentTabId)
      ) {
        return state.activeAgentTabId;
      }
      if (
        focusedColumn === "terminal" &&
        state.activeShellTabId &&
        columnTabIds.has(state.activeShellTabId)
      ) {
        return state.activeShellTabId;
      }
      if (
        focusedColumn === "file" &&
        state.activeFileTabId &&
        columnTabIds.has(state.activeFileTabId)
      ) {
        return state.activeFileTabId;
      }
      if (state.activeTabId && columnTabIds.has(state.activeTabId)) {
        return state.activeTabId;
      }

      return columnTabs[0]?.id ?? null;
    };

    const handlers: Record<ShortcutActionId, () => void> = {
      quickSearch: () => setQuickSearchOpen(true),
      toggleSettings: () =>
        useAppStore.setState((s) => ({
          settingsOpen: !s.settingsOpen,
        })),
      cycleTabForward: () => {
        const columnTabs = getTabsForFocusedColumn();
        if (columnTabs.length <= 1) return;
        const currentTabId = getActiveTabIdForFocusedColumn();
        const currentIdx = columnTabs.findIndex((t) => t.id === currentTabId);
        const nextIdx = (currentIdx + 1) % columnTabs.length;
        setActiveTab(columnTabs[nextIdx].id);
      },
      cycleTabBackward: () => {
        const columnTabs = getTabsForFocusedColumn();
        if (columnTabs.length <= 1) return;
        const currentTabId = getActiveTabIdForFocusedColumn();
        const currentIdx = columnTabs.findIndex((t) => t.id === currentTabId);
        const nextIdx =
          (currentIdx - 1 + columnTabs.length) % columnTabs.length;
        setActiveTab(columnTabs[nextIdx].id);
      },
      switchTab1: () => switchTabByIndex(0),
      switchTab2: () => switchTabByIndex(1),
      switchTab3: () => switchTabByIndex(2),
      switchTab4: () => switchTabByIndex(3),
      switchTab5: () => switchTabByIndex(4),
      switchTab6: () => switchTabByIndex(5),
      switchTab7: () => switchTabByIndex(6),
      switchTab8: () => switchTabByIndex(7),
      switchTab9: () => switchTabByIndex(8),
      newTerminal: () => void createTerminal(activeWorkspaceId ?? undefined),
      newAgent: () => void createAgentTerminal(activeWorkspaceId ?? undefined),
      openWithDefault: () => {
        const state = useAppStore.getState();
        const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
        if (!workspace) return;

        const openWithId = state.settings.defaultOpenWith;
        let result: Promise<void> | null = null;
        if (openWithId === "finder") {
          result = window.forgepad.shell.openPath(workspace.worktreePath);
        } else if (OPEN_WITH_TERMINAL_IDS.has(openWithId)) {
          result = window.forgepad.shell.openWithTerminal(workspace.worktreePath, openWithId);
        } else if (OPEN_WITH_IDE_IDS.has(openWithId)) {
          const activeFileTab = state.tabs.find((tab) => tab.id === state.activeFileTabId && tab.type === "file");
          const activeFilePath = activeFileTab ? fileTabOpenPath(activeFileTab, workspace.worktreePath) : null;
          result = window.forgepad.shell.openWithIde(
            activeFilePath ?? workspace.worktreePath,
            openWithId,
            activeFilePath ? (activeFileTab?.targetLine ?? activeFileTab?.lastLine) : undefined,
            workspace.worktreePath,
          );
        }

        result?.catch((error) => {
          addToast("error", error instanceof Error ? error.message : t("topbar.failedToOpen"));
        });
      },
      closeTab: () => {
        const tabId = getActiveTabIdForFocusedColumn();
        if (tabId) closeTab(tabId);
      },
      toggleTerminal: () => void toggleTerminalPanel(),
      toggleSidebar: () => {
        const next = !useAppStore.getState().sidebarOpen;
        useAppStore.setState({ sidebarOpen: next });
      },
      toggleRightPanel: () => {
        const next = !useAppStore.getState().rightPanelOpen;
        useAppStore.setState({ rightPanelOpen: next });
      },
      openRightPanelFiles: () => {
        const state = useAppStore.getState();
        if (state.rightPanelOpen && state.rightPanelMode === "files") {
          useAppStore.setState({ rightPanelOpen: false });
        } else {
          setRightPanelMode("files");
          useAppStore.setState({ rightPanelOpen: true });
        }
      },
      openRightPanelChanges: () => {
        const state = useAppStore.getState();
        if (state.rightPanelOpen && state.rightPanelMode === "changes") {
          useAppStore.setState({ rightPanelOpen: false });
        } else {
          setRightPanelMode("changes");
          useAppStore.setState({ rightPanelOpen: true });
        }
      },
      openRightPanelContext: () => {
        const state = useAppStore.getState();
        if (state.rightPanelOpen && state.rightPanelMode === "context") {
          useAppStore.setState({ rightPanelOpen: false });
        } else {
          setRightPanelMode("context");
          useAppStore.setState({ rightPanelOpen: true });
        }
      },
      copyPath: () => {
        const state = useAppStore.getState();
        const tab = state.tabs.find((t) => t.id === state.activeFileTabId);
        if (!tab || tab.type !== "file") return;
        const path =
          tab.absPath ??
          (() => {
            const ws = state.workspaces.find((w) => w.id === tab.workspaceId);
            return ws ? `${ws.worktreePath}/${tab.relPath}` : null;
          })();
        if (!path) return;
        void navigator.clipboard.writeText(path);
        state.addToast("info", t("app.toast.pathCopied"));
      },
      copyRelativePath: () => {
        const state = useAppStore.getState();
        const tab = state.tabs.find((t) => t.id === state.activeFileTabId);
        if (!tab || tab.type !== "file" || tab.absPath) return;
        void navigator.clipboard.writeText(tab.relPath);
        state.addToast("info", t("app.toast.relativePathCopied"));
      },
      prevPanel: () => navigatePanel("prev"),
      nextPanel: () => navigatePanel("next"),
      switchPanel1: () => switchPanelByIndex(0),
      switchPanel2: () => switchPanelByIndex(1),
      switchPanel3: () => switchPanelByIndex(2),
      switchPanel4: () => switchPanelByIndex(3),
      switchPanel5: () => switchPanelByIndex(4),
      switchPanel6: () => switchPanelByIndex(5),
      switchPanel7: () => switchPanelByIndex(6),
      switchPanel8: () => switchPanelByIndex(7),
      switchPanel9: () => switchPanelByIndex(8),
    };

    function switchPanelByIndex(idx: number) {
      const state = useAppStore.getState();
      if (idx < state.panels.length) {
        state.setActivePanel(state.panels[idx].id);
      }
    }

    function switchTabByIndex(idx: number) {
      const state = useAppStore.getState();
      if (focusedColumn === "agent") {
        const agentTabs = state.tabs.filter(
          (t) =>
            t.workspaceId === state.activeWorkspaceId &&
            t.type === "terminal" &&
            t.isAgent,
        );
        if (idx < agentTabs.length) setActiveTab(agentTabs[idx].id);
      } else if (focusedColumn === "terminal") {
        const terminalTabs = state.tabs.filter(
          (t) =>
            t.workspaceId === state.activeWorkspaceId &&
            t.type === "terminal" &&
            !t.isAgent,
        );
        if (idx < terminalTabs.length) setActiveTab(terminalTabs[idx].id);
      } else if (focusedColumn === "file") {
        const fileTabs = state.tabs.filter(
          (t) =>
            t.workspaceId === state.activeWorkspaceId && t.type !== "terminal",
        );
        if (idx < fileTabs.length) setActiveTab(fileTabs[idx].id);
      } else {
        const orderedIds: string[] = [];
        for (const project of state.projects) {
          for (const ws of state.workspaces.filter(
            (w) => w.projectId === project.id,
          )) {
            orderedIds.push(ws.id);
          }
        }
        if (idx < orderedIds.length) {
          state.setActiveWorkspace(orderedIds[idx]);
        }
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const isTextEntry = isTextEntryTarget(event.target);
      const isDev = Boolean(
        (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
      );
      const devActionByKey: Record<string, PetPlayAction | "random"> = {
        "1": "stroll",
        "2": "hop",
        "3": "stairs",
        "4": "portal",
        "5": "windowTop",
        "6": "zigzag",
        "7": "spring",
        "8": "balloon",
        "9": "rocket",
      };

      if (
        isDev &&
        petSettings.enabled &&
        !isTextEntry &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const devAction = devActionByKey[event.key];
        if (devAction) {
          event.preventDefault();
          event.stopPropagation();
          window.forgepad.pet.play(devAction);
          return;
        }
      }

      // Data-driven dispatch: iterate all shortcuts, find match
      for (const [actionId, combo] of Object.entries(shortcuts)) {
        if (eventMatchesCombo(event, combo)) {
          event.preventDefault();
          event.stopPropagation();
          handlers[actionId as ShortcutActionId]?.();
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    activeWorkspaceId,
    closeTab,
    createAgentTerminal,
    createTerminal,
    focusedColumn,
    setActiveTab,
    setRightPanelMode,
    toggleTerminalPanel,
    navigatePanel,
    petSettings.enabled,
    shortcuts,
  ]);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId),
    [activeWorkspaceId, workspaces],
  );

  useEffect(() => {
    if (!activeWorkspace) return;
    if (!activeWorkspace.worktreePath) return;

    let disposed = false;
    let watchId: string | null = null;
    let removeListener: (() => void) | null = null;
    let refreshTimer: number | undefined;

    window.forgepad.fs
      .watchWorkspace(activeWorkspace.worktreePath)
      .then((id) => {
        if (disposed) {
          window.forgepad.fs.unwatchWorkspace(id);
          return;
        }

        watchId = id;
        removeListener = window.forgepad.fs.onChanged(id, () => {
          if (refreshTimer) window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(() => {
            triggerGitRefresh();
          }, 120);
        });
      })
      .catch((error) => {
        addToast(
          "error",
          error instanceof Error
            ? error.message
            : t("app.toast.failedWatchWorkspace"),
        );
      });

    return () => {
      disposed = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      removeListener?.();
      if (watchId) window.forgepad.fs.unwatchWorkspace(watchId);
    };
  }, [activeWorkspace, addToast, triggerGitRefresh]);

  useEffect(() => {
    if (!hydrated || !activeWorkspace) return;
    void importExternalAgentSessions(activeWorkspace.id);
  }, [activeWorkspace, hydrated, importExternalAgentSessions]);

  const workspaceTabs = tabs.filter(
    (tab) => tab.workspaceId === activeWorkspaceId,
  );
  const hasAgentTabs = workspaceTabs.some(
    (tab) => tab.type === "terminal" && tab.isAgent,
  );
  const hasShellTabs = workspaceTabs.some(
    (tab) => tab.type === "terminal" && !tab.isAgent,
  );
  const hasTerminalTabs = hasAgentTabs || hasShellTabs;
  const hasFileTabs = workspaceTabs.some((tab) => tab.type !== "terminal");

  const beginSideResize = useCallback(
    (side: "left" | "right", event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startSize = side === "left" ? sidebarSize : rightPanelSize;
      setResizingSide(side);

      const onMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextSize =
          side === "left"
            ? Math.min(420, Math.max(220, startSize + delta))
            : Math.min(560, Math.max(320, startSize - delta));
        if (side === "left") {
          setSidebarSize(nextSize);
          window.localStorage.setItem("forgepad.sidebar.width", String(Math.round(nextSize)));
        } else {
          setRightPanelSize(nextSize);
          window.localStorage.setItem("forgepad.rightPanel.width", String(Math.round(nextSize)));
        }
      };

      const onUp = () => {
        setResizingSide(null);
        document.body.classList.remove("is-resizing-panel");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      document.body.classList.add("is-resizing-panel");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [rightPanelSize, sidebarSize],
  );

  // When the motion-controlled side panels toggle, keep the File column at its
  // previous width so freed space goes entirely to the Agent column.
  useEffect(() => {
    const fw = fileColumnWidthRef.current;
    if (fw == null || !columnsSplitRef.current) return;
    // Wait for the outer grid animation to commit its latest layout first.
    requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>(".columns-split");
      if (!container || !columnsSplitRef.current) return;
      const total = container.clientWidth;
      columnsSplitRef.current.resize([total - fw, fw]);
    });
  }, [sidebarOpen, rightPanelOpen]);

  // Restore remembered terminal height when dock becomes visible
  const shellDockVisibleEarly = terminalPanelOpen && hasShellTabs;
  useEffect(() => {
    if (shellDockVisibleEarly && !prevShellDockVisibleRef.current) {
      requestAnimationFrame(() => {
        const handle = verticalSplitRef.current;
        if (!handle) return;
        const container = document.querySelector<HTMLElement>(
          ".terminal-vertical-split",
        );
        if (!container) return;
        const total = container.clientHeight;
        const termH = terminalHeightRef.current;
        handle.resize([total - termH, termH]);
      });
    }
    prevShellDockVisibleRef.current = shellDockVisibleEarly;
  }, [shellDockVisibleEarly]);

  const activeWorkspaceSessions = activeWorkspace
    ? agentSessionHistory
        .filter((session) => session.workspaceId === activeWorkspace.id)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5)
    : [];

  const renderEmptyState = () => {
    if (projects.length === 0) {
      return (
        <section className="flex size-full flex-col items-center justify-center gap-3.5 p-8 text-center">
          <div className="grid size-14 place-items-center rounded-lg border border-border bg-panel-2 text-accent">
            <FolderOpen size={32} />
          </div>
          <h1 className="m-0 font-semibold text-[22px]">
            {t("app.emptyState.title")}
          </h1>
          <p className="m-0 max-w-[460px] text-muted leading-relaxed">
            {t("app.emptyState.description")}
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={openProject}
          >
            <FolderOpen size={16} />
            {t("app.emptyState.openProject")}
          </button>
        </section>
      );
    }

    return (
      <section className="empty-workspace forgepad-start-surface flex size-full min-h-0 flex-col overflow-auto px-8 py-10">
        <div className="mx-auto flex w-full max-w-[980px] flex-1 flex-col justify-center gap-7">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-[12px] font-semibold text-accent uppercase tracking-[0.08em]">
              <GitBranch size={14} />
              {activeWorkspace?.branch || t("app.emptyState.detached")}
            </div>
            <div className="flex items-center justify-between gap-4">
              <h1 className="m-0 text-balance font-semibold text-[30px] text-text">
                {activeWorkspace ? "开始一个新的会话" : t("app.emptyState.noWorkspace")}
              </h1>
              {activeWorkspaceSessions.length > 0 ? (
                <span className="rounded-full border border-accent/35 px-3 py-1 font-medium text-accent text-xs">
                  {activeWorkspaceSessions.length} 个可恢复
                </span>
              ) : null}
            </div>
            <p className="m-0 max-w-[620px] text-muted text-sm leading-relaxed">
              {activeWorkspace ? "选择一个 Agent 开始，或者从下面恢复最近的会话历史。" : t("app.emptyState.pickProject")}
            </p>
          </div>

          {activeWorkspace ? (
            <div className="start-composer rounded-lg border border-border bg-panel/70 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur">
              <div className="min-h-[110px] p-5 text-[17px] text-subtle">描述一项任务，ForgePad 会派出代理并行尝试...</div>
              <div className="flex items-center justify-between gap-3 border-border border-t p-3">
                <button className="secondary-button h-8" type="button" onClick={() => createAgentTerminal(activeWorkspace.id)}>
                  <Bot size={15} />
                  {t("app.emptyState.newAgent")}
                </button>
                <div className="flex gap-2">
                  <button className="secondary-button h-8" type="button" onClick={() => createTerminal(activeWorkspace.id)}>
                    <TerminalSquare size={15} />
                    {t("app.emptyState.terminal")}
                  </button>
                  <button className="primary-button h-8" type="button" onClick={() => createAgentTerminal(activeWorkspace.id)}>
                    <Sparkles size={15} />
                    开始会话
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeWorkspaceSessions.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[12px] text-subtle uppercase tracking-[0.08em]">
                <span>会话历史 · {activeWorkspace?.branch || activeWorkspace?.name}</span>
                <span>{activeWorkspaceSessions.length}</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border bg-panel/60">
                {activeWorkspaceSessions.map((session) => (
                  <button
                    key={`${session.workspaceId}:${session.sessionId}`}
                    className="group flex w-full items-center gap-3 border-border border-b px-4 py-3 text-left last:border-b-0 hover:bg-panel-2"
                    type="button"
                    onClick={() => void resumeAgentSession(session)}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 text-accent shadow-[inset_0_0_0_1px_var(--border)]">
                      {session.agentPresetId ? agentPresetIcon(session.agentPresetId, 18) : <Bot size={17} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[14px] text-text">{session.title}</span>
                      <span className="mt-1 flex items-center gap-2 text-[12px] text-subtle">
                        <span className="font-semibold text-accent">{agentLabelFromSession(session)}</span>
                        <span className="font-mono">{session.sessionId.slice(0, 8)}</span>
                        <span>{relativeSessionTime(session.updatedAt)}</span>
                      </span>
                    </span>
                    <span className="text-muted text-xs opacity-0 transition-opacity group-hover:opacity-100">恢复</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  if (!hydrated) {
    return <BootScreen />;
  }

  const shellDockVisible = terminalPanelOpen && hasShellTabs;
  const sidePanelTransition = prefersReducedMotion
    ? { duration: 0 }
    : resizingSide
      ? { duration: 0 }
      : { duration: 0.18, ease: [0.2, 0, 0, 1] as [number, number, number, number] };
  const sidebarWidth = sidebarOpen ? sidebarSize : 0;
  const rightPanelWidth = rightPanelOpen ? rightPanelSize : 0;

  const renderWorkspaceArea = () => {
    if (!hasFileTabs) {
      return (
        <main
          className="flex size-full min-h-0 flex-col bg-bg"
          onMouseDown={() => setFocusedColumn("agent")}
        >
          {renderEmptyState()}
        </main>
      );
    }

    return <FileColumn />;
  };

  // Whether any browser tabs exist across all workspaces; keep FileColumn mounted
  // so native browser placeholders do not churn during workspace switches.
  const hasBrowserTabsAnywhere = tabs.some((tab) => tab.type === "browser");
  const keepFileColumnMounted = hasFileTabs || hasBrowserTabsAnywhere;

  const renderMiddleContent = () => {
    // Empty state — no agent, no file tabs, no browser tabs to preserve
    if (!hasAgentTabs && !keepFileColumnMounted) {
      return renderWorkspaceArea();
    }

    if (hasAgentTabs && !hasFileTabs) {
      return (
        <div className="flex size-full min-h-0 flex-col">
          <AgentTabBar />
          <AgentQuickBar />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AgentColumn />
          </div>
        </div>
      );
    }

    if (!hasAgentTabs && hasFileTabs) {
      return (
        <div className="flex size-full min-h-0 flex-col">
          <AgentQuickBar />
          <TabBar />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <FileColumn />
          </div>
        </div>
      );
    }

    // ── Stable layout: always the same JSX tree so FileColumn never unmounts ──
    // We use a single Allotment that shows/hides panes via the `visible` prop
    // rather than switching between completely different JSX branches, which
    // would cause React to unmount & remount FileColumn during pane changes.
    const showEmptyOverlay = !hasAgentTabs && !hasFileTabs;
    return (
      <div className="relative size-full">
        {showEmptyOverlay && (
          <div className="absolute inset-0 z-10">{renderWorkspaceArea()}</div>
        )}
        <Allotment
          ref={columnsSplitRef}
          proportionalLayout={false}
          className="columns-split"
          onChange={(sizes) => {
            if (hasFileTabs && sizes.length === 2 && sizes[1] > 0) {
              fileColumnWidthRef.current = sizes[1];
            }
          }}
        >
          {/* Agent pane — always present but hidden when no agent tabs */}
          <Allotment.Pane
            preferredSize={hasAgentTabs && hasFileTabs ? "50%" : undefined}
            minSize={280}
            className={focusedColumn === "agent" ? "pane-focused" : ""}
          >
            <div className="flex size-full min-h-0 flex-col">
              <AgentTabBar />
              <AgentQuickBar />
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <AgentColumn />
              </div>
            </div>
          </Allotment.Pane>

          {/* File pane — stays mounted to preserve browser tab placeholders.
              When the current workspace has no file tabs but other workspaces
              have browser tabs, this pane is hidden (visible=false) yet remains
              in the React tree so tab state is not destroyed. */}
          <Allotment.Pane
            preferredSize={hasAgentTabs && hasFileTabs ? "50%" : undefined}
            minSize={280}
            className={focusedColumn === "file" ? "pane-focused" : ""}
          >
            <div className="flex size-full min-h-0 flex-col">
              {!hasAgentTabs && <AgentQuickBar />}
              <TabBar />
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <FileColumn />
              </div>
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
    );
  };

  // ── Fallback drop handler ────────────────────────────────────────────────
  // Handles both internal (file-tree) and external (Finder/Explorer) drops.
  //
  // Routing logic for external files:
  //   • File is inside the active workspace  → open as a file tab (preview)
  //   • File is outside the workspace        → write absolute path to agent pty
  //
  // Internal drops (application/x-forgepad-path) always write to the agent,
  // consistent with the existing behaviour.
  // ─────────────────────────────────────────────────────────────────────────
  const handleWorkspaceDragOver = (e: React.DragEvent) => {
    if (hasDraggableFiles(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleWorkspaceDrop = (e: React.DragEvent) => {
    const entries = getDroppedFileEntries(e);
    if (entries.length === 0) return;
    const paths = entries.map((entry) => entry.path);
    e.preventDefault();

    const state = useAppStore.getState();
    const activeWs = state.workspaces.find(
      (w) => w.id === state.activeWorkspaceId,
    );

    // Internal drop (file-tree) → always write to agent pty
    if (isInternalDrop(e)) {
      const agentTabs = state.tabs.filter(
        (t) =>
          t.workspaceId === state.activeWorkspaceId &&
          t.type === "terminal" &&
          t.isAgent,
      );
      const agentTabId = state.activeAgentTabId ?? agentTabs[0]?.id;
      const agentTab = agentTabs.find((t) => t.id === agentTabId);
      if (agentTab?.type === "terminal") {
        window.forgepad.pty.write(agentTab.ptyId, paths.join(" "));
      }
      return;
    }

    // External drop anywhere outside Agent/Terminal → open as file preview
    if (!activeWs) return;
    for (const entry of entries) {
      const absPath = entry.path;
      if (absPath.startsWith(activeWs.worktreePath + "/")) {
        const relPath = absPath.slice(activeWs.worktreePath.length + 1);
        state.openFileTab(activeWs.id, relPath);
      } else {
        state.openExternalFileTab(activeWs.id, absPath, entry.objectUrl, entry.mimeType);
      }
    }
  };

  const renderWorkspaceFrame = () => (
    <main
      className="flex size-full min-h-0 flex-col bg-bg"
      onDragOver={handleWorkspaceDragOver}
      onDrop={handleWorkspaceDrop}
    >
      {!hasAgentTabs && !hasFileTabs && <AgentQuickBar />}
      <div className="min-h-0 flex-1 overflow-hidden">
        {hasShellTabs ? (
          <Allotment
            ref={verticalSplitRef}
            className={clsx("terminal-vertical-split", terminalResizing && "is-resizing-terminal")}
            vertical
            proportionalLayout={false}
            onDragStart={() => setTerminalResizing(true)}
            onDragEnd={() => setTerminalResizing(false)}
            onVisibleChange={() => {
              requestAnimationFrame(() => {
                const handle = verticalSplitRef.current;
                if (!handle) return;
                const container = document.querySelector<HTMLElement>(".terminal-vertical-split");
                if (!container || !shellDockVisible) return;
                const total = container.clientHeight;
                const termH = terminalHeightRef.current;
                handle.resize([Math.max(220, total - termH), termH]);
              });
            }}
            onChange={(sizes) => {
              if (sizes.length === 2 && sizes[1] > 0) {
                terminalHeightRef.current = sizes[1];
              }
            }}
          >
            <Allotment.Pane minSize={220}>{renderMiddleContent()}</Allotment.Pane>
            <Allotment.Pane
              key="terminal-dock"
              preferredSize={terminalHeightRef.current}
              minSize={120}
              visible={shellDockVisible}
            >
              <TerminalDock />
            </Allotment.Pane>
          </Allotment>
        ) : (
          renderMiddleContent()
        )}
      </div>
    </main>
  );

  return (
    <ThemeContext.Provider value={resolvedTheme}>
      <SketchyFilters />
      <div className="flex size-full flex-col bg-bg">
        <TopBar onOpenSearch={() => setQuickSearchOpen(true)} />

        {settingsOpen ? (
          /* ── Settings full-page view ── */
          <div className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={null}>
              <SettingsPanel />
            </Suspense>
          </div>
        ) : (
          /* ── Normal workspace layout ── */
          <motion.div
            className="grid min-h-0 flex-1 overflow-hidden"
            initial={false}
            animate={{
              gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr) ${rightPanelWidth}px`,
            }}
            transition={sidePanelTransition}
            style={{
              gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr) ${rightPanelWidth}px`,
            }}
          >
            <motion.div
              className="relative min-h-0 overflow-hidden"
              aria-hidden={!sidebarOpen}
              initial={false}
              animate={{ opacity: sidebarOpen ? 1 : 0 }}
              transition={sidePanelTransition}
              style={{ pointerEvents: sidebarOpen ? "auto" : "none" }}
            >
              <Sidebar />
              {sidebarOpen ? (
                <div
                  className="panel-resize-handle panel-resize-handle-right"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize sidebar"
                  onMouseDown={(event) => beginSideResize("left", event)}
                />
              ) : null}
            </motion.div>
            <div className="min-w-0 min-h-0 overflow-hidden">{renderWorkspaceFrame()}</div>
            <motion.div
              className="relative min-h-0 overflow-hidden"
              aria-hidden={!rightPanelOpen}
              initial={false}
              animate={{ opacity: rightPanelOpen ? 1 : 0 }}
              transition={sidePanelTransition}
              style={{ pointerEvents: rightPanelOpen ? "auto" : "none" }}
            >
              {rightPanelOpen ? (
                <div
                  className="panel-resize-handle panel-resize-handle-left"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize right panel"
                  onMouseDown={(event) => beginSideResize("right", event)}
                />
              ) : null}
              <RightPanel />
            </motion.div>
          </motion.div>
        )}

        {!__FORGEPAD_NATIVE_HOST__ ? <PetWidget /> : null}
        <QuickSearch
          open={quickSearchOpen}
          onClose={() => setQuickSearchOpen(false)}
        />
        <ToastStack />
      </div>
    </ThemeContext.Provider>
  );
}

export function App() {
  return (
    <I18nProvider>
      <WorkerPoolContextProvider
        poolOptions={pierreWorkerPoolOptions}
        highlighterOptions={pierreHighlighterOptions}
      >
        <AppInner />
      </WorkerPoolContextProvider>
    </I18nProvider>
  );
}
