import { useEffect, useRef } from 'react';
import { BUILTIN_SOUNDS } from '@renderer/lib/builtin-sounds';
import { useAppStore } from '@renderer/store/app-store';
import type { AgentStatus } from '@shared/agent-lifecycle';

/**
 * Subscribes to agent status updates and focus-tab events from the main process.
 * Also handles notification sounds and desktop notifications based on user settings.
 * Call once at the top level (e.g. App.tsx).
 */
export function useAgentLifecycle(): void {
  // Track already-notified (ptyId:status) pairs to avoid duplicates
  const notifiedRef = useRef<Set<string>>(new Set());
  // Shared AudioContext for built-in sound synthesis
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // ─── Sound & notification trigger ───
    const triggerNotification = async (ptyId: string, status: AgentStatus) => {
      const key = `${ptyId}:${status}`;
      if (notifiedRef.current.has(key)) return;

      const state = useAppStore.getState();
      const ns = state.settings.notifications;

      const isAgentDone = status === 'review';
      const isNeedsApproval = status === 'permission';

      if (!isAgentDone && !isNeedsApproval) return;

      // Check notification eligibility
      const shouldSound =
        ns.enabled && ((isAgentDone && ns.notifyOnAgentDone) || (isNeedsApproval && ns.notifyOnAgentNeedsApproval));

      const shouldDesktop =
        ns.desktopNotificationEnabled &&
        ((isAgentDone && ns.notifyOnAgentDone) || (isNeedsApproval && ns.notifyOnAgentNeedsApproval));

      if (!shouldSound && !shouldDesktop) return;

      // Check if app is focused
      let appFocused = false;
      try {
        appFocused = await window.forgepad.app2.isFocused();
      } catch {
        appFocused = document.hasFocus();
      }

      // Mark as notified to prevent duplicate triggers
      notifiedRef.current.add(key);
      // Auto-clear dedup after 30s so future state changes for same ptyId can trigger again
      setTimeout(() => notifiedRef.current.delete(key), 30_000);

      // ─── Play sound ───
      if (shouldSound && (ns.playWhenAppFocused || !appFocused)) {
        playNotificationSound(ns, audioCtxRef);
      }

      // ─── Desktop notification ───
      if (shouldDesktop && !appFocused) {
        const tab = state.tabs.find((t) => t.type === 'terminal' && t.ptyId === ptyId);
        const tabTitle = tab?.type === 'terminal' ? tab.title : 'Agent';

        const title = isAgentDone ? 'Agent Completed' : 'Agent Needs Input';
        const body = isAgentDone ? `${tabTitle} has finished its task.` : `${tabTitle} is waiting for your approval.`;

        try {
          if (Notification.permission === 'default') {
            await Notification.requestPermission();
          }
          if (Notification.permission === 'granted') {
            const notif = new Notification(title, { body, silent: true });
            notif.onclick = () => {
              // Focus the app window and navigate to the agent tab
              window.forgepad.app2.focusWindow();
              if (tab) {
                const s = useAppStore.getState();
                s.setActiveTab(tab.id);
                if (tab.workspaceId !== s.activeWorkspaceId) {
                  s.setActiveWorkspace(tab.workspaceId);
                }
              }
            };
          }
        } catch {
          // Notifications not supported or blocked; ignore
        }
      }
    };

    const removeStatusListener = window.forgepad.agent.onStatusUpdate((update) => {
      useAppStore.getState().handleAgentStatusUpdate(update.ptyId, update.status);
      // Fire notification asynchronously so it doesn't block the status update
      void triggerNotification(update.ptyId, update.status);
    });

    const removeFocusListener = window.forgepad.agent.onFocusTab((ptyId) => {
      const state = useAppStore.getState();

      // Special signal from pet overlay click: find the most urgent agent tab
      if (ptyId === '__pet_click__') {
        const priorityMap: Record<string, number> = { idle: 0, working: 1, review: 2, permission: 3 };
        const agentTabs = state.tabs.filter(
          (t) => t.type === 'terminal' && t.isAgent && t.workspaceId === state.activeWorkspaceId,
        );
        let bestTab = agentTabs[0];
        let bestPri = -1;
        for (const t of agentTabs) {
          if (t.type !== 'terminal') continue;
          const status = state.agentStatuses[t.ptyId] ?? 'idle';
          const pri = priorityMap[status] ?? 0;
          if (pri > bestPri) {
            bestPri = pri;
            bestTab = t;
          }
        }
        if (bestTab) {
          state.setActiveTab(bestTab.id);
          if (bestTab.workspaceId !== state.activeWorkspaceId) {
            state.setActiveWorkspace(bestTab.workspaceId);
          }
        }
        return;
      }

      const tab = state.tabs.find((t) => t.type === 'terminal' && t.ptyId === ptyId);
      if (tab) {
        state.setActiveTab(tab.id);
        if (tab.workspaceId !== state.activeWorkspaceId) {
          state.setActiveWorkspace(tab.workspaceId);
        }
      }
    });

    const removeRenameListener = window.forgepad.agent.onRenameTab(({ ptyId, title }) => {
      useAppStore.getState().renameTab(ptyId, title);
    });

    // Listen for PermissionRequest details (tool name, tool input) from HookServer
    const removePermissionListener = window.forgepad.agent.onPermissionRequest((data) => {
      // If resolved flag is set, clear the pending permission
      if ('resolved' in data && (data as { resolved?: boolean }).resolved) {
        const state = useAppStore.getState();
        if (state.pendingPermission?.ptyId === data.ptyId) {
          state.setPendingPermission(null);
        }
        return;
      }
      // Set the pending permission so the pet approval UI can display it
      useAppStore.getState().setPendingPermission(data);
    });

    return () => {
      removeStatusListener();
      removeFocusListener();
      removeRenameListener();
      removePermissionListener();
    };
  }, []);
}

// ─── Sound playback helper (outside the hook to avoid re-creation) ───

function playNotificationSound(
  ns: ReturnType<typeof useAppStore.getState>['settings']['notifications'],
  audioCtxRef: React.MutableRefObject<AudioContext | null>,
) {
  const volume = ns.volume / 100;

  // Try custom sound
  const custom = ns.customSounds.find((s) => s.id === ns.selectedSoundId);
  if (custom?.dataUrl) {
    try {
      const audio = new Audio(custom.dataUrl);
      audio.volume = volume;
      audio.play().catch(() => {});
    } catch {
      // Ignore
    }
    return;
  }

  // Try built-in sound
  const builtin = BUILTIN_SOUNDS.find((s) => s.id === ns.selectedSoundId) ?? BUILTIN_SOUNDS[0];
  if (!builtin) return;

  try {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    const doPlay = () => builtin.play(ctx, volume);
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(doPlay)
        .catch(() => {});
    } else {
      doPlay();
    }
  } catch {
    // Web Audio not supported
  }
}
