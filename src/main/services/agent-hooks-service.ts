import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MARKER = "__forgepad_managed__";

const NOTIFY_SCRIPT = `#!/usr/bin/env bash
# ${MARKER} — DO NOT EDIT. Managed by ForgePad.

# Check both production and dev session directories so a single hook
# script works regardless of which ForgePad instance spawned the PTY.
SESSIONS_DIRS=("$HOME/.forgepad/sessions" "$HOME/.forgepad-dev/sessions")

# Read JSON input: Claude Code pipes to stdin, Codex passes as $1
if [ -n "\${1:-}" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

SOURCE="\${FORGEPAD_HOOK_SOURCE:-}"

# Extract event type from JSON
# Claude Code: "hook_event_name" field
EVENT_TYPE=$(echo "$INPUT" | grep -oE '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"' || true)
if [ -n "$EVENT_TYPE" ] && [ -z "$SOURCE" ]; then
  SOURCE="claude"
fi

# Codex fallback: "type" field
if [ -z "$EVENT_TYPE" ]; then
  CODEX_TYPE=$(echo "$INPUT" | grep -oE '"type"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"' || true)
  if [ -n "$CODEX_TYPE" ] && [ -z "$SOURCE" ]; then
    SOURCE="codex"
  fi
  case "\${CODEX_TYPE:-}" in
    agent-turn-complete|task_complete) EVENT_TYPE="Stop" ;;
    task_started)                      EVENT_TYPE="Start" ;;
    exec_approval_request|apply_patch_approval_request|request_user_input) EVENT_TYPE="PermissionRequest" ;;
  esac
fi

[ -z "$EVENT_TYPE" ] && exit 0

# Extract session_id from JSON to look up ForgePad port & ptyId
SESSION_ID=$(echo "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '"[^"]*"$' | tr -d '"' || true)

# Look for session file in all known directories. Claude can be launched with
# a preassigned session id, while Codex currently relies on inherited ForgePad
# env vars until its own session id is discovered.
SESSION_FILE=""
if [ -n "$SESSION_ID" ]; then
  for DIR in "\${SESSIONS_DIRS[@]}"; do
    if [ -f "$DIR/$SESSION_ID.json" ]; then
      SESSION_FILE="$DIR/$SESSION_ID.json"
      break
    fi
  done
fi
PORT=""
PTY_ID=""
if [ -n "$SESSION_FILE" ]; then
  PORT=$(grep -oE '"port"[[:space:]]*:[[:space:]]*[0-9]+' "$SESSION_FILE" | grep -oE '[0-9]+$' || true)
  PTY_ID=$(grep -oE '"ptyId"[[:space:]]*:[[:space:]]*"[^"]*"' "$SESSION_FILE" | grep -oE '"[^"]*"$' | tr -d '"' || true)
fi

if [ -z "$PORT" ]; then
  PORT="\${FORGEPAD_PORT:-}"
fi
if [ -z "$PTY_ID" ]; then
  PTY_ID="\${FORGEPAD_PTY_ID:-}"
fi

[ -z "$PORT" ] || [ -z "$PTY_ID" ] && exit 0

# Callback to ForgePad hook server
if [ "\${EVENT_TYPE}" = "UserPromptSubmit" ]; then
  if [ "\${SOURCE}" = "codex" ]; then
    # Codex validates UserPromptSubmit stdout strictly and does not accept
    # Claude's sessionTitle field, so keep ForgePad's response out of stdout.
    curl -s -m 5 -X POST \\
      -H "Content-Type: application/json" \\
      -d "\${INPUT}" \\
      "http://127.0.0.1:\${PORT}/hook/notify?eventType=\${EVENT_TYPE}&ptyId=\${PTY_ID}&source=\${SOURCE}" \\
      >/dev/null 2>&1 || true
    printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit"}}'
  else
    # POST full JSON body and output response so Claude Code can read sessionTitle
    curl -s -m 5 -X POST \\
      -H "Content-Type: application/json" \\
      -d "\${INPUT}" \\
      "http://127.0.0.1:\${PORT}/hook/notify?eventType=\${EVENT_TYPE}&ptyId=\${PTY_ID}&source=\${SOURCE}" \\
      || true
  fi
elif [ "\${EVENT_TYPE}" = "PermissionRequest" ]; then
  # POST full JSON body and wait for approval decision (up to 2 min).
  # The hook server holds the connection open until the user clicks
  # Allow/Deny in the pet approval UI. The response is echoed to stdout
  # so Claude Code can read the decision.
  RESPONSE=$(curl -s -m 120 -X POST \\
    -H "Content-Type: application/json" \\
    -d "\${INPUT}" \\
    "http://127.0.0.1:\${PORT}/hook/notify?eventType=\${EVENT_TYPE}&ptyId=\${PTY_ID}&source=\${SOURCE}" \\
    || true)
  [ -n "$RESPONSE" ] && echo "$RESPONSE"
elif [ "\${EVENT_TYPE}" = "Stop" ] || [ "\${EVENT_TYPE}" = "StopFailure" ]; then
  # POST full JSON body so ForgePad can extract AI response for completion card
  curl -s -m 5 -X POST \\
    -H "Content-Type: application/json" \\
    -d "\${INPUT}" \\
    "http://127.0.0.1:\${PORT}/hook/notify?eventType=\${EVENT_TYPE}&ptyId=\${PTY_ID}&source=\${SOURCE}" \\
    >/dev/null 2>&1 || true
else
  # Fire-and-forget GET for other events
  curl -s -m 2 \\
    "http://127.0.0.1:\${PORT}/hook/notify?eventType=\${EVENT_TYPE}&ptyId=\${PTY_ID}&source=\${SOURCE}" \\
    >/dev/null 2>&1 || true
fi

exit 0
`;

