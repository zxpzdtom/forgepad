import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { mapEventToStatus } from "../../src/shared/agent-lifecycle";
import type {
  AskUserQuestionItem,
  PermissionSuggestion,
} from "../../src/shared/types";
import { emit, log, type PermissionHold } from "./protocol";

const PERMISSION_TIMEOUT_MS = 120_000;
type AgentHookSource = "claude" | "codex";

type PendingPermission = PermissionHold & {
  res: http.ServerResponse;
  timeout: ReturnType<typeof setTimeout>;
};

export class BackendHookServer {
  private server: http.Server | null = null;
  private _port = 0;
  private readonly rendererDir = process.env.FORGEPAD_RENDERER_DIR
    ? path.resolve(process.env.FORGEPAD_RENDERER_DIR)
    : "";
  private autoGenerateTabTitle = false;
  private tabTitlePromptTemplate = "";
  private renameOnFirstMessageOnly = false;
  private renamedPtyIds = new Set<string>();
  private pendingPermissions = new Map<string, PendingPermission>();

  get port(): number {
    return this._port;
  }

  updateSettings(settings: {
    autoGenerateTabTitle?: boolean;
    tabTitlePromptTemplate?: string;
    renameOnFirstMessageOnly?: boolean;
  }): void {
    if (settings.autoGenerateTabTitle !== undefined) {
      this.autoGenerateTabTitle = settings.autoGenerateTabTitle;
    }
    if (settings.tabTitlePromptTemplate !== undefined) {
      this.tabTitlePromptTemplate = settings.tabTitlePromptTemplate;
    }
    if (settings.renameOnFirstMessageOnly !== undefined) {
      this.renameOnFirstMessageOnly = settings.renameOnFirstMessageOnly;
    }
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server?.address();
        this._port = typeof addr === "object" && addr ? addr.port : 0;
        log("info", `hook server listening on 127.0.0.1:${this._port}`);
        resolve(this._port);
      });

      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    for (const ptyId of this.pendingPermissions.keys()) {
      this.resolvePermission(ptyId, "allow");
    }

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  resolvePermission(
    ptyId: string,
    decision: "allow" | "deny" | "allowAlways" | "answer",
    answers?: Record<string, string>,
  ): void {
    const pending = this.pendingPermissions.get(ptyId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingPermissions.delete(ptyId);

    const body = this.permissionResponseBody(decision, pending, answers);
    try {
      if (!pending.res.writableEnded) {
        pending.res.writeHead(200, { "Content-Type": "application/json" });
        pending.res.end(body);
      }
    } catch {
      // The CLI may have disconnected. The UI still needs the clear event.
    }

    emit({ type: "agent.permissionClear", payload: { ptyId } });
  }

  private permissionResponseBody(
    decision: "allow" | "deny" | "allowAlways" | "answer",
    pending: PermissionHold,
    answers?: Record<string, string>,
  ): string {
    if (decision === "deny") {
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "deny" },
        },
      });
    }

    if (decision === "answer" && answers) {
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: {
            behavior: "allow",
            updatedInput: {
              ...(pending.toolInput ?? {}),
              answers,
            },
          },
        },
      });
    }

    if (decision === "allowAlways" && pending.permissionSuggestions?.length) {
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: {
            behavior: "allow",
            updatedPermissions: pending.permissionSuggestions,
          },
        },
      });
    }

    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      if (url.pathname === "/health") {
        res.writeHead(200);
        res.end("ok");
        return;
      }

      if (!url.pathname.startsWith("/hook/")) {
        if (await this.serveRenderer(url, res)) return;
      }

      if (url.pathname !== "/hook/notify") {
        res.writeHead(404);
        res.end("not found");
        return;
      }

      const eventType = url.searchParams.get("eventType") ?? "";
      const ptyId = url.searchParams.get("ptyId") ?? "";
      const rawSource = url.searchParams.get("source") ?? "";
      const source: AgentHookSource = rawSource === "codex" ? "codex" : "claude";

      if (!ptyId || !eventType) {
        res.writeHead(400);
        res.end("missing params");
        return;
      }

      const status = mapEventToStatus(eventType);
      if (status) {
        emit({ type: "agent.statusUpdate", payload: { ptyId, status } });
      }

      if (eventType === "PermissionRequest" && req.method === "POST") {
        await this.handlePermissionRequest(req, res, ptyId);
        return;
      }

      if (eventType === "UserPromptSubmit" && req.method === "POST") {
        await this.handleUserPromptSubmit(req, res, ptyId, source);
        return;
      }

      if ((eventType === "Stop" || eventType === "StopFailure") && req.method === "POST") {
        await this.handleStop(req, res, ptyId);
        return;
      }

      res.writeHead(200);
      res.end("ok");
    } catch (error) {
      log("error", `hook server error: ${String(error)}`);
      res.writeHead(500);
      res.end("error");
    }
  }

  private async serveRenderer(
    url: URL,
    res: http.ServerResponse,
  ): Promise<boolean> {
    if (!this.rendererDir) return false;

    const requestPath = decodeURIComponent(url.pathname);
    const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
    const candidate = path.resolve(this.rendererDir, relativePath);
    if (!candidate.startsWith(`${this.rendererDir}${path.sep}`) && candidate !== this.rendererDir) {
      res.writeHead(403);
      res.end("forbidden");
      return true;
    }

    const filePath = (await isFile(candidate))
      ? candidate
      : path.join(this.rendererDir, "index.html");
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": filePath.endsWith("index.html")
        ? "no-store"
        : "public, max-age=31536000, immutable",
    });
    res.end(body);
    return true;
  }

  private async handlePermissionRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    ptyId: string,
  ): Promise<void> {
    const body = await this.readBody(req);
    const parsed = parsePermissionBody(body);

    this.resolvePermission(ptyId, "deny");

    const timeout = setTimeout(() => {
      log("warn", `PermissionRequest for ${ptyId} timed out, auto-allowing`);
      this.resolvePermission(ptyId, "allow");
    }, PERMISSION_TIMEOUT_MS);

    this.pendingPermissions.set(ptyId, {
      res,
      timeout,
      permissionSuggestions: parsed.permissionSuggestions,
      questions: parsed.questions,
      toolInput: parsed.toolInput,
    });

    res.on("close", () => {
      if (this.pendingPermissions.has(ptyId)) {
        clearTimeout(this.pendingPermissions.get(ptyId)?.timeout);
        this.pendingPermissions.delete(ptyId);
        emit({ type: "agent.permissionClear", payload: { ptyId } });
      }
    });

    emit({
      type: "agent.permissionRequest",
      payload: {
        ptyId,
        toolName: parsed.toolName,
        toolInput: parsed.toolInput,
        permissionSuggestions: parsed.permissionSuggestions,
        questions: parsed.questions,
      },
    });
  }

  private async handleUserPromptSubmit(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    ptyId: string,
    source: AgentHookSource,
  ): Promise<void> {
    const body = await this.readBody(req);
    const prompt = parsePrompt(body);

    if (!prompt) {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    if (this.renameOnFirstMessageOnly && this.renamedPtyIds.has(ptyId)) {
      emit({ type: "agent.userPrompt", payload: { ptyId, prompt } });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(userPromptSubmitOutput(source));
      return;
    }

    const quickTitle = truncateTitle(prompt);
    emit({ type: "agent.renameTab", payload: { ptyId, title: quickTitle } });
    emit({ type: "agent.userPrompt", payload: { ptyId, prompt } });

    if (this.renameOnFirstMessageOnly) {
      this.renamedPtyIds.add(ptyId);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(userPromptSubmitOutput(source, quickTitle));

    if (this.autoGenerateTabTitle && this.tabTitlePromptTemplate) {
      log("info", "AI title generation is configured but not yet migrated to backend.");
    }
  }

  private async handleStop(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    ptyId: string,
  ): Promise<void> {
    const body = await this.readBody(req);
    const aiMessage = parseAssistantMessage(body);
    if (aiMessage) {
      emit({ type: "agent.completion", payload: { ptyId, aiMessage } });
    }
    this.renamedPtyIds.delete(ptyId);
    res.writeHead(200);
    res.end("ok");
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", () => resolve(""));
    });
  }
}

