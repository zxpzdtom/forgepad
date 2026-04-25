import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { DiffFileData, FileStatus, GitBucket, GitStatusKind } from "@shared/types";
import { normalizeRelPath, resolveInsideRoot } from "./path-guard";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 20 * 1024 * 1024;

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  return stdout.trimEnd();
}

function statusFromChar(char: string): GitStatusKind {
  if (char === "A") return "added";
  if (char === "D") return "deleted";
  if (char === "R" || char === "C") return "renamed";
  if (char === "U") return "conflicted";
  return "modified";
}

function conflictKindFromXY(xy: string): string {
  const map: Record<string, string> = {
    DD: "both_deleted",
    AU: "added_by_us",
    UD: "deleted_by_them",
    UA: "added_by_them",
    DU: "deleted_by_us",
    AA: "both_added",
    UU: "both_modified",
  };
  return map[xy] ?? "unmerged";
}

function parseStatusOutput(stdout: string): FileStatus[] {
  const entries: FileStatus[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;

    if (line.startsWith("? ")) {
      entries.push({
        path: line.slice(2),
        status: "untracked",
        bucket: "untracked",
        staged: false,
      });
      continue;
    }

    if (line.startsWith("u ")) {
      const parts = line.split(" ");
      const xy = parts[1] ?? "UU";
      const filePath = parts.slice(10).join(" ");
      if (filePath) {
        entries.push({
          path: filePath,
          status: "conflicted",
          bucket: "unstaged",
          staged: false,
          conflictKind: conflictKindFromXY(xy),
        });
      }
      continue;
    }

    if (!line.startsWith("1 ") && !line.startsWith("2 ")) continue;

    const isRename = line.startsWith("2 ");
    const tabParts = line.split("\t");
    const spaceParts = tabParts[0].split(" ");
    const xy = spaceParts[1] ?? "..";
    const indexStatus = xy[0] ?? ".";
    const worktreeStatus = xy[1] ?? ".";
    const filePath = isRename ? spaceParts.at(-1) ?? "" : spaceParts.slice(8).join(" ");
    const oldPath = isRename ? tabParts[1] : undefined;

    if (!filePath) continue;

    if (indexStatus !== ".") {
      entries.push({
        path: filePath,
        oldPath,
        status: statusFromChar(indexStatus),
        bucket: "staged",
        staged: true,
      });
    }

    if (worktreeStatus !== ".") {
      entries.push({
        path: filePath,
        oldPath,
        status: statusFromChar(worktreeStatus),
        bucket: "unstaged",
        staged: false,
      });
    }
  }
  return entries;
}

function patchIndicatesBinary(patch: string): boolean {
  return /^\s*Binary files /m.test(patch) || /^\s*GIT binary patch\b/m.test(patch);
}

function bufferIsBinary(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, 8192);
  for (let i = 0; i < len; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function syntheticAddedPatch(relPath: string, contents: string): string {
  const lines = contents.split("\n");
  return [
    "diff --git a/" + relPath + " b/" + relPath,
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/" + relPath,
    "@@ -0,0 +1," + lines.length + " @@",
    ...lines.map((line) => "+" + line),
  ].join("\n");
}

export class GitService {
  static async isGitRepo(repoPath: string): Promise<boolean> {
    try {
      const value = await git(["rev-parse", "--is-inside-work-tree"], repoPath);
      return value === "true";
    } catch {
      return false;
    }
  }

  static async getTopLevel(repoPath: string): Promise<string> {
    return git(["rev-parse", "--show-toplevel"], repoPath);
  }

  static async getCurrentBranch(worktreePath: string): Promise<string> {
    try {
      return await git(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath);
    } catch {
      return "";
    }
  }

  static async getStatus(worktreePath: string): Promise<FileStatus[]> {
    try {
      const output = await git(["status", "--porcelain=v2", "--untracked-files=all"], worktreePath);
      if (!output) return [];
      return parseStatusOutput(output);
    } catch {
      return [];
    }
  }

  static async getFileDiff(
    worktreePath: string,
    relPathInput: string,
    bucket: GitBucket,
    status: GitStatusKind,
    oldPath?: string,
  ): Promise<DiffFileData> {
    const relPath = normalizeRelPath(relPathInput);
    await resolveInsideRoot(worktreePath, relPath).catch(async (error) => {
      if (status === "deleted") return;
      throw error;
    });

    if (bucket === "untracked") {
      const abs = await resolveInsideRoot(worktreePath, relPath);
      const buffer = await readFile(abs);
      if (bufferIsBinary(buffer)) {
        return { path: relPath, oldPath, patch: "", status, bucket, isBinary: true };
      }
      return {
        path: relPath,
        oldPath,
        patch: syntheticAddedPatch(relPath, buffer.toString("utf8")),
        status,
        bucket,
        isBinary: false,
      };
    }

    const args = ["diff", "--find-renames", "--binary"];
    if (bucket === "staged") args.push("--staged");
    args.push("--", relPath);
    let patch = "";
    try {
      patch = await git(args, worktreePath);
    } catch {
      patch = "";
    }

    return {
      path: relPath,
      oldPath,
      patch,
      status,
      bucket,
      isBinary: patchIndicatesBinary(patch),
    };
  }

  static async stage(worktreePath: string, paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100).map(normalizeRelPath);
      if (chunk.length > 0) await git(["add", "--", ...chunk], worktreePath);
    }
  }

  static async unstage(worktreePath: string, paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100).map(normalizeRelPath);
      if (chunk.length > 0) await git(["restore", "--staged", "--", ...chunk], worktreePath);
    }
  }

  static async discard(worktreePath: string, entries: Array<{ path: string; bucket: GitBucket }>): Promise<void> {
    for (const entry of entries) {
      const relPath = normalizeRelPath(entry.path);
      const abs = path.resolve(worktreePath, relPath);
      const rel = path.relative(path.resolve(worktreePath), abs);
      if (!rel || rel === "." || rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`Refusing to discard outside workspace: ${entry.path}`);
      }

      if (entry.bucket === "untracked") {
        const safePath = await resolveInsideRoot(worktreePath, relPath);
        await rm(safePath, { force: true, recursive: true });
      } else {
        await git(["restore", "--worktree", "--", relPath], worktreePath);
        if (entry.bucket === "staged") {
          await git(["restore", "--staged", "--", relPath], worktreePath).catch(() => "");
        }
      }
    }
  }

  static async commit(worktreePath: string, message: string): Promise<void> {
    if (!message.trim()) throw new Error("Commit message is empty.");
    await git(["commit", "-m", message.trim()], worktreePath);
  }

  static hasPath(worktreePath: string, relPath: string): boolean {
    return existsSync(path.join(worktreePath, relPath));
  }
}