const CLAUDE_HOOK_COMMAND = `[ -f "$HOME/.forgepad/hooks/notify.sh" ] && FORGEPAD_HOOK_SOURCE=claude "$HOME/.forgepad/hooks/notify.sh" || true`;
const CODEX_HOOK_COMMAND = `[ -f "$HOME/.forgepad/hooks/notify.sh" ] && FORGEPAD_HOOK_SOURCE=codex "$HOME/.forgepad/hooks/notify.sh" || true`;

const CLAUDE_HOOK_EVENTS = [
  "SessionStart", // session 开始或恢复 → idle (不再设为 working，避免 --resume 假 spinner)
  "UserPromptSubmit", // 用户提交 prompt → working
  "PreToolUse", // 工具调用前 → working
  "PostToolUse", // 工具调用成功后 → working (确认仍在执行)
  "PostToolUseFailure", // 工具调用失败后 → working (agent 仍在处理)
  "SubagentStart", // 子 agent 启动 → working
  "SubagentStop", // 子 agent 完成 → working (父级继续)
  "Notification", // 通知事件 → permission (通常是权限相关)
  "PermissionRequest", // 权限请求 → permission
  "Stop", // agent 完成响应 → review
  "SessionEnd", // session 结束 → idle
];

const CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
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
    // Always write the hook script to ~/.forgepad/hooks/ (never the -dev dir)
    // because ~/.claude/settings.json is shared between dev and prod.
    // The script itself checks both session directories.
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
    await this.injectCodexHooks();
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
            command: `${CLAUDE_HOOK_COMMAND} # ${MARKER}`,
          },
        ],
      });
    }

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }

  private async injectCodexHooks(): Promise<void> {
    const hooksPath = path.join(os.homedir(), ".codex", "hooks.json");
    const configPath = path.join(os.homedir(), ".codex", "config.toml");
    const config = await this.readJsonSafe(hooksPath);

    if (
      !config.hooks ||
      typeof config.hooks !== "object" ||
      Array.isArray(config.hooks)
    ) {
      config.hooks = {};
    }

    const hooks = config.hooks as Record<string, JsonValue>;

    for (const event of CODEX_HOOK_EVENTS) {
      if (!Array.isArray(hooks[event])) {
        hooks[event] = [];
      }

      const eventHooks = hooks[event] as Array<Record<string, JsonValue>>;
      hooks[event] = eventHooks.filter((h) => {
        if (typeof h.command === "string" && h.command.includes(MARKER)) {
          return false;
        }
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

      (hooks[event] as JsonValue[]).push({
        hooks: [
          {
            type: "command",
            command: `${CODEX_HOOK_COMMAND} # ${MARKER}`,
          },
        ],
      });
    }

    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.writeFile(hooksPath, `${JSON.stringify(config, null, 2)}\n`);
    await this.enableCodexHooksFeature(configPath);
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

  private async enableCodexHooksFeature(configPath: string): Promise<void> {
    let raw = "";
    try {
      raw = await fs.readFile(configPath, "utf-8");
    } catch {
      raw = "";
    }

    const withoutDeprecatedFlag = this.removeTomlSectionKey(
      raw,
      "features",
      "codex_hooks",
    );
    const next = this.setTomlSectionBoolean(
      withoutDeprecatedFlag,
      "features",
      "hooks",
      true,
    );

    if (next !== raw) {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, next);
    }
  }

  private removeTomlSectionKey(raw: string, section: string, key: string): string {
    const lines = raw.split(/\r?\n/);
    const sectionHeader = `[${section}]`;
    const keyPattern = new RegExp(`^\\s*${key}\\s*=`);
    const sectionPattern = /^\s*\[[^\]]+\]\s*$/;

    let inSection = false;
    const nextLines = lines.filter((line) => {
      if (line.trim() === sectionHeader) {
        inSection = true;
        return true;
      }
      if (inSection && sectionPattern.test(line)) {
        inSection = false;
      }
      return !(inSection && keyPattern.test(line));
    });

    return `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
  }

  private setTomlSectionBoolean(
    raw: string,
    section: string,
    key: string,
    value: boolean,
  ): string {
    const lines = raw.split(/\r?\n/);
    const sectionHeader = `[${section}]`;
    const keyPattern = new RegExp(`^\\s*${key}\\s*=`);
    const sectionPattern = /^\s*\[[^\]]+\]\s*$/;
    const valueLine = `${key} = ${value ? "true" : "false"}`;

    let sectionIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trim() === sectionHeader) {
        sectionIndex = i;
        break;
      }
    }

    if (sectionIndex === -1) {
      const trimmed = raw.trimEnd();
      return `${trimmed}${trimmed ? "\n\n" : ""}${sectionHeader}\n${valueLine}\n`;
    }

    for (let i = sectionIndex + 1; i < lines.length; i += 1) {
      if (sectionPattern.test(lines[i])) {
        lines.splice(i, 0, valueLine);
        return `${lines.join("\n").replace(/\n*$/, "")}\n`;
      }
      if (keyPattern.test(lines[i])) {
        lines[i] = valueLine;
        return `${lines.join("\n").replace(/\n*$/, "")}\n`;
      }
    }

    lines.push(valueLine);
    return `${lines.join("\n").replace(/\n*$/, "")}\n`;
  }
}
