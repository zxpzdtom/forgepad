import http from "node:http";
import { URL } from "node:url";
import { BrowserWindow, Notification } from "electron";
import { IPC } from "@shared/ipc";
import { mapEventToStatus } from "@shared/agent-lifecycle";
import type { AgentStatus, AgentStatusUpdate } from "@shared/agent-lifecycle";

export class HookServer {
  private server: http.Server | null = null;
  private _port = 0;

  get port(): number {
    return this._port;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address();
        this._port = typeof addr === "object" && addr ? addr.port : 0;
        console.log(`[HookServer] listening on 127.0.0.1:${this._port}`);
        resolve(this._port);
      });

      this.server.on("error", reject);
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

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      if (url.pathname === "/hook/notify") {
        const eventType = url.searchParams.get("eventType") ?? "";
        const ptyId = url.searchParams.get("ptyId") ?? "";

        if (!ptyId || !eventType) {
          res.writeHead(400);
          res.end("missing params");
          return;
        }

        const status = mapEventToStatus(eventType);
        if (status) {
          this.broadcastStatusUpdate({ ptyId, status });
        }

        res.writeHead(200);
        res.end("ok");
        return;
      }

      if (url.pathname === "/health") {
        res.writeHead(200);
        res.end("ok");
        return;
      }

      res.writeHead(404);
      res.end("not found");
    } catch (error) {
      console.error("[HookServer] error:", error);
      res.writeHead(500);
      res.end("error");
    }
  }

  private broadcastStatusUpdate(update: AgentStatusUpdate): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send(IPC.AGENT_STATUS_UPDATE, update);
      }
    }

    this.showNotification(update.ptyId, update.status);
  }

  private showNotification(ptyId: string, status: AgentStatus): void {
    if (status !== "review" && status !== "permission") return;

    // Skip notification if the app window is focused
    const focusedWin = BrowserWindow.getFocusedWindow();
    if (focusedWin) return;

    const title = status === "review" ? "Agent completed" : "Agent needs input";
    const body =
      status === "review"
        ? "The agent has finished its task."
        : "The agent is waiting for your approval.";

    const notification = new Notification({ title, body });
    notification.on("click", () => {
      // Focus the main window and tell the renderer to switch to this agent tab
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        if (!win.webContents.isDestroyed()) {
          win.webContents.send(IPC.AGENT_FOCUS_TAB, ptyId);
        }
      }
    });
    notification.show();
  }
}
