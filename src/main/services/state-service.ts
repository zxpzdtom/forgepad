import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PersistedAppState } from "@shared/types";

const STATE_FILE_NAME = "forgepad-state.json";

export class StateService {
  private static getStatePath(): string {
    return path.join(app.getPath("userData"), STATE_FILE_NAME);
  }

  static async load(): Promise<Partial<PersistedAppState> | null> {
    try {
      const raw = await readFile(this.getStatePath(), "utf8");
      return JSON.parse(raw) as PersistedAppState;
    } catch {
      return null;
    }
  }

  static async save(state: PersistedAppState): Promise<void> {
    const statePath = this.getStatePath();
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  }
}

