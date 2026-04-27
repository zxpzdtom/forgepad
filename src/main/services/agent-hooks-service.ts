import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

const MARKER = "__forgepad_managed__";

const NOTIFY_SCRIPT = `#!/usr/bin/env bash
# ${MARKER} — DO NOT EDIT. Managed by ForgePad.

SESSIONS_DIR="$HOME/.forgepad/sessions"

# Read JSON input: Claude Code pipes to stdin, Codex passes as $1
if [ -n "\${1:-}" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

# Extract event type from JSON
# Claude Code: "hook_event_name" field
EVENT_TYPE=$(echo "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"' || true)

# Codex fallback: "type" field
if [ -z "$EVENT_TYPE" ]; then
  CODEX_TYPE=$(echo "$INPUT" | grep -oE '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"' || true)
  case "\${CODEX_TYPE:-}" in
    agent-turn-complete|task_complete) EVENT_TYPE="Stop" ;;
    task_started)                      EVENT_TYPE="Start" ;;
    exec_approval_request|apply_patch_approval_request|request_user_input) EVENT_TYPE="PermissionRequest" ;;
  esac
fi

[ -z "$EVENT_TYPE" ] && exit 0

# Extract session_id from JSON to look up ForgePad port & ptyId
SESSION_ID=$(echo "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"' || true)
[ -z "$SESSION_ID" ] && exit 0

SESSION_FILE="$SESSIONS_DIR/$SESSION_ID.json"
[ -f "$SESSION_FILE" ] || exit 0

PORT=$(grep -oE '"port"[[:space:]]*:[[:space:]]*[0-9]+' "$SESSION_FILE" | grep -oE '[0-9]+$' || true)
PTY_ID=$(grep -oE '"ptyId"[[:space:]]*:[[:space:]]*"[^"]*"' "$SESSION_FILE" | grep -oE '"[^"]*"$' | tr -d '"' || true)

[ -z "$PORT" ] || [ -z "$PTY_ID" ] && exit 0

# Fire-and-forget callback to ForgePad hook server
curl -s -m 2 \\
  "http://127.0.0.1:\${PORT}/hook/notify?eventType=\${EVENT_TYPE}&ptyId=\${PTY_ID}" \\
  >/dev/null 2>&1 || true

exit 0
`;

const HOOK_COMMAND = `[ -f "$HOME/.forgepad/hooks/notify.sh" ] && "$HOME/.forgepad/hooks/notify.sh" || true`;

const CLAUDE_HOOK_EVENTS = [
  "UserPromptSubmit",
  "Stop",
  "PermissionRequest",
  "PreToolUse",
];

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export class AgentHooksService {
  private notifyScriptPath: string;

  constructor() {
    this.notifyScriptPath = path.join(
      os.homedir(),
      ".forgepad",
      "hooks",
      "notify.sh",
    );
  }

  /** Call once at startup. Idempotent. */
  async install(): Promise<void> {
    await this.writeNotifyScript();
    await this.injectClaudeCodeHooks();
    // Codex hook injection can be added when needed
  }

  private async writeNotifyScript(): Promise<void> {
    const dir = path.dirname(this.notifyScriptPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.notifyScriptPath, NOTIFY_SCRIPT, { mode: 0o755 });
  }

  private async injectClaudeCodeHooks(): Promise<void> {
    const configPath = path.join(os.homedir(), ".claude", "settings.json");
    const config = await this.readJsonSafe(configPath);

    // Ensure hooks object
    if (
      !config.hooks ||
      typeof config.hooks !== "object" ||
      Array.isArray(config.hooks)
    ) {
      config.hooks = {};
    }

    const hooks = config.hooks as Record<string, JsonValue>;

    for (const event of CLAUDE_HOOK_EVENTS) {
      // Ensure array for this event
      if (!Array.isArray(hooks[event])) {
        hooks[event] = [];
      }

      const eventHooks = hooks[event] as Array<Record<string, JsonValue>>;

      // Remove existing ForgePad-managed entries (idempotent)
      // Check both old flat format { type, command } and new nested format { matcher, hooks: [...] }
      hooks[event] = eventHooks.filter((h) => {
        // Old flat format: { type, command }
        if (typeof h.command === "string" && h.command.includes(MARKER))
          return false;
        // New nested format: { matcher, hooks: [{ type, command }] }
        if (Array.isArray(h.hooks)) {
          return !h.hooks.some(
            (inner) =>
              typeof inner === "object" &&
              inner !== null &&
              "command" in inner &&
              typeof (inner as Record<string, JsonValue>).command ===
                "string" &&
              ((inner as Record<string, JsonValue>).command as string).includes(
                MARKER,
              ),
          );
        }
        return true;
      });

      // Add our hook entry using Claude Code's required format:
      // { matcher: "...", hooks: [{ type: "command", command: "..." }] }
      (hooks[event] as JsonValue[]).push({
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `${HOOK_COMMAND} # ${MARKER}`,
          },
        ],
      });
    }

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  }

  private async readJsonSafe(
    filePath: string,
  ): Promise<Record<string, JsonValue>> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, JsonValue>;
      }
      return {};
    } catch {
      return {};
    }
  }
}
