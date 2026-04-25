import { realpath, stat } from "node:fs/promises";
import path from "node:path";

export async function resolveInsideRoot(rootPath: string, relPath = ""): Promise<string> {
  const root = await realpath(rootPath);
  const target = path.resolve(root, relPath);
  const resolvedTarget = await realpathIfExists(target);
  const relative = path.relative(root, resolvedTarget);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolvedTarget;
  }

  throw new Error(`Path escapes workspace root: ${relPath || target}`);
}

export function normalizeRelPath(relPath: string): string {
  const normalized = relPath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Invalid relative path: ${relPath}`);
  }
  return normalized;
}

async function realpathIfExists(target: string): Promise<string> {
  try {
    await stat(target);
    return await realpath(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
    const parent = path.dirname(target);
    const resolvedParent = await realpath(parent);
    return path.join(resolvedParent, path.basename(target));
  }
}

