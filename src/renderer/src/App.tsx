import { useEffect, useMemo } from "react";
import { Allotment } from "allotment";
import { FolderOpen, GitBranch, PanelRight, TerminalSquare } from "lucide-react";
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
  const openProject = useAppStore((state) => state.openProject);
  const createTerminal = useAppStore((state) => state.createTerminal);

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
          .addToast("error", error instanceof Error ? error.message : "Failed to load workspace state.");
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
          state.addToast("error", error instanceof Error ? error.message : "Failed to save workspace state.");
        });
      }, 400);
    });
    return () => {
      if (saveTimer) window.clearTimeout(saveTimer);
      unsubscribe();
    };
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId),
    [activeWorkspaceId, workspaces],
  );
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);
  const activeTabWorkspace = workspaceForTab(workspaces, activeTab) ?? activeWorkspace;
  const terminalTabs = tabs.filter((tab) => tab.type === "terminal");

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
        <Allotment.Pane preferredSize={260} minSize={220} maxSize={360}>
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
                <p>ForgePad keeps the agent loop terminal-first, with file context and git diffs close at hand.</p>
                <button className="primary-button" type="button" onClick={openProject}>
                  <FolderOpen size={16} />
                  Open Project
                </button>
              </section>
            ) : activeTab && activeTabWorkspace ? (
              <div className="tab-surface">
                {terminalTabs.map((tab) => {
                  const workspace = workspaces.find((item) => item.id === tab.workspaceId);
                  if (!workspace) return null;
                  return (
                    <TerminalPanel
                      key={tab.id}
                      tab={tab}
                      workspace={workspace}
                      active={tab.id === activeTabId}
                    />
                  );
                })}
                {activeTab.type === "file" ? <FileEditor tab={activeTab} workspace={activeTabWorkspace} /> : null}
                {activeTab.type === "diff" ? <DiffViewer tab={activeTab} workspace={activeTabWorkspace} /> : null}
                {activeTab.type === "context-preview" ? <ContextPreview /> : null}
              </div>
            ) : (
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
                  <button className="primary-button" type="button" onClick={() => createTerminal(activeWorkspace.id)}>
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
