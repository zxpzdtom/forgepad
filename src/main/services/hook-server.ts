import http from 'node:http';
import { URL } from 'node:url';
import type { AgentStatusUpdate } from '@shared/agent-lifecycle';
import { mapEventToStatus } from '@shared/agent-lifecycle';
import { IPC } from '@shared/ipc';
import { BrowserWindow } from 'electron';

export class HookServer {
  private server: http.Server | null = null;
  private _port = 0;

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
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
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
    // Desktop notifications and sounds are now handled by the renderer
    // (useAgentLifecycle hook) based on user settings.
  }
}
