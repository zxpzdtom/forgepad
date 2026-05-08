import { IPC } from '@shared/ipc';
import type { AgentStatusUpdate } from '@shared/agent-lifecycle';
import type {
  AgentCompletionData,
  AgentUserPromptData,
  PendingPermission,
  PetCommand,
  PetSettings,
  PetStageSnapshot,
} from '@shared/types';
import { contextBridge, ipcRenderer } from 'electron';

const petApi = {
  onSettingsChanged: (callback: (settings: PetSettings) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: PetSettings) => callback(settings);
    ipcRenderer.on(IPC.PET_SETTINGS_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC.PET_SETTINGS_CHANGED, handler);
    };
  },
  /** Subscribe to agent lifecycle status updates forwarded from the main window. */
  onAgentStatusUpdate: (callback: (update: AgentStatusUpdate) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, update: AgentStatusUpdate) => callback(update);
    ipcRenderer.on(IPC.PET_AGENT_STATUS_UPDATE, handler);
    return () => {
      ipcRenderer.removeListener(IPC.PET_AGENT_STATUS_UPDATE, handler);
    };
  },
  /** Subscribe to user prompt submissions for pet completion cards. */
  onUserPrompt: (callback: (data: AgentUserPromptData) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentUserPromptData) => callback(data);
    ipcRenderer.on(IPC.AGENT_USER_PROMPT, handler);
    return () => {
      ipcRenderer.removeListener(IPC.AGENT_USER_PROMPT, handler);
    };
  },
  /** Subscribe to agent completion payloads for pet completion cards. */
  onCompletion: (callback: (data: AgentCompletionData) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentCompletionData) => callback(data);
    ipcRenderer.on(IPC.AGENT_COMPLETION, handler);
    return () => {
      ipcRenderer.removeListener(IPC.AGENT_COMPLETION, handler);
    };
  },
  /** Subscribe to PermissionRequest details (tool name, tool input). */
  onPermissionRequest: (callback: (data: PendingPermission) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PendingPermission) => callback(data);
    ipcRenderer.on(IPC.PET_PERMISSION_REQUEST, handler);
    return () => {
      ipcRenderer.removeListener(IPC.PET_PERMISSION_REQUEST, handler);
    };
  },
  /** Receive commands forwarded from the main ForgePad window. */
  onCommand: (callback: (command: PetCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: PetCommand) => callback(command);
    ipcRenderer.on(IPC.PET_COMMAND, handler);
    return () => {
      ipcRenderer.removeListener(IPC.PET_COMMAND, handler);
    };
  },
  /** Send a permission decision back to the main process. */
  sendPermissionDecision: (
    ptyId: string,
    decision: 'allow' | 'deny' | 'allowAlways' | 'answer',
    answers?: Record<string, string>,
  ) => {
    ipcRenderer.send(IPC.PET_PERMISSION_DECISION, ptyId, decision, answers);
  },
  /** Move the pet window to screen coordinates (x, y). */
  moveWindow: (x: number, y: number) => {
    ipcRenderer.send(IPC.PET_MOVE_WINDOW, x, y);
  },
  /** Read current screen/window surfaces the pet can play on. */
  getStage: () => ipcRenderer.invoke(IPC.PET_GET_STAGE) as Promise<PetStageSnapshot>,
  /** Resize the pet window (used when approval popup appears/disappears). */
  resizeWindow: (width: number, height: number) => {
    ipcRenderer.send(IPC.PET_RESIZE_WINDOW, width, height);
  },
  /** Focus the main ForgePad window and jump to the most urgent agent tab. */
  focusAgent: (ptyId?: string) => {
    ipcRenderer.send(IPC.PET_FOCUS_AGENT, ptyId);
  },
  /** Ask the main ForgePad window to become the active pet controller. */
  requestControl: () => {
    ipcRenderer.send(IPC.PET_CONTROL_REQUESTED);
  },
};

contextBridge.exposeInMainWorld('forgepadPet', petApi);

export type ForgePadPetApi = typeof petApi;
