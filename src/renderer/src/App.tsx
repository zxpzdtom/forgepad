import { useEffect, useMemo } from "react";
import { Allotment } from "allotment";
import {
  FolderOpen,
  GitBranch,
  PanelRight,
  TerminalSquare,
} from "lucide-react";
import { Sidebar } from "@renderer/components/Sidebar";
import { TabBar } from "@renderer/components/TabBar";
import { TerminalPanel } from "@renderer/components/TerminalPanel";
import { FileEditor } from "@renderer/components/FileEditor";
import { DiffViewer } from "@renderer/components/DiffViewer";
import { ContextPreview } from "@renderer/components/ContextPreview";
import { RightPanel } from "@renderer/components/RightPanel";
import { ToastStack } from "@renderer/components/ToastStack";
import { useAppStore, workspaceForTab } from "@renderer/store/app-store";

export function App() {
  const hydrated = useAppStore((state) => state.hydrated);
  const projects = useAppStore((state) => state.projects);
  const workspaces = useAppStore((state) => state.workspaces);
  const tabs = useAppStore((state) => state.tabs);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const openProject = useAppStore((state) => state.openProject);
  const createTerminal = useAppStore((state) => state.createTerminal);
  const createAgentTerminal = useAppStore((state) => state.createAgentTerminal);
  const closeTab = useAppStore((state) => state.closeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setRightPanelMode = useAppStore((state) => state.setRightPanelMode);
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
    setActiveTab,
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

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [activeTabId, tabs],
  );
  const workspaceTabs = tabs.filter((tab) => tab.workspaceId === activeWorkspaceId);
  const terminalTabs = workspaceTabs.filter((tab) => tab.type === "terminal");
  const editorTabs = workspaceTabs.filter((tab) => tab.type !== "terminal");
  const activeEditorTab =
    activeTab && activeTab.type !== "terminal" ? activeTab : editorTabs.at(-1);
  const activeTerminalTab =
    activeTab?.type === "terminal"
      ? activeTab
      : (terminalTabs
          .slice()
          .reverse()
          .find((tab) => tab.type === "terminal" && tab.isAgent) ??
        terminalTabs.at(-1));
  const activeEditorWorkspace =
    workspaceForTab(workspaces, activeEditorTab) ?? activeWorkspace;
  const activeTerminalWorkspace =
    workspaceForTab(workspaces, activeTerminalTab) ?? activeWorkspace;

  const renderEditorSurface = () => {
    if (!activeEditorTab || !activeEditorWorkspace) {
      return (
        <div className="panel-placeholder">Open a file or changes view</div>
      );
    }

    if (activeEditorTab.type === "file") {
      return <FileEditor tab={activeEditorTab} workspace={activeEditorWorkspace} />;
    }
    if (activeEditorTab.type === "diff") {
      return <DiffViewer tab={activeEditorTab} workspace={activeEditorWorkspace} />;
    }
    if (activeEditorTab.type === "context-preview") {
      return <ContextPreview />;
    }
    return null;
  };

  const renderTerminalSurface = () => {
    if (!activeTerminalTab || !activeTerminalWorkspace) return null;
    return (
      <>
        {terminalTabs.map((tab) => {
          const workspace = workspaces.find((item) => item.id === tab.workspaceId);
          if (!workspace) return null;
          return (
            <TerminalPanel
              key={tab.id}
              tab={tab}
              workspace={workspace}
              active={tab.id === activeTerminalTab.id}
            />
          );
        })}
      </>
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
        <Allotment.Pane minSize={460}>
          <main className="center-pane">
            <TabBar />
            {projects.length === 0 ? (
              <section className="empty-workspace">
                <div className="empty-icon">
                  <FolderOpen size={32} />
                </div>
                <h1>Open a repository to start</h1>
                <p>
                  ForgePad keeps the agent loop terminal-first, with file
                  context and git diffs close at hand.
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
            ) : activeEditorTab || activeTerminalTab ? (
              <div className="tab-surface workspace-surface">
                {activeEditorTab && activeTerminalTab ? (
                  <Allotment proportionalLayout={false} className="workspace-split">
                    <Allotment.Pane minSize={320} preferredSize={620}>
                      <div className="workspace-pane-slot editor-slot">
                        {renderEditorSurface()}
                      </div>
                    </Allotment.Pane>
                    <Allotment.Pane minSize={300} preferredSize={440}>
                      <div className="workspace-pane-slot terminal-slot">
                        {renderTerminalSurface()}
                      </div>
                    </Allotment.Pane>
                  </Allotment>
                ) : activeEditorTab ? (
                  <div className="workspace-pane-slot editor-slot">
                    {renderEditorSurface()}
                  </div>
                ) : (
                  <div className="workspace-pane-slot terminal-slot">
                    {renderTerminalSurface()}
                  </div>
                )}
              </div>
            ) : (
              <section className="empty-workspace compact">
                <TerminalSquare size={30} />
                <h1>{activeWorkspace?.name ?? "No workspace selected"}</h1>
                <p>
                  {activeWorkspace ? (
                    <>
                      <GitBranch size={14} />{" "}
                      {activeWorkspace.branch || "detached"}
                    </>
                  ) : (
                    "Pick a project from the sidebar."
                  )}
                </p>
                {activeWorkspace ? (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => createTerminal(activeWorkspace.id)}
                  >
                    <TerminalSquare size={16} />
                    New Terminal
                  </button>
                ) : null}
              </section>
            )}
          </main>
        </Allotment.Pane>
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
