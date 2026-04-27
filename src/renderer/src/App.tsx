import { useEffect, useMemo, useRef, useState } from "react";
import { Allotment } from "allotment";
import {
  Bot,
  FolderOpen,
  GitBranch,
  PanelRight,
  TerminalSquare,
} from "lucide-react";
import { Sidebar } from "@renderer/components/Sidebar";
import { AgentColumn } from "@renderer/components/AgentColumn";
import { AgentQuickBar } from "@renderer/components/AgentQuickBar";
import { AgentTabBar } from "@renderer/components/AgentTabBar";
import { useAgentLifecycle } from "@renderer/hooks/useAgentLifecycle";
import { FileColumn } from "@renderer/components/FileColumn";
import { QuickSearch } from "@renderer/components/QuickSearch";
import { RightPanel } from "@renderer/components/RightPanel";
import { TabBar } from "@renderer/components/TabBar";
import { TerminalDock } from "@renderer/components/TerminalDock";
import { TopBar } from "@renderer/components/TopBar";
import { ToastStack } from "@renderer/components/ToastStack";
import { useAppStore } from "@renderer/store/app-store";

export function App() {
  useAgentLifecycle();
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const terminalHeightRef = useRef(240);
  const verticalSplitRef = useRef<{
    reset: () => void;
    resize: (sizes: number[]) => void;
  } | null>(null);
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
  const closeTab = useAppStore((state) => state.closeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setRightPanelMode = useAppStore((state) => state.setRightPanelMode);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
  const toggleTerminalPanel = useAppStore((state) => state.toggleTerminalPanel);
  const triggerGitRefresh = useAppStore((state) => state.triggerGitRefresh);
  const addToast = useAppStore((state) => state.addToast);

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
              : "Failed to load workspace state.",
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
              : "Failed to save workspace state.",
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
    const onKeyDown = (event: KeyboardEvent) => {
      const isModifierShortcut = event.metaKey || event.ctrlKey;
      if (!isModifierShortcut) return;

      const key = event.key.toLowerCase();

      if (!event.shiftKey && !event.altKey && key === "p") {
        event.preventDefault();
        setQuickSearchOpen(true);
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab: cycle tabs in focused column
      if (event.ctrlKey && key === "tab") {
        event.preventDefault();
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
        const dir = event.shiftKey ? -1 : 1;
        const nextIdx =
          (currentIdx + dir + columnTabs.length) % columnTabs.length;
        setActiveTab(columnTabs[nextIdx].id);
        return;
      }

      // Cmd+1~9: context-sensitive switch based on focused panel
      if (
        !event.shiftKey &&
        !event.altKey &&
        ["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(key)
      ) {
        event.preventDefault();
        const state = useAppStore.getState();
        const idx = parseInt(key, 10) - 1;

        if (focusedColumn === "agent") {
          // Switch agent tabs by index
          const agentTabs = state.tabs.filter(
            (t) =>
              t.workspaceId === state.activeWorkspaceId &&
              t.type === "terminal" &&
              t.isAgent,
          );
          if (idx < agentTabs.length) {
            setActiveTab(agentTabs[idx].id);
          }
        } else if (focusedColumn === "file") {
          // Switch file tabs by index
          const fileTabs = state.tabs.filter(
            (t) =>
              t.workspaceId === state.activeWorkspaceId &&
              t.type !== "terminal",
          );
          if (idx < fileTabs.length) {
            setActiveTab(fileTabs[idx].id);
          }
        } else {
          // Switch workspace by global sidebar order
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
        return;
      }

      if (key === "t") {
        event.preventDefault();
        if (event.shiftKey) {
          void createAgentTerminal(activeWorkspaceId ?? undefined);
        } else {
          void createTerminal(activeWorkspaceId ?? undefined);
        }
        return;
      }

      if (key === "w") {
        event.preventDefault();
        if (activeTabId) closeTab(activeTabId);
        return;
      }

      if (key === "j") {
        event.preventDefault();
        void toggleTerminalPanel();
        return;
      }

      if (!event.shiftKey) return;

      if (key === "e") {
        event.preventDefault();
        setRightPanelMode("files");
      } else if (key === "g") {
        event.preventDefault();
        setRightPanelMode("changes");
      } else if (key === "c") {
        event.preventDefault();
        setRightPanelMode("context");
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
    setActiveWorkspace,
    setRightPanelMode,
    toggleTerminalPanel,
    tabs,
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
            : "Failed to watch workspace changes.",
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
          <h1 className="m-0 text-[22px] font-semibold">
            Open a repository to start
          </h1>
          <p className="m-0 max-w-[460px] leading-relaxed text-muted">
            ForgePad keeps the agent loop terminal-first, with file context and
            git diffs close at hand.
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={openProject}
          >
            <FolderOpen size={16} />
            Open Project
          </button>
        </section>
      );
    }

    return (
      <section className="flex size-full flex-col items-center justify-center gap-3.5 p-8 text-center">
        <TerminalSquare size={30} />
        <h1 className="m-0 text-[22px] font-semibold">
          {activeWorkspace?.name ?? "No workspace selected"}
        </h1>
        <p className="m-0 max-w-[460px] leading-relaxed text-muted flex items-center gap-[7px]">
          {activeWorkspace ? (
            <>
              <GitBranch size={14} /> {activeWorkspace.branch || "detached"}
            </>
          ) : (
            "Pick a project from the sidebar."
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
              New Agent
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => createTerminal(activeWorkspace.id)}
            >
              <TerminalSquare size={16} />
              Terminal
            </button>
          </div>
        ) : null}
      </section>
    );
  };

  if (!hydrated) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3.5 p-8 text-center">
        <div className="text-[22px] font-bold">ForgePad</div>
        <div className="text-muted">Loading workspace</div>
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

  const renderMiddleContent = () => {
    // Horizontal split: Agent (left) | File (right)
    if (hasAgentTabs && hasFileTabs) {
      return (
        <Allotment proportionalLayout={false} className="columns-split">
          <Allotment.Pane
            preferredSize="50%"
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
          <Allotment.Pane
            minSize={280}
            className={focusedColumn === "file" ? "pane-focused" : ""}
          >
            <div className="flex size-full min-h-0 flex-col">
              <TabBar />
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <FileColumn />
              </div>
            </div>
          </Allotment.Pane>
        </Allotment>
      );
    }

    // Agent only (no file tabs)
    if (hasAgentTabs) {
      return (
        <div
          className={`flex size-full min-h-0 flex-col${focusedColumn === "agent" ? " pane-focused" : ""}`}
        >
          <AgentTabBar />
          <AgentQuickBar />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AgentColumn />
          </div>
        </div>
      );
    }

    // File only or empty state
    if (hasFileTabs) {
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

    return renderWorkspaceArea();
  };

  const renderWorkspaceFrame = () => (
    <main className="flex size-full min-h-0 flex-col bg-bg">
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
    <div className="flex size-full flex-col bg-bg">
      <TopBar onOpenSearch={() => setQuickSearchOpen(true)} />
      <div className="min-h-0 flex-1">
        <Allotment proportionalLayout={false} className="size-full">
          <Allotment.Pane
            preferredSize={sidebarOpen ? 260 : 48}
            minSize={sidebarOpen ? 220 : 48}
            maxSize={sidebarOpen ? 360 : 48}
          >
            <Sidebar />
          </Allotment.Pane>

          <Allotment.Pane minSize={hasAnyContent ? 460 : 420}>
            {renderWorkspaceFrame()}
          </Allotment.Pane>

          {rightPanelOpen ? (
            <Allotment.Pane preferredSize={390} minSize={320} maxSize={560}>
              <RightPanel />
            </Allotment.Pane>
          ) : (
            <Allotment.Pane preferredSize={44} minSize={44} maxSize={44}>
              <aside className="grid min-h-0 justify-start justify-items-center border-l border-border bg-panel pt-2.5">
                <button
                  className="icon-button"
                  type="button"
                  title="Open side panel"
                  onClick={() => useAppStore.setState({ rightPanelOpen: true })}
                >
                  <PanelRight size={17} />
                </button>
              </aside>
            </Allotment.Pane>
          )}
        </Allotment>
      </div>
      <QuickSearch
        open={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
      />
      <ToastStack />
    </div>
  );
}
