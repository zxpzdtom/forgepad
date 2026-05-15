import type { AgentStatusUpdate } from "../../src/shared/agent-lifecycle";
import type {
  AgentCompletionData,
  AgentUserPromptData,
  AskUserQuestionItem,
  PendingPermission,
  PermissionSuggestion,
} from "../../src/shared/types";

export type BackendEvent =
  | {
      type: "backend.ready";
      pid: number;
      startedAt: number;
      hookPort: number;
      rendererUrl?: string;
    }
  | { type: "backend.log"; level: "info" | "warn" | "error"; message: string }
  | { type: "agent.statusUpdate"; payload: AgentStatusUpdate }
  | { type: "agent.renameTab"; payload: { ptyId: string; title: string } }
  | { type: "agent.permissionRequest"; payload: PendingPermission }
  | { type: "agent.permissionClear"; payload: { ptyId: string } }
  | { type: "agent.userPrompt"; payload: AgentUserPromptData }
  | { type: "agent.completion"; payload: AgentCompletionData };

export type BackendCommand =
  | {
      type: "permission.resolve";
      ptyId: string;
      decision: "allow" | "deny" | "allowAlways" | "answer";
      answers?: Record<string, string>;
    }
  | {
      type: "settings.update";
      settings: {
        autoGenerateTabTitle?: boolean;
        tabTitlePromptTemplate?: string;
        renameOnFirstMessageOnly?: boolean;
      };
    }
  | { type: "backend.shutdown" };

export type PermissionHold = {
  permissionSuggestions?: PermissionSuggestion[];
  questions?: AskUserQuestionItem[];
  toolInput?: Record<string, unknown>;
};

export function emit(event: BackendEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

export function log(level: "info" | "warn" | "error", message: string): void {
  emit({ type: "backend.log", level, message });
}
