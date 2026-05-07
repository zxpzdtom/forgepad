import { execSync } from "node:child_process";
import { homedir } from "node:os";

const FALLBACK_PATH =
  "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

/**
 * Resolve the user's login shell PATH by spawning a login shell.
 * On macOS, GUI apps (Electron) inherit launchd's minimal PATH which
 * doesn't include nvm/fnm/volta managed Node.js paths or user-installed
 * CLI tools like `claude`. This function captures the real PATH the user
 * would have in an interactive terminal.
 */
let _resolvedUserPath: string | null = null;

export function getUserPath(): string {
  if (_resolvedUserPath !== null) return _resolvedUserPath;
  try {
    const loginShell = process.env.SHELL || "/bin/zsh";
    const result = execSync(`${loginShell} -ilc 'echo "___PATH___:$PATH"'`, {
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, HOME: homedir() },
    });
    const match = result.match(/___PATH___:(.+)/);
    if (match?.[1]) {
      _resolvedUserPath = match[1].trim();
      return _resolvedUserPath;
    }
  } catch {
    // Fall through to process.env.PATH
  }
  _resolvedUserPath = process.env.PATH
    ? `${process.env.PATH}:${FALLBACK_PATH}`
    : FALLBACK_PATH;
  return _resolvedUserPath;
}
