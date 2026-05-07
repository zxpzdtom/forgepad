import { homedir } from "node:os";
import { join } from "node:path";
import { app } from "electron";

/**
 * Returns the dotfolder path for ForgePad data.
 * - Production (packaged app): ~/.forgepad
 * - Development (electron-vite dev): ~/.forgepad-dev
 */
export function getDotFolderPath(): string {
  const suffix = app.isPackaged ? "" : "-dev";
  return join(homedir(), `.forgepad${suffix}`);
}