function parsePermissionBody(body: string): {
  toolName: string;
  toolInput?: Record<string, unknown>;
  permissionSuggestions?: PermissionSuggestion[];
  questions?: AskUserQuestionItem[];
} {
  let toolName = "";
  let toolInput: Record<string, unknown> | undefined;
  let permissionSuggestions: PermissionSuggestion[] | undefined;

  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    toolName =
      (json.tool_name as string) ??
      (json.toolName as string) ??
      (json.tool as string) ??
      (json.name as string) ??
      "";

    const rawInput =
      json.tool_input ??
      json.toolInput ??
      json.input ??
      json.arguments ??
      json.args ??
      json.params;
    if (rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)) {
      toolInput = rawInput as Record<string, unknown>;
    }

    if (Array.isArray(json.permission_suggestions)) {
      permissionSuggestions = json.permission_suggestions as PermissionSuggestion[];
    }
  } catch {
    // ignore parse errors
  }

  return {
    toolName,
    toolInput,
    permissionSuggestions,
    questions: parseAskUserQuestions(toolName, toolInput),
  };
}

function parseAskUserQuestions(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
): AskUserQuestionItem[] | undefined {
  if (toolName !== "AskUserQuestion" || !toolInput) return undefined;
  const rawQuestions = toolInput.questions;
  if (!Array.isArray(rawQuestions)) return undefined;

  return (rawQuestions as Array<Record<string, unknown>>).map((question) => ({
    question: (question.question as string) ?? "Question",
    header: question.header as string | undefined,
    multiSelect: question.multiSelect as boolean | undefined,
    options: Array.isArray(question.options)
      ? (question.options as Array<Record<string, unknown> | string>).map((option) =>
          typeof option === "string"
            ? { label: option }
            : {
                label: (option.label as string) ?? "",
                description: option.description as string | undefined,
              },
        )
      : [],
  }));
}

function parsePrompt(body: string): string {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return (
      (json.prompt as string) ??
      (json.user_prompt as string) ??
      (json.input as string) ??
      (json.message as string) ??
      ""
    );
  } catch {
    return "";
  }
}

function parseAssistantMessage(body: string): string {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    return (
      (json.last_assistant_message as string) ??
      (json.message as string) ??
      (json.text as string) ??
      (json.summary as string) ??
      (json.transcript_summary as string) ??
      ""
    );
  } catch {
    return "";
  }
}

function truncateTitle(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 10) return cleaned;
  const truncated = cleaned.slice(0, 10);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${lastSpace > 4 ? truncated.slice(0, lastSpace) : truncated}…`;
}

function userPromptSubmitOutput(source: AgentHookSource, sessionTitle?: string): string {
  const hookSpecificOutput: Record<string, string> = {
    hookEventName: "UserPromptSubmit",
  };

  if (source === "claude" && sessionTitle) {
    hookSpecificOutput.sessionTitle = sessionTitle;
  }

  return JSON.stringify({ hookSpecificOutput });
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function contentType(filePath: string): string {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}
