import { app } from "electron";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PersistedAppState } from "@shared/types";

const STATE_FILE_NAME = "forgepad-state.json";

async function pathExists(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class StateService {
  private static getStatePath(): string {
    return path.join(app.getPath("userData"), STATE_FILE_NAME);
  }

  static async load(): Promise<Partial<PersistedAppState> | null> {
    try {
      const raw = await readFile(this.getStatePath(), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isObject(parsed)) return null;
      if (parsed.schemaVersion !== 1) return null;

      const state = parsed as Partial<PersistedAppState>;
      const projects = [];
      for (const project of state.projects ?? []) {
        if (await pathExists(project.repoPath)) projects.push(project);
      }

      const projectIds = new Set(projects.map((project) => project.id));
      const workspaces = [];
      for (const workspace of state.workspaces ?? []) {
        if (!projectIds.has(workspace.projectId)) continue;
        if (await pathExists(workspace.worktreePath))
          workspaces.push(workspace);
      }

      const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
      const tasks = (state.tasks ?? []).filter((task) => {
        if (!projectIds.has(task.projectId)) return false;
        return !task.workspaceId || workspaceIds.has(task.workspaceId);
      });
      const taskIds = new Set(tasks.map((task) => task.id));

      const tabs = (state.tabs ?? []).filter((tab) =>
        workspaceIds.has(tab.workspaceId),
      );
      const tabIds = new Set(tabs.map((tab) => tab.id));
      const contextItems = (state.contextItems ?? []).filter((item) => {
        if (!workspaceIds.has(item.workspaceId)) return false;
        if (item.type === "task") return taskIds.has(item.taskId);
        return true;
      });

      return {
        ...state,
        projects,
        workspaces,
        tasks,
        tabs,
        activeWorkspaceId:
          state.activeWorkspaceId && workspaceIds.has(state.activeWorkspaceId)
            ? state.activeWorkspaceId
            : (workspaces[0]?.id ?? null),
        activeTabId:
          state.activeTabId && tabIds.has(state.activeTabId)
            ? state.activeTabId
            : null,
        contextItems,
      };
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
