import http from 'node:http';
import { URL } from 'node:url';
import type { AgentStatusUpdate } from '@shared/agent-lifecycle';
import { mapEventToStatus } from '@shared/agent-lifecycle';
import { IPC } from '@shared/ipc';
import type { AskUserQuestionItem, PendingPermission, PermissionSuggestion } from '@shared/types';
import { BrowserWindow } from 'electron';
import { sendPetAgentStatus, sendPetPermissionRequest } from '../pet-window';

/** Timeout for held PermissionRequest connections (2 minutes). */
const PERMISSION_TIMEOUT_MS = 120_000;

export class HookServer {
  private server: http.Server | null = null;
  private _port = 0;

  /**
   * Map of ptyId → held HTTP response for PermissionRequest.
   * When a PermissionRequest arrives, we store the response object here
   * instead of replying immediately. The response is sent when the user
   * clicks Allow/Deny in the pet UI, or after a timeout.
   */
  private pendingPermissions = new Map<
    string,
    {
      res: http.ServerResponse;
      timeout: ReturnType<typeof setTimeout>;
      permissionSuggestions?: PermissionSuggestion[];
      questions?: AskUserQuestionItem[];
      /** Original tool_input — needed to echo back in updatedInput (which replaces the entire input). */
      toolInput?: Record<string, unknown>;
    }
  >();

