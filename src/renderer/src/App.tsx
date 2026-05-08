import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgentColumn } from "@renderer/components/AgentColumn";
import { AgentQuickBar } from "@renderer/components/AgentQuickBar";
import { AgentTabBar } from "@renderer/components/AgentTabBar";
import { FileColumn } from "@renderer/components/FileColumn";
import { QuickSearch } from "@renderer/components/QuickSearch";
import { RightPanel } from "@renderer/components/RightPanel";
import { SettingsPanel } from "@renderer/components/SettingsPanel";
import { Sidebar } from "@renderer/components/Sidebar";
import { SketchyFilters } from "@renderer/components/SketchyFilters";
import { TabBar } from "@renderer/components/TabBar";
import { TerminalDock } from "@renderer/components/TerminalDock";
import { ToastStack } from "@renderer/components/ToastStack";
import { TopBar } from "@renderer/components/TopBar";
import { useAgentLifecycle } from "@renderer/hooks/useAgentLifecycle";
import { type ResolvedTheme, useTheme } from "@renderer/hooks/useTheme";
import { I18nProvider, useTranslation } from "@renderer/i18n";
import {
  getDroppedPaths,
  hasDraggableFiles,
  isInternalDrop,
} from "@renderer/lib/drag-utils";
import { registerPendingExtTabCreate } from "@renderer/lib/extension-tab-bridge";
import { eventMatchesCombo } from "@renderer/lib/shortcut-utils";
import { useAppStore } from "@renderer/store/app-store";
import type { ShortcutActionId } from "@shared/types";
import { DEFAULT_SHORTCUTS } from "@shared/types";
import { Allotment } from "allotment";
import {
  Bot,
  FolderOpen,
  GitBranch,
  Globe,
  PenLine,
  TerminalSquare,
} from "lucide-react";

export const ThemeContext = createContext<ResolvedTheme>("dark");
export const useResolvedTheme = () => useContext(ThemeContext);

