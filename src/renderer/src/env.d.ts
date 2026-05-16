import type { HostBridgeApi } from '@shared/host-bridge';
import type { AgentStatusUpdate } from '@shared/agent-lifecycle';
import type { AgentCompletionData, AgentUserPromptData, PendingPermission, PetCommand, PetSettings, PetStageSnapshot } from '@shared/types';

declare const __FORGEPAD_NATIVE_HOST__: boolean;

type ForgePadPetApi = {
  focusAgent?: (ptyId?: string) => void;
  getStage?: () => Promise<PetStageSnapshot>;
  moveWindow?: (x: number, y: number) => void;
  onAgentStatusUpdate?: (callback: (update: AgentStatusUpdate) => void) => () => void;
  onCommand?: (callback: (command: PetCommand) => void) => () => void;
  onCompletion?: (callback: (data: AgentCompletionData) => void) => () => void;
  onPermissionRequest?: (callback: (data: PendingPermission) => void) => () => void;
  onSettingsChanged?: (callback: (settings: PetSettings) => void) => () => void;
  onUserPrompt?: (callback: (data: AgentUserPromptData) => void) => () => void;
  resizeWindow?: (width: number, height: number) => void;
  sendPermissionDecision?: (
    ptyId: string,
    decision: 'allow' | 'deny' | 'allowAlways' | 'answer',
    answers?: Record<string, string>,
  ) => void;
};

declare global {
  interface Window {
    forgepad: HostBridgeApi;
    forgepadPet?: ForgePadPetApi;
  }
}
