import { useEffect } from "react";
import { useAppStore } from "@renderer/store/app-store";

/**
 * Subscribes to agent status updates and focus-tab events from the main process.
 * Call once at the top level (e.g. App.tsx).
 */
export function useAgentLifecycle(): void {
  useEffect(() => {
    const removeStatusListener = window.forgepad.agent.onStatusUpdate(
      (update) => {
        useAppStore
          .getState()
          .handleAgentStatusUpdate(update.ptyId, update.status);
      },
    );

    const removeFocusListener = window.forgepad.agent.onFocusTab((ptyId) => {
      const state = useAppStore.getState();
      const tab = state.tabs.find(
        (t) => t.type === "terminal" && t.ptyId === ptyId,
      );
      if (tab) {
        state.setActiveTab(tab.id);
        if (tab.workspaceId !== state.activeWorkspaceId) {
          state.setActiveWorkspace(tab.workspaceId);
        }
      }
    });

    const removeRenameListener = window.forgepad.agent.onRenameTab(
      ({ ptyId, title }) => {
        useAppStore.getState().renameTab(ptyId, title);
      },
    );

    return () => {
      removeStatusListener();
      removeFocusListener();
      removeRenameListener();
    };
  }, []);
}