function AppInner() {
  const resolvedTheme = useTheme();
  useAgentLifecycle();
  const { t } = useTranslation();
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const terminalHeightRef = useRef(240);
  const sidebarWidthRef = useRef(260);
  const rightPanelWidthRef = useRef(390);
  const horizontalSplitRef = useRef<{
    reset: () => void;
    resize: (sizes: number[]) => void;
  } | null>(null);
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
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const focusedColumn = useAppStore((state) => state.focusedColumn);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const terminalPanelOpen = useAppStore((state) => state.terminalPanelOpen);
  const openProject = useAppStore((state) => state.openProject);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const createBrowserTab = useAppStore((state) => state.createBrowserTab);
  const createCanvasTab = useAppStore((state) => state.createCanvasTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const navigatePanel = useAppStore((state) => state.navigatePanel);
  const setRightPanelMode = useAppStore((state) => state.setRightPanelMode);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const toggleTerminalPanel = useAppStore((state) => state.toggleTerminalPanel);
  const triggerGitRefresh = useAppStore((state) => state.triggerGitRefresh);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const addToast = useAppStore((state) => state.addToast);
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const shortcuts = useMemo(
    () => ({ ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) }),
    [keyboardShortcuts],
  );
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const rightPanelMode = useAppStore((s) => s.rightPanelMode);

  useEffect(() => {
    let disposed = false;
    window.forgepad.state
      .load()
      .then((state) => {
        if (!disposed) useAppStore.getState().hydrate(state);
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

  // Listen for native menu "Settings" click
  useEffect(() => {
    return window.forgepad.menu.onOpenSettings(() => {
      useAppStore.setState({ settingsOpen: true });
    });
  }, []);

  // Listen for extension tab creation requests (chrome.tabs.create polyfill)
  useEffect(() => {
    return window.forgepad.extension.onTabCreate((data) => {
      const tabId = createBrowserTab(data.url);
      if (tabId) {
        registerPendingExtTabCreate(tabId, data.requestId);
      }
    });
  }, [createBrowserTab]);

  useEffect(() => {
    // Build action handler map for configurable keyboard shortcuts
    const handlers: Record<ShortcutActionId, () => void> = {
      quickSearch: () => setQuickSearchOpen(true),
      toggleSettings: () =>
        useAppStore.setState((s) => ({
          settingsOpen: !s.settingsOpen,
        })),
      cycleTabForward: () => {
        const state = useAppStore.getState();
        const wsTabs = state.tabs.filter(
          (t) => t.workspaceId === state.activeWorkspaceId,
        );
        let columnTabs;
        if (focusedColumn === "agent") {
          columnTabs = wsTabs.filter((t) => t.type === "terminal");
        } else if (focusedColumn === "file") {
          columnTabs = wsTabs.filter((t) => t.type !== "terminal");
        } else {
          columnTabs = wsTabs;
        }
        if (columnTabs.length <= 1) return;
        const currentIdx = columnTabs.findIndex(
          (t) => t.id === state.activeTabId,
        );
        const nextIdx = (currentIdx + 1) % columnTabs.length;
        setActiveTab(columnTabs[nextIdx].id);
      },
      cycleTabBackward: () => {
        const state = useAppStore.getState();
        const wsTabs = state.tabs.filter(
          (t) => t.workspaceId === state.activeWorkspaceId,
        );
        let columnTabs;
        if (focusedColumn === "agent") {
          columnTabs = wsTabs.filter((t) => t.type === "terminal");
        } else if (focusedColumn === "file") {
          columnTabs = wsTabs.filter((t) => t.type !== "terminal");
        } else {
          columnTabs = wsTabs;
        }
        if (columnTabs.length <= 1) return;
        const currentIdx = columnTabs.findIndex(
          (t) => t.id === state.activeTabId,
        );
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
      closeTab: () => {
        if (activeTabId) closeTab(activeTabId);
      },
      toggleTerminal: () => void toggleTerminalPanel(),
      toggleSidebar: () => toggleSidebar(),
      toggleRightPanel: () => toggleRightPanel(),
      openRightPanelFiles: () => {
        const state = useAppStore.getState();
        if (state.rightPanelOpen && state.rightPanelMode === "files") {
          useAppStore.setState({ rightPanelOpen: false });
        } else {
          setRightPanelMode("files");
        }
      },
      openRightPanelChanges: () => {
        const state = useAppStore.getState();
        if (state.rightPanelOpen && state.rightPanelMode === "changes") {
          useAppStore.setState({ rightPanelOpen: false });
        } else {
          setRightPanelMode("changes");
        }
      },
      openRightPanelContext: () => {
        const state = useAppStore.getState();
        if (state.rightPanelOpen && state.rightPanelMode === "context") {
          useAppStore.setState({ rightPanelOpen: false });
        } else {
          setRightPanelMode("context");
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
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTabId,
    activeWorkspaceId,
    closeTab,
    createAgentTerminal,
    createTerminal,
    focusedColumn,
    setActiveTab,
    setRightPanelMode,
    toggleTerminalPanel,
    toggleSidebar,
    toggleRightPanel,
    navigatePanel,
    shortcuts,
  ]);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId),
    [activeWorkspaceId, workspaces],
  );

  useEffect(() => {
    if (!activeWorkspace) return;

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

  // Animate sidebar & right panel toggle via transient CSS transition
  useEffect(() => {
    const el = horizontalSplitRef.current
      ? (document.querySelector(".app-horizontal-split") as HTMLElement | null)
      : null;
    if (!el) return;
    el.classList.add("panel-animating");
    if (sidebarOpen) {
      requestAnimationFrame(() => {
        horizontalSplitRef.current?.resize([sidebarWidthRef.current]);
      });
    }
    const tid = window.setTimeout(
      () => el.classList.remove("panel-animating"),
      220,
    );
    return () => {
      window.clearTimeout(tid);
      el?.classList.remove("panel-animating");
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const el = document.querySelector(
      ".app-horizontal-split",
    ) as HTMLElement | null;
    if (!el) return;
    el.classList.add("panel-animating");
    if (rightPanelOpen) {
      requestAnimationFrame(() => {
        const total = el.clientWidth;
        const sw = sidebarOpen ? sidebarWidthRef.current : 0;
        const rw = rightPanelWidthRef.current;
        horizontalSplitRef.current?.resize([sw, total - sw - rw, rw]);
      });
    }
    const tid = window.setTimeout(
      () => el.classList.remove("panel-animating"),
      220,
    );
    return () => {
      window.clearTimeout(tid);
      el?.classList.remove("panel-animating");
    };
  }, [rightPanelOpen, sidebarOpen]);

  // When sidebar or right-panel toggles, keep the File column at its previous
  // width so the freed space goes entirely to the Agent column.
  useEffect(() => {
    const fw = fileColumnWidthRef.current;
    if (fw == null || !columnsSplitRef.current) return;
    // Wait for the outer allotment to finish its layout first.
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
      <section className="flex size-full flex-col items-center justify-center gap-3.5 p-8 text-center">
        <TerminalSquare size={30} />
        <h1 className="m-0 font-semibold text-[22px]">
          {activeWorkspace?.name ?? t("app.emptyState.noWorkspace")}
        </h1>
        <p className="m-0 flex max-w-[460px] items-center gap-[7px] text-muted leading-relaxed">
          {activeWorkspace ? (
            <>
              <GitBranch size={14} />{" "}
              {activeWorkspace.branch || t("app.emptyState.detached")}
            </>
          ) : (
            t("app.emptyState.pickProject")
          )}
        </p>
        {activeWorkspace ? (
          <div className="flex gap-2">
            <button
              className="primary-button"
              type="button"
              onClick={() => createAgentTerminal(activeWorkspace.id)}
            >
              <Bot size={16} />
              {t("app.emptyState.newAgent")}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => createTerminal(activeWorkspace.id)}
            >
              <TerminalSquare size={16} />
              {t("app.emptyState.terminal")}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => createBrowserTab()}
            >
              <Globe size={16} />
              {t("app.emptyState.browser")}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => createCanvasTab()}
            >
              <PenLine size={16} />
              {t("app.emptyState.canvas")}
            </button>
          </div>
        ) : null}
      </section>
    );
  };

  if (!hydrated) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3.5 p-8 text-center">
        <div className="font-bold text-[22px]">{t("app.name")}</div>
        <div className="text-muted">{t("app.loading")}</div>
      </div>
    );
  }

  const hasAnyContent = hasFileTabs || hasTerminalTabs;
  const shellDockVisible = terminalPanelOpen && hasShellTabs;

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

  // Whether any browser tabs exist across all workspaces — when true we must
  // keep FileColumn mounted (even if hidden) so webviews are not destroyed.
  const hasBrowserTabsAnywhere = tabs.some((tab) => tab.type === "browser");
  const keepFileColumnMounted = hasFileTabs || hasBrowserTabsAnywhere;

  const renderMiddleContent = () => {
    // Empty state — no agent, no file tabs, no browser tabs to preserve
    if (!hasAgentTabs && !keepFileColumnMounted) {
      return renderWorkspaceArea();
    }

    // ── Stable layout: always the same JSX tree so FileColumn never unmounts ──
    // We use a single Allotment that shows/hides panes via the `visible` prop
    // rather than switching between completely different JSX branches, which
    // would cause React to unmount & remount FileColumn (destroying webviews).
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
            minSize={hasAgentTabs ? 280 : 0}
            visible={hasAgentTabs}
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

          {/* File pane — stays mounted to preserve browser webviews.
              When the current workspace has no file tabs but other workspaces
              have browser tabs, this pane is hidden (visible=false) yet remains
              in the React tree so webview elements are not destroyed. */}
          <Allotment.Pane
            preferredSize={hasAgentTabs && hasFileTabs ? "50%" : undefined}
            minSize={hasFileTabs ? 280 : 0}
            visible={hasFileTabs}
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
    const paths = getDroppedPaths(e);
    if (paths.length === 0) return;
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
    for (const absPath of paths) {
      if (absPath.startsWith(activeWs.worktreePath + "/")) {
        const relPath = absPath.slice(activeWs.worktreePath.length + 1);
        state.openFileTab(activeWs.id, relPath);
      } else {
        state.openExternalFileTab(activeWs.id, absPath);
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
        <Allotment
          ref={verticalSplitRef}
          className="terminal-vertical-split"
          vertical
          proportionalLayout={false}
          onChange={(sizes) => {
            if (shellDockVisible && sizes.length === 2 && sizes[1] > 0) {
              terminalHeightRef.current = sizes[1];
            }
          }}
        >
          <Allotment.Pane minSize={220}>{renderMiddleContent()}</Allotment.Pane>
          <Allotment.Pane
            key="terminal-dock"
            preferredSize={shellDockVisible ? terminalHeightRef.current : 0}
            minSize={shellDockVisible ? 120 : 0}
            visible={shellDockVisible}
          >
            <TerminalDock />
          </Allotment.Pane>
        </Allotment>
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
            <SettingsPanel />
          </div>
        ) : (
          /* ── Normal workspace layout ── */
          <div className="min-h-0 flex-1">
            <Allotment
              ref={horizontalSplitRef}
              proportionalLayout={false}
              className="app-horizontal-split size-full"
              onChange={(sizes) => {
                if (sidebarOpen && sizes[0] > 0) {
                  sidebarWidthRef.current = sizes[0];
                }
                if (
                  rightPanelOpen &&
                  sizes.length >= 3 &&
                  sizes[sizes.length - 1] > 0
                ) {
                  rightPanelWidthRef.current = sizes[sizes.length - 1];
                }
              }}
            >
              <Allotment.Pane
                preferredSize={sidebarOpen ? sidebarWidthRef.current : 0}
                minSize={sidebarOpen ? 220 : 0}
                maxSize={sidebarOpen ? 360 : 0}
                visible={sidebarOpen}
              >
                <Sidebar />
              </Allotment.Pane>

              <Allotment.Pane minSize={hasAnyContent ? 460 : 420}>
                {renderWorkspaceFrame()}
              </Allotment.Pane>

              <Allotment.Pane
                preferredSize={rightPanelOpen ? rightPanelWidthRef.current : 0}
                minSize={rightPanelOpen ? 320 : 0}
                maxSize={rightPanelOpen ? 560 : 0}
                visible={rightPanelOpen}
              >
                <RightPanel />
              </Allotment.Pane>
            </Allotment>
          </div>
        )}

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
      <AppInner />
    </I18nProvider>
  );
}
