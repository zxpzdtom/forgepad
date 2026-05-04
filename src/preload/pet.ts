import { IPC } from '@shared/ipc';
import type { PetSettings } from '@shared/types';
import { contextBridge, ipcRenderer } from 'electron';

const petApi = {
  onSettingsChanged: (callback: (settings: PetSettings) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: PetSettings) => callback(settings);
    ipcRenderer.on(IPC.PET_SETTINGS_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.PET_SETTINGS_CHANGED, handler);
  },
  /** Move the pet window to screen coordinates (x, y). */
  moveWindow: (x: number, y: number) => {
    ipcRenderer.send(IPC.PET_MOVE_WINDOW, x, y);
  },
};

contextBridge.exposeInMainWorld('forgepadPet', petApi);

export type ForgePadPetApi = typeof petApi;
