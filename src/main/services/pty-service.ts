import { WebContents } from "electron";
import * as pty from "node-pty";
import { IPC } from "@shared/ipc";

type PtyInstance = {
  process: pty.IPty;
  webContents: WebContents;
  cols: number;
  rows: number;
  replayChunks: string[];
  replayChars: number;
};

const MAX_REPLAY_CHARS = 8_000_000;

function appendReplay(instance: PtyInstance, data: string): void {
  if (!data) return;
  instance.replayChunks.push(data);
  instance.replayChars += data.length;
  while (instance.replayChars > MAX_REPLAY_CHARS && instance.replayChunks.length > 0) {
    const removed = instance.replayChunks.shift();
    instance.replayChars -= removed?.length ?? 0;
  }
}

export class PtyService {
  private ptys = new Map<string, PtyInstance>();
  private nextId = 0;

  create(
    worktreePath: string,
    webContents: WebContents,
    shell?: string,
    command?: string,
    extraEnv?: Record<string, string>,
  ): string {
    const id = `pty-${++this.nextId}`;
    const file = command?.trim() || shell?.trim() || process.env.SHELL || "/bin/zsh";
    const proc = pty.spawn(file, [], {
      name: "xterm-256color",
      cols: 100,
      rows: 30,
      cwd: worktreePath,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORGEPAD_PTY_ID: id,
        FORGEPAD_CONTEXT_DIR: ".forgepad/context",
        ...extraEnv,
      } as Record<string, string>,
    });

    const instance: PtyInstance = {
      process: proc,
      webContents,
      cols: 100,
      rows: 30,
      replayChunks: [],
      replayChars: 0,
    };

    proc.onData((data) => {
      appendReplay(instance, data);
      if (!instance.webContents.isDestroyed()) {
        instance.webContents.send(`${IPC.PTY_DATA}:${id}`, data);
      }
    });

    proc.onExit((event) => {
      this.ptys.delete(id);
      if (!instance.webContents.isDestroyed()) {
        instance.webContents.send(`${IPC.PTY_EXIT}:${id}`, event.exitCode, event.signal);
      }
    });

    this.ptys.set(id, instance);
    return id;
  }

  write(id: string, data: string): void {
    this.ptys.get(id)?.process.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const instance = this.ptys.get(id);
    if (!instance) return;
    instance.cols = cols;
    instance.rows = rows;
    instance.process.resize(cols, rows);
  }

  destroy(id: string): void {
    const instance = this.ptys.get(id);
    if (!instance) return;
    instance.process.kill();
    this.ptys.delete(id);
  }

  reattach(id: string, webContents: WebContents): { replay: string; alive: boolean } {
    const instance = this.ptys.get(id);
    if (!instance) return { replay: "", alive: false };
    instance.webContents = webContents;
    return { replay: instance.replayChunks.join(""), alive: true };
  }
}

