import readline from "node:readline";
import { BackendHookServer } from "./hook-server";
import { emit, log, type BackendCommand } from "./protocol";

const hookServer = new BackendHookServer();
const hookPort = await hookServer.start();
const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});

emit({
  type: "backend.ready",
  pid: process.pid,
  startedAt: Date.now(),
  hookPort,
  rendererUrl: process.env.FORGEPAD_RENDERER_DIR
    ? `http://127.0.0.1:${hookPort}/index.html`
    : undefined,
});

if (process.env.FORGEPAD_BACKEND_SMOKE === "1") {
  await shutdown();
}

input.on("line", (line) => {
  try {
    const command = JSON.parse(line) as BackendCommand;
    handleCommand(command);
  } catch (error) {
    log("warn", `ignored invalid backend command: ${String(error)}`);
  }
});

function handleCommand(command: BackendCommand): void {
  switch (command.type) {
    case "permission.resolve":
      hookServer.resolvePermission(
        command.ptyId,
        command.decision,
        command.answers,
      );
      return;
    case "settings.update":
      hookServer.updateSettings(command.settings);
      return;
    case "backend.shutdown":
      void shutdown();
      return;
  }
}

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});

async function shutdown(): Promise<void> {
  log("info", "backend shutting down");
  input.close();
  await hookServer.stop();
  process.exit(0);
}
