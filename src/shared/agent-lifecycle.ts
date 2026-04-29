export type AgentStatus = 'idle' | 'working' | 'review' | 'permission';

export type AgentStatusUpdate = {
  ptyId: string;
  status: AgentStatus;
};

/** Map raw agent hook event names → canonical ForgePad status. */
export function mapEventToStatus(eventType: string): AgentStatus | null {
  switch (eventType) {
    // Agent is working
    case 'UserPromptSubmit':
    case 'Start':
    case 'SessionStart':
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'task_started':
      return 'working';

    // Agent finished a turn
    case 'Stop':
    case 'agent-turn-complete':
    case 'task_complete':
      return 'review';

    // Agent needs user input / approval
    case 'PermissionRequest':
    case 'exec_approval_request':
    case 'apply_patch_approval_request':
    case 'request_user_input':
      return 'permission';

    default:
      return null;
  }
}
