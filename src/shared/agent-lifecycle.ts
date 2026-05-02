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
    case 'SubagentStart':
    case 'SubagentStop': // child finished but parent agent still working
    case 'task_started':
      return 'working';

    // Agent finished a turn
    case 'Stop':
    case 'StopFailure': // API error also means turn ended
    case 'agent-turn-complete':
    case 'task_complete':
      return 'review';

    // Agent needs user input / approval
    case 'PermissionRequest':
    case 'Notification': // notifications are typically permission-related prompts
    case 'exec_approval_request':
    case 'apply_patch_approval_request':
    case 'request_user_input':
      return 'permission';

    // Session ended
    case 'SessionEnd':
      return 'idle';

    default:
      return null;
  }
}
