import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { DiffFileData, FileStatus, GitBucket, GitStatusKind } from '@shared/types';

import { normalizeRelPath, resolveInsideRoot } from './path-guard';
import { getDotFolderPath } from './paths';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 20 * 1024 * 1024;

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
  return stdout.trimEnd();
}

function statusFromChar(char: string): GitStatusKind {
  if (char === 'A') return 'added';
  if (char === 'D') return 'deleted';
  if (char === 'R' || char === 'C') return 'renamed';
  if (char === 'U') return 'conflicted';
  return 'modified';
}

function conflictKindFromXY(xy: string): string {
  const map: Record<string, string> = {
    DD: 'both_deleted',
    AU: 'added_by_us',
    UD: 'deleted_by_them',
    UA: 'added_by_them',
    DU: 'deleted_by_us',
    AA: 'both_added',
    UU: 'both_modified',
  };
  return map[xy] ?? 'unmerged';
}

function parseStatusOutput(stdout: string): FileStatus[] {
  const entries: FileStatus[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;

    if (line.startsWith('? ')) {
      entries.push({
        path: line.slice(2),
        status: 'untracked',
        bucket: 'untracked',
        staged: false,
      });
      continue;
    }

    if (line.startsWith('u ')) {
      const parts = line.split(' ');
      const xy = parts[1] ?? 'UU';
      const filePath = parts.slice(10).join(' ');
      if (filePath) {
        entries.push({
          path: filePath,
          status: 'conflicted',
          bucket: 'unstaged',
          staged: false,
          conflictKind: conflictKindFromXY(xy),
        });
      }
      continue;
    }

    if (!line.startsWith('1 ') && !line.startsWith('2 ')) continue;

    const isRename = line.startsWith('2 ');
    const tabParts = line.split('\t');
    const spaceParts = tabParts[0].split(' ');
    const xy = spaceParts[1] ?? '..';
    const indexStatus = xy[0] ?? '.';
    const worktreeStatus = xy[1] ?? '.';
    const filePath = isRename ? (spaceParts.at(-1) ?? '') : spaceParts.slice(8).join(' ');
    const oldPath = isRename ? tabParts[1] : undefined;

    if (!filePath) continue;

    if (indexStatus !== '.') {
      entries.push({
        path: filePath,
        oldPath,
        status: statusFromChar(indexStatus),
        bucket: 'staged',
        staged: true,
      });
    }

    if (worktreeStatus !== '.') {
      entries.push({
        path: filePath,
        oldPath,
        status: statusFromChar(worktreeStatus),
        bucket: 'unstaged',
        staged: false,
      });
    }
  }
  return entries;
}

