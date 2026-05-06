import type { AgentStatus } from '@shared/agent-lifecycle';
import { IPC } from '@shared/ipc';
import type { PendingPermission, PetSettings } from '@shared/types';
import { contextBridge, ipcRenderer } from 'electron';

const petApi = {
  onSettingsChanged: (callback: (settings: PetSettings) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: PetSettings) => callback(settings);
    ipcRenderer.on(IPC.PET_SETTINGS_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.PET_SETTINGS_CHANGED, handler);
  },
  /** Subscribe to agent lifecycle status updates forwarded from the main window. */
  onAgentStatusUpdate: (callback: (status: AgentStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: AgentStatus) => callback(status);
    ipcRenderer.on(IPC.PET_AGENT_STATUS_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC.PET_AGENT_STATUS_UPDATE, handler);
  },
  /** Subscribe to PermissionRequest details (tool name, tool input). */
  onPermissionRequest: (callback: (data: PendingPermission) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PendingPermission) => callback(data);
    ipcRenderer.on(IPC.PET_PERMISSION_REQUEST, handler);
    return () => ipcRenderer.removeListener(IPC.PET_PERMISSION_REQUEST, handler);
  },
  /** Send a permission decision (allow/deny) back to the main process. */
  sendPermissionDecision: (ptyId: string, decision: 'allow' | 'deny') => {
    ipcRenderer.send(IPC.PET_PERMISSION_DECISION, ptyId, decision);
  },
  /** Move the pet window to screen coordinates (x, y). */
  moveWindow: (x: number, y: number) => {
    ipcRenderer.send(IPC.PET_MOVE_WINDOW, x, y);
  },
  /** Resize the pet window (used when approval popup appears/disappears). */
  resizeWindow: (width: number, height: number) => {
    ipcRenderer.send(IPC.PET_RESIZE_WINDOW, width, height);
  },
  /** Focus the main ForgePad window and jump to the most urgent agent tab. */
  focusAgent: () => {
    ipcRenderer.send(IPC.PET_FOCUS_AGENT);
  },
};

contextBridge.exposeInMainWorld('forgepadPet', petApi);

export type ForgePadPetApi = typeof petApi;
