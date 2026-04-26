import { useEffect, useMemo } from "react";
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
import { FileColumn } from "@renderer/components/FileColumn";
import { RightPanel } from "@renderer/components/RightPanel";
import { ToastStack } from "@renderer/components/ToastStack";
import { useAppStore } from "@renderer/store/app-store";

export function App() {
  const hydrated = useAppStore((state) => state.hydrated);
  const projects = useAppStore((state) => state.projects);
  const workspaces = useAppStore((state) => state.workspaces);
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const focusedColumn = useAppStore((state) => state.focusedColumn);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const openProject = useAppStore((state) => state.openProject);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const closeTab = useAppStore((state) => state.closeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const setRightPanelMode = useAppStore((state) => state.setRightPanelMode);
  const setFocusedColumn = useAppStore((state) => state.setFocusedColumn);
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

      // Cmd+1~9: switch workspace by global sidebar order
      if (
        !event.shiftKey &&
        !event.altKey &&
        ["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(key)
      ) {
        event.preventDefault();
        const state = useAppStore.getState();
        const orderedIds: string[] = [];
        for (const project of state.projects) {
          for (const ws of state.workspaces.filter(
            (w) => w.projectId === project.id,
          )) {
            orderedIds.push(ws.id);
          }
        }
        const idx = parseInt(key, 10) - 1;
        if (idx < orderedIds.length) {
          state.setActiveWorkspace(orderedIds[idx]);
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
        const terminalTab = tabs.find(
          (tab) =>
            tab.workspaceId === activeWorkspaceId && tab.type === "terminal",
        );
        if (terminalTab) {
          setActiveTab(terminalTab.id);
        } else {
          void createTerminal(activeWorkspaceId ?? undefined);
        }
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
  const hasTerminalTabs = workspaceTabs.some(
    (tab) => tab.type === "terminal",
  );
  const hasFileTabs = workspaceTabs.some((tab) => tab.type !== "terminal");

  const renderEmptyState = () => {
    if (projects.length === 0) {
      return (
        <section className="empty-workspace">
          <div className="empty-icon">
            <FolderOpen size={32} />
          </div>
          <h1>Open a repository to start</h1>
          <p>
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
      <section className="empty-workspace compact">
        <TerminalSquare size={30} />
        <h1>{activeWorkspace?.name ?? "No workspace selected"}</h1>
        <p>
          {activeWorkspace ? (
            <>
              <GitBranch size={14} /> {activeWorkspace.branch || "detached"}
            </>
          ) : (
            "Pick a project from the sidebar."
          )}
        </p>
        {activeWorkspace ? (
          <div style={{ display: "flex", gap: "8px" }}>
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
      <div className="boot-screen">
        <div className="boot-mark">ForgePad</div>
        <div className="muted">Loading workspace</div>
      </div>
    );
  }

  const hasAnyContent = hasTerminalTabs || hasFileTabs;

  return (
    <div className="app-shell">
      <Allotment proportionalLayout={false} className="app-allotment">
        <Allotment.Pane
          preferredSize={sidebarOpen ? 260 : 48}
          minSize={sidebarOpen ? 220 : 48}
          maxSize={sidebarOpen ? 360 : 48}
        >
          <Sidebar />
        </Allotment.Pane>

        {!hasAnyContent ? (
          <Allotment.Pane minSize={460}>
            <main
              className="center-pane"
              onMouseDown={() => setFocusedColumn("agent")}
            >
              {renderEmptyState()}
            </main>
          </Allotment.Pane>
        ) : hasTerminalTabs && hasFileTabs ? (
          <Allotment.Pane minSize={460}>
            <div style={{ width: "100%", height: "100%" }}>
              <Allotment proportionalLayout={false}>
                <Allotment.Pane
                  minSize={280}
                  preferredSize={440}
                  className={focusedColumn === "agent" ? "pane-focused" : ""}
                >
                  <AgentColumn />
                </Allotment.Pane>
                <Allotment.Pane
                  minSize={280}
                  preferredSize={500}
                  className={focusedColumn === "file" ? "pane-focused" : ""}
                >
                  <FileColumn />
                </Allotment.Pane>
              </Allotment>
            </div>
          </Allotment.Pane>
        ) : hasTerminalTabs ? (
          <Allotment.Pane
            minSize={320}
            preferredSize={540}
            className={focusedColumn === "agent" ? "pane-focused" : ""}
          >
            <AgentColumn />
          </Allotment.Pane>
        ) : (
          <Allotment.Pane
            minSize={320}
            preferredSize={620}
            className={focusedColumn === "file" ? "pane-focused" : ""}
          >
            <FileColumn />
          </Allotment.Pane>
        )}

        {rightPanelOpen ? (
          <Allotment.Pane preferredSize={390} minSize={320} maxSize={560}>
            <RightPanel />
          </Allotment.Pane>
        ) : (
          <Allotment.Pane preferredSize={44} minSize={44} maxSize={44}>
            <aside className="right-panel-collapsed">
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
      <ToastStack />
    </div>
  );
}