  get port(): number {
    return this._port;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        this._port = typeof addr === 'object' && addr ? addr.port : 0;
        console.log(`[HookServer] listening on 127.0.0.1:${this._port}`);
        resolve(this._port);
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    // Resolve all pending permissions before shutting down
    for (const ptyId of this.pendingPermissions.keys()) {
      this.resolvePermission(ptyId, 'allow');
    }

    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  /**
   * Resolve a pending PermissionRequest by sending the decision back to
   * the held HTTP response. Called from IPC handlers when the user clicks
   * Allow/Deny in the pet approval UI.
   */
  resolvePermission(
    ptyId: string,
    decision: 'allow' | 'deny' | 'allowAlways' | 'answer',
    answers?: Record<string, string>,
  ): void {
    const pending = this.pendingPermissions.get(ptyId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingPermissions.delete(ptyId);

    let body: string;
    if (decision === 'deny') {
      body = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny"}}}';
    } else if (decision === 'answer' && answers) {
      // AskUserQuestion: return selected answers via updatedInput.
      // updatedInput replaces the ENTIRE tool input, so we must echo back
      // the original fields (especially `questions`) alongside `answers`.
      body = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'allow',
            updatedInput: {
              ...(pending.toolInput ?? {}),
              answers,
            },
          },
        },
      });
    } else if (decision === 'allowAlways' && pending.permissionSuggestions?.length) {
      // Echo back the permission suggestions as updatedPermissions so Claude Code
      // persists them as "always allow" rules.
      body = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'allow',
            updatedPermissions: pending.permissionSuggestions,
          },
        },
      });
    } else {
      body = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}';
    }

    try {
      if (!pending.res.writableEnded) {
        pending.res.writeHead(200, { 'Content-Type': 'application/json' });
        pending.res.end(body);
      }
    } catch {
      // Connection may have been closed by the client (timeout, abort)
    }

    // Broadcast that the permission is resolved (clear UI)
    this.broadcastPermissionClear(ptyId);
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (url.pathname === '/hook/notify') {
        const eventType = url.searchParams.get('eventType') ?? '';
        const ptyId = url.searchParams.get('ptyId') ?? '';

        if (!ptyId || !eventType) {
          res.writeHead(400);
          res.end('missing params');
          return;
        }

        const status = mapEventToStatus(eventType);
        if (status) {
          this.broadcastStatusUpdate({ ptyId, status });
        }

        // ── PermissionRequest: hold the connection open ──
        if (eventType === 'PermissionRequest' && req.method === 'POST') {
          const body = await this.readBody(req);
          let toolName = '';
          let toolInput: Record<string, unknown> | undefined;
          let permissionSuggestions: PermissionSuggestion[] | undefined;
          try {
            const json = JSON.parse(body) as Record<string, unknown>;
            // Claude Code sends tool_name / tool_input at top level
            toolName =
              (json.tool_name as string) ??
              (json.toolName as string) ??
              (json.tool as string) ??
              (json.name as string) ??
              '';
            const rawInput =
              json.tool_input ?? json.toolInput ?? json.input ?? json.arguments ?? json.args ?? json.params;
            if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
              toolInput = rawInput as Record<string, unknown>;
            }
            // Extract permission suggestions (e.g. "always allow this tool" options)
            if (Array.isArray(json.permission_suggestions)) {
              permissionSuggestions = json.permission_suggestions as PermissionSuggestion[];
            }
          } catch {
            // ignore parse errors
          }

          // Parse AskUserQuestion questions from tool_input
          let questions: AskUserQuestionItem[] | undefined;
          if (toolName === 'AskUserQuestion' && toolInput) {
            const rawQuestions = toolInput.questions;
            if (Array.isArray(rawQuestions)) {
              questions = (rawQuestions as Array<Record<string, unknown>>).map((q) => ({
                question: (q.question as string) ?? 'Question',
                header: q.header as string | undefined,
                multiSelect: q.multiSelect as boolean | undefined,
                options: Array.isArray(q.options)
                  ? (q.options as Array<Record<string, unknown> | string>).map((opt) =>
                      typeof opt === 'string'
                        ? { label: opt }
                        : { label: (opt.label as string) ?? '', description: opt.description as string | undefined },
                    )
                  : [],
              }));
            }
          }

          // If there's already a pending permission for this ptyId, deny the old one
          // (same dedup pattern as CodeIsland's mergeDuplicatePermissionRequest)
          this.resolvePermission(ptyId, 'deny');

          // Hold the response open — will be resolved when user clicks Allow/Deny
          const timeout = setTimeout(() => {
            console.log(`[HookServer] PermissionRequest for ${ptyId} timed out, auto-allowing`);
            this.resolvePermission(ptyId, 'allow');
          }, PERMISSION_TIMEOUT_MS);

          this.pendingPermissions.set(ptyId, { res, timeout, permissionSuggestions, questions, toolInput });

          // Handle client disconnect (e.g. Ctrl+C in terminal kills curl)
          res.on('close', () => {
            if (this.pendingPermissions.has(ptyId)) {
              clearTimeout(this.pendingPermissions.get(ptyId)!.timeout);
              this.pendingPermissions.delete(ptyId);
              this.broadcastPermissionClear(ptyId);
            }
          });

          // Broadcast the permission request details to all windows + pet overlay
          this.broadcastPermissionRequest(ptyId, toolName, toolInput, permissionSuggestions, questions);

          // Do NOT respond — the response is held until resolvePermission is called
          return;
        }

        // For UserPromptSubmit: read prompt from POST body, generate tab title
        if (eventType === 'UserPromptSubmit' && req.method === 'POST') {
          const body = await this.readBody(req);
          let prompt = '';
          try {
            const json = JSON.parse(body) as Record<string, unknown>;
            if (typeof json.prompt === 'string') prompt = json.prompt;
          } catch {
            // ignore parse errors
          }

          if (prompt) {
            const title = this.generateTitle(prompt);
            this.broadcastRenameTab(ptyId, title);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                hookSpecificOutput: {
                  hookEventName: 'UserPromptSubmit',
                  sessionTitle: title,
                },
              }),
            );
            return;
          }
        }

        res.writeHead(200);
        res.end('ok');
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200);
        res.end('ok');
        return;
      }

      res.writeHead(404);
      res.end('not found');
    } catch (error) {
      console.error('[HookServer] error:', error);
      res.writeHead(500);
      res.end('error');
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', () => resolve(''));
    });
  }

  private generateTitle(prompt: string): string {
    const cleaned = prompt.trim().replace(/\s+/g, ' ');
    if (cleaned.length <= 30) return cleaned;
    const truncated = cleaned.slice(0, 30);
    const lastSpace = truncated.lastIndexOf(' ');
    return `${lastSpace > 10 ? truncated.slice(0, lastSpace) : truncated}…`;
  }

  private broadcastRenameTab(ptyId: string, title: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send(IPC.AGENT_RENAME_TAB, { ptyId, title });
      }
    }
  }

  private broadcastStatusUpdate(update: AgentStatusUpdate): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send(IPC.AGENT_STATUS_UPDATE, update);
      }
    }
    // Forward to the pet overlay window so it can animate per agent status
    sendPetAgentStatus(update.status);
    // Desktop notifications and sounds are now handled by the renderer
    // (useAgentLifecycle hook) based on user settings.
  }

  /** Broadcast a PermissionRequest with tool details to all windows + pet overlay. */
  private broadcastPermissionRequest(
    ptyId: string,
    toolName: string,
    toolInput?: Record<string, unknown>,
    permissionSuggestions?: PermissionSuggestion[],
    questions?: AskUserQuestionItem[],
  ): void {
    const payload: PendingPermission = { ptyId, toolName, toolInput, permissionSuggestions, questions };
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send(IPC.AGENT_PERMISSION_REQUEST, payload);
      }
    }
    sendPetPermissionRequest(ptyId, toolName, toolInput, permissionSuggestions, questions);
  }

  /** Broadcast that a permission request was resolved (clear approval UI). */
  private broadcastPermissionClear(ptyId: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send(IPC.AGENT_PERMISSION_REQUEST, { ptyId, toolName: '', resolved: true });
      }
    }
    // Also clear the pet overlay window
    sendPetPermissionRequest(ptyId, '');
  }
}
