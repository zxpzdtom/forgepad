import { WebContents } from "electron";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as pty from "node-pty";
import { IPC } from "@shared/ipc";

const SESSIONS_DIR = join(homedir(), ".forgepad", "sessions");

type PtyInstance = {
  process: pty.IPty;
  webContents: WebContents;
  cols: number;
  rows: number;
  replayChunks: string[];
  replayChars: number;
};

const MAX_REPLAY_CHARS = 8_000_000;
const FALLBACK_PATH =
  "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

function appendReplay(instance: PtyInstance, data: string): void {
  if (!data) return;
  instance.replayChunks.push(data);
  instance.replayChars += data.length;
  while (
    instance.replayChars > MAX_REPLAY_CHARS &&
    instance.replayChunks.length > 0
  ) {
    const removed = instance.replayChunks.shift();
    instance.replayChars -= removed?.length ?? 0;
  }
}

function splitCommand(input: string): string[] {
  return (
    input
      .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
      ?.map((part) => part.replace(/^(['"])(.*)\1$/, "$2")) ?? []
  );
}

function defaultShellPath(): string {
  const candidates = [
    process.env.SHELL,
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate)) ?? "/bin/sh";
}

function resolveShell(shell?: string): { file: string; args: string[] } {
  const parts = shell?.trim() ? splitCommand(shell.trim()) : [];
  const [file, ...args] = parts.length > 0 ? parts : [defaultShellPath()];
  return { file, args };
}

export class PtyService {
  private ptys = new Map<string, PtyInstance>();
  private nextId = 0;
  private hookPort = 0;

  setHookPort(port: number): void {
    this.hookPort = port;
  }

  create(
    worktreePath: string,
    webContents: WebContents,
    shell?: string,
    command?: string,
    extraEnv?: Record<string, string>,
  ): string {
    const id = `pty-${++this.nextId}`;
    const shellConfig = resolveShell(shell);
    const commandText = command?.trim();
    const args = commandText
      ? [...shellConfig.args, "-lc", commandText]
      : shellConfig.args;
    const env = {
      ...process.env,
      PATH: process.env.PATH
        ? `${process.env.PATH}:${FALLBACK_PATH}`
        : FALLBACK_PATH,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      FORGEPAD_PTY_ID: id,
      FORGEPAD_CONTEXT_DIR: ".forgepad/context",
      FORGEPAD_AGENT_COMMAND: commandText ?? "",
      ...(this.hookPort > 0 ? { FORGEPAD_PORT: String(this.hookPort) } : {}),
      ...extraEnv,
    } as Record<string, string>;

    let proc: pty.IPty;
    try {
      proc = pty.spawn(shellConfig.file, args, {
        name: "xterm-256color",
        cols: 100,
        rows: 30,
        cwd: worktreePath,
        env,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      throw new Error(
        `Failed to start terminal with ${shellConfig.file}: ${detail}`,
      );
    }

    const instance: PtyInstance = {
      process: proc,
      webContents,
      cols: 100,
      rows: 30,
      replayChunks: [],
      replayChars: 0,
    };

    // Write session mapping file so hook scripts can resolve port + ptyId
    const sessionId = extraEnv?.FORGEPAD_SESSION_ID;
    let sessionFile: string | null = null;
    if (sessionId && this.hookPort > 0) {
      try {
        mkdirSync(SESSIONS_DIR, { recursive: true });
        sessionFile = join(SESSIONS_DIR, `${sessionId}.json`);
        writeFileSync(
          sessionFile,
          JSON.stringify({ port: this.hookPort, ptyId: id }),
        );
      } catch {
        // Non-critical — hooks won't fire but PTY still works
      }
    }

    proc.onData((data) => {
      appendReplay(instance, data);
      if (!instance.webContents.isDestroyed()) {
        instance.webContents.send(`${IPC.PTY_DATA}:${id}`, data);
      }
    });

    proc.onExit((event) => {
      this.ptys.delete(id);
      // Clean up session mapping file
      if (sessionFile) {
        try {
          unlinkSync(sessionFile);
        } catch {
          /* ignore */
        }
      }
      if (!instance.webContents.isDestroyed()) {
        instance.webContents.send(
          `${IPC.PTY_EXIT}:${id}`,
          event.exitCode,
          event.signal,
        );
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

  reattach(
    id: string,
    webContents: WebContents,
  ): { replay: string; alive: boolean } {
    const instance = this.ptys.get(id);
    if (!instance) return { replay: "", alive: false };
    instance.webContents = webContents;
    return { replay: instance.replayChunks.join(""), alive: true };
  }
}
