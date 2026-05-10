import type { AgentCompletionData, AgentUserPromptData } from '@shared/types';
import type { AgentStatusUpdate } from '@shared/agent-lifecycle';
import type { PendingPermission, PetCommand, PetSettings, PetStageSnapshot } from '@shared/types';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const noopUnlisten = () => {};

function onEvent<T>(event: string, callback: (payload: T) => void) {
  let active = true;
  let unlisten: (() => void) | undefined;
  listen<T>(event, (evt) => {
    if (active) callback(evt.payload);
  })
    .then((fn) => {
      if (active) unlisten = fn;
      else fn();
    })
    .catch(() => {});
  return () => {
    active = false;
    unlisten?.();
  };
}

const api = {
  onSettingsChanged: (callback: (settings: PetSettings) => void) => onEvent<PetSettings>('pet:settings-changed', callback),
  onAgentStatusUpdate: (callback: (update: AgentStatusUpdate) => void) => onEvent<AgentStatusUpdate>('pet:agent-status-update', callback),
  onUserPrompt: (callback: (data: AgentUserPromptData) => void) => onEvent<AgentUserPromptData>('agent:user-prompt', callback),
  onCompletion: (callback: (data: AgentCompletionData) => void) => onEvent<AgentCompletionData>('agent:completion', callback),
  onPermissionRequest: (callback: (data: PendingPermission) => void) => onEvent<PendingPermission>('pet:permission-request', callback),
  onCommand: (callback: (command: PetCommand) => void) => onEvent<PetCommand>('pet:command', callback),
  sendPermissionDecision: (_ptyId: string, _decision: 'allow' | 'deny' | 'allowAlways' | 'answer', _answers?: Record<string, string>) => {},
  moveWindow: (x: number, y: number) => { void invoke('pet_move_window', { x, y }); },
  getStage: () => invoke<PetStageSnapshot>('pet_get_stage'),
  resizeWindow: (width: number, height: number) => { void invoke('pet_resize_window', { width, height }); },
  focusAgent: (ptyId?: string) => { void invoke('pet_focus_agent', { ptyId }); },
};

if ('__TAURI_INTERNALS__' in window && !window.forgepadPet) {
  window.forgepadPet = api;
}

export type TauriForgePadPetApi = typeof api;