async function getNumstat(worktreePath: string, staged: boolean): Promise<Map<string, { additions: number; deletions: number }>> {
  const args = ['diff', '--numstat'];
  if (staged) args.push('--staged');
  const output = await git(args, worktreePath).catch(() => '');
  const map = new Map<string, { additions: number; deletions: number }>();
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    const [addStr, delStr, filePath] = line.split('\t');
    if (!filePath) continue;
    const additions = addStr === '-' ? 0 : Number.parseInt(addStr ?? '0', 10) || 0;
    const deletions = delStr === '-' ? 0 : Number.parseInt(delStr ?? '0', 10) || 0;
    map.set(filePath, { additions, deletions });
  }
  return map;
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
  const lines = contents.split('\n');
  return [
    `diff --git a/${relPath} b/${relPath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${relPath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join('\n');
}

export class GitService {
  static async isGitRepo(repoPath: string): Promise<boolean> {
    try {
      const value = await git(['rev-parse', '--is-inside-work-tree'], repoPath);
      return value === 'true';
    } catch {
      return false;
    }
  }

  static async getTopLevel(repoPath: string): Promise<string> {
    return git(['rev-parse', '--show-toplevel'], repoPath);
  }

  static async getCurrentBranch(worktreePath: string): Promise<string> {
    try {
      return await git(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
    } catch {
      return '';
    }
  }

  static async getBranchStats(worktreePath: string): Promise<{
    ahead: number;
    behind: number;
    additions: number;
    deletions: number;
  }> {
    try {
      const [abOutput, stagedOutput, unstagedOutput] = await Promise.all([
        git(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], worktreePath).catch(() => '0\t0'),
        git(['diff', '--numstat', '--staged'], worktreePath).catch(() => ''),
        git(['diff', '--numstat'], worktreePath).catch(() => ''),
      ]);
      const [behindStr, aheadStr] = abOutput.split('\t');
      const ahead = Number.parseInt(aheadStr ?? '0', 10) || 0;
      const behind = Number.parseInt(behindStr ?? '0', 10) || 0;
      let additions = 0;
      let deletions = 0;
      for (const output of [stagedOutput, unstagedOutput]) {
        for (const line of output.split(/\r?\n/)) {
          if (!line) continue;
          const [addStr, delStr] = line.split('\t');
          additions += addStr === '-' ? 0 : Number.parseInt(addStr ?? '0', 10) || 0;
          deletions += delStr === '-' ? 0 : Number.parseInt(delStr ?? '0', 10) || 0;
        }
      }
      return { ahead, behind, additions, deletions };
    } catch {
      return { ahead: 0, behind: 0, additions: 0, deletions: 0 };
    }
  }

  static async getStatus(worktreePath: string): Promise<FileStatus[]> {
    try {
      const output = await git(['status', '--porcelain=v2', '--untracked-files=all'], worktreePath);
      if (!output) return [];
      const entries = parseStatusOutput(output);
      const [stagedStats, unstagedStats] = await Promise.all([getNumstat(worktreePath, true), getNumstat(worktreePath, false)]);
      for (const entry of entries) {
        const stats =
          entry.bucket === 'staged'
            ? (stagedStats.get(entry.path) ?? stagedStats.get(entry.oldPath ?? ''))
            : entry.bucket === 'unstaged'
              ? (unstagedStats.get(entry.path) ?? unstagedStats.get(entry.oldPath ?? ''))
              : undefined;
        if (stats) {
          entry.additions = stats.additions;
          entry.deletions = stats.deletions;
        }
      }
      return entries;
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
      if (status === 'deleted') return;
      throw error;
    });

    if (bucket === 'untracked') {
      const abs = await resolveInsideRoot(worktreePath, relPath);
      const buffer = await readFile(abs);
      if (bufferIsBinary(buffer)) {
        return {
          path: relPath,
          oldPath,
          patch: '',
          status,
          bucket,
          isBinary: true,
        };
      }
      const newContent = buffer.toString('utf8');
      return {
        path: relPath,
        oldPath,
        patch: syntheticAddedPatch(relPath, newContent),
        oldContent: '',
        newContent,
        status,
        bucket,
        isBinary: false,
      };
    }

    const args = ['diff', '--find-renames', '--binary'];
    if (bucket === 'staged') args.push('--staged');
    args.push('--', relPath);
    let patch = '';
    try {
      patch = await git(args, worktreePath);
    } catch {
      patch = '';
    }

    const isBinary = patchIndicatesBinary(patch);
    if (isBinary) {
      return { path: relPath, oldPath, patch, status, bucket, isBinary: true };
    }

    // Fetch old and new file contents so the diff viewer can expand collapsed
    // unchanged regions (pierre needs full file contents for isPartial=false).
    let oldContent: string | undefined;
    let newContent: string | undefined;
    try {
      // Old content: HEAD version (staged) or index version (unstaged)
      const showRef = bucket === 'staged' ? 'HEAD' : '';
      const showPath = oldPath ?? relPath;
      oldContent = await git(['show', `${showRef}:${showPath}`], worktreePath);
    } catch {
      // File may not exist in the old version (newly added)
      oldContent = '';
    }
    try {
      if (status === 'deleted') {
        newContent = '';
      } else if (bucket === 'staged') {
        // For staged changes, new content is the index version
        newContent = await git(['show', `:${relPath}`], worktreePath);
      } else {
        // For unstaged changes, new content is the working tree version
        const abs = await resolveInsideRoot(worktreePath, relPath);
        newContent = (await readFile(abs)).toString('utf8');
      }
    } catch {
      newContent = undefined;
    }

    return {
      path: relPath,
      oldPath,
      patch,
      oldContent,
      newContent,
      status,
      bucket,
      isBinary: false,
    };
  }

  static async stage(worktreePath: string, paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100).map(normalizeRelPath);
      if (chunk.length > 0) await git(['add', '--', ...chunk], worktreePath);
    }
  }

  static async unstage(worktreePath: string, paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100).map(normalizeRelPath);
      if (chunk.length > 0) await git(['restore', '--staged', '--', ...chunk], worktreePath);
    }
  }

  static async discard(worktreePath: string, entries: Array<{ path: string; bucket: GitBucket }>): Promise<void> {
    for (const entry of entries) {
      const relPath = normalizeRelPath(entry.path);
      const abs = path.resolve(worktreePath, relPath);
      const rel = path.relative(path.resolve(worktreePath), abs);
      if (!rel || rel === '.' || rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Refusing to discard outside workspace: ${entry.path}`);
      }

      if (entry.bucket === 'untracked') {
        const safePath = await resolveInsideRoot(worktreePath, relPath);
        await rm(safePath, { force: true, recursive: true });
      } else {
        await git(['restore', '--worktree', '--', relPath], worktreePath);
        if (entry.bucket === 'staged') {
          await git(['restore', '--staged', '--', relPath], worktreePath).catch(() => '');
        }
      }
    }
  }

  static async commit(worktreePath: string, message: string): Promise<void> {
    if (!message.trim()) throw new Error('Commit message is empty.');
    await git(['commit', '-m', message.trim()], worktreePath);
  }

  static async fetch(repoPath: string): Promise<void> {
    await git(['fetch', '--prune'], repoPath).catch(() => '');
  }

  static async listRemoteBranches(repoPath: string): Promise<string[]> {
    const output = await git(['branch', '-r', '--format=%(refname:short)'], repoPath).catch(() => '');
    if (!output) return [];
    return output
      .split(/\r?\n/)
      .filter((b) => b && !b.includes('HEAD'))
      .map((b) => b.trim());
  }

  static async addWorktree(
    repoPath: string,
    branch: string,
    trackRemote?: boolean,
    worktreeBaseDir?: string,
  ): Promise<{ worktreePath: string; branch: string }> {
    const repoName = path.basename(repoPath);

    // Resolve base directory: custom setting → default (~/.forgepad/worktrees)
    let baseDir: string;
    if (worktreeBaseDir && worktreeBaseDir.trim()) {
      baseDir = path.join(worktreeBaseDir.trim(), repoName);
    } else {
      baseDir = path.join(getDotFolderPath(), 'worktrees', repoName);
    }

    const worktreePath = path.join(baseDir, branch);
    await mkdir(path.dirname(worktreePath), { recursive: true });

    if (trackRemote) {
      // Check if remote branch exists
      const remoteBranch = `origin/${branch}`;
      const exists = await git(['rev-parse', '--verify', remoteBranch], repoPath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        await git(['worktree', 'add', '-b', branch, worktreePath, remoteBranch], repoPath);
      } else {
        // Remote doesn't exist — create local branch and push
        await git(['worktree', 'add', '-b', branch, worktreePath], repoPath);
        await git(['push', '-u', 'origin', branch], repoPath).catch(() => '');
      }
    } else {
      await git(['worktree', 'add', '-b', branch, worktreePath], repoPath);
    }

    return { worktreePath, branch };
  }

  static async removeWorktree(repoPath: string, worktreePath: string, branch: string, deleteBranch = true): Promise<void> {
    await git(['worktree', 'remove', '--force', worktreePath], repoPath);
    // Prune stale worktree refs so git no longer considers the branch checked-out
    await git(['worktree', 'prune'], repoPath).catch(() => '');
    // Delete the branch (unless user opted to keep it)
    if (deleteBranch) {
      await git(['branch', '-D', branch], repoPath).catch(() => '');
    }
  }

  static hasPath(worktreePath: string, relPath: string): boolean {
    return existsSync(path.join(worktreePath, relPath));
  }
}
