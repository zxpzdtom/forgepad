import { execFile } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FileNode, FileStatus } from '@shared/types';

import { normalizeRelPath, resolveInsideRoot } from './path-guard';

const MIME_MAP: Record<string, string> = {
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  wma: 'audio/x-ms-wma',
  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  // PDF
  pdf: 'application/pdf',
};

import { GitService } from './git-service';

const execFileAsync = promisify(execFile);

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  '.next',
  '.cache',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
]);

function isEnvFile(name: string): boolean {
  return /^\.env($|\.)/.test(name);
}

async function gitLsFiles(rootPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['ls-files', '--others', '--cached', '--exclude-standard'], {
    cwd: rootPath,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function manualList(rootPath: string, currentPath = rootPath, depth = 0): Promise<string[]> {
  if (depth > 10) return [];
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.gitignore' && !isEnvFile(entry.name)) continue;

    const abs = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await manualList(rootPath, abs, depth + 1)));
    } else if (entry.isFile()) {
      files.push(path.relative(rootPath, abs).replaceAll('\\', '/'));
    }
  }

  return files;
}

function buildTreeFromPaths(rootPath: string, paths: string[]): FileNode[] {
  const root: FileNode = { name: '', path: rootPath, type: 'directory', children: [] };

  for (const filePath of paths.toSorted((a, b) => a.localeCompare(b))) {
    const parts = filePath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const fullPath = path.join(rootPath, ...parts.slice(0, i + 1));
      current.children ??= [];

      if (isFile) {
        current.children.push({ name, path: fullPath, type: 'file' });
        continue;
      }

      let next = current.children.find((node) => node.type === 'directory' && node.name === name);
      if (!next) {
        next = { name, path: fullPath, type: 'directory', children: [] };
        current.children.push(next);
      }
      current = next;
    }
  }

  function sortNodes(nodes: FileNode[]): FileNode[] {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    for (const node of nodes) {
      if (node.children) sortNodes(node.children);
    }
    return nodes;
  }

  return sortNodes(root.children ?? []);
}

function statusMapFromEntries(rootPath: string, statuses: FileStatus[], topLevel: string): Map<string, FileStatus['status']> {
  const prefix = path.relative(topLevel, rootPath).replaceAll('\\', '/');
  const map = new Map<string, FileStatus['status']>();
  for (const status of statuses) {
    let rel = status.path.includes(' -> ') ? (status.path.split(' -> ').at(-1) ?? status.path) : status.path;
    if (prefix && rel.startsWith(`${prefix}/`)) {
      rel = rel.slice(prefix.length + 1);
    }
    map.set(rel, status.status);
  }
  return map;
}

function annotateTree(rootPath: string, nodes: FileNode[], statusMap: Map<string, FileStatus['status']>): boolean {
  let any = false;
  for (const node of nodes) {
    const rel = path.relative(rootPath, node.path).replaceAll('\\', '/');
    if (node.type === 'file') {
      const status = statusMap.get(rel);
      if (status && status !== 'conflicted') {
        node.gitStatus = status;
        any = true;
      }
      continue;
    }

    if (node.children && annotateTree(rootPath, node.children, statusMap)) {
      node.gitStatus = 'modified';
      any = true;
    }
  }
  return any;
}

export class FileService {
  static async listFiles(rootPath: string): Promise<string[]> {
    let files: string[];
    try {
      files = await gitLsFiles(rootPath);
    } catch {
      files = await manualList(rootPath);
    }
    return [...new Set(files)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }

  static async getTree(rootPath: string): Promise<FileNode[]> {
    return buildTreeFromPaths(rootPath, await FileService.listFiles(rootPath));
  }

  static async getTreeWithStatus(rootPath: string): Promise<FileNode[]> {
    const [tree, statuses, topLevel] = await Promise.all([
      FileService.getTree(rootPath),
      GitService.getStatus(rootPath),
      GitService.getTopLevel(rootPath).catch(() => rootPath),
    ]);
    const statusMap = statusMapFromEntries(rootPath, statuses, topLevel);
    annotateTree(rootPath, tree, statusMap);
    return tree;
  }

  static async readFile(rootPath: string, relPathInput: string): Promise<string> {
    const relPath = normalizeRelPath(relPathInput);
    const abs = await resolveInsideRoot(rootPath, relPath);
    const stats = await stat(abs);
    if (stats.size > 2 * 1024 * 1024) {
      throw new Error(`File too large for editor: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    }
    return readFile(abs, 'utf8');
  }

  static async writeFile(rootPath: string, relPathInput: string, content: string): Promise<void> {
    const relPath = normalizeRelPath(relPathInput);
    const abs = await resolveInsideRoot(rootPath, relPath);
    await writeFile(abs, content, 'utf8');
  }

  static async readFileAsDataUrl(rootPath: string, relPathInput: string): Promise<string> {
    const relPath = normalizeRelPath(relPathInput);
    const abs = await resolveInsideRoot(rootPath, relPath);
    const stats = await stat(abs);
    const ext = relPath.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_MAP[ext] ?? 'application/octet-stream';
    const isMedia = mime.startsWith('audio/') || mime.startsWith('video/') || mime === 'application/pdf';
    const maxSize = isMedia ? 500 * 1024 * 1024 : 10 * 1024 * 1024;
    if (stats.size > maxSize) {
      throw new Error(`File too large for preview: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    }
    if (mime === 'image/svg+xml') {
      const text = await readFile(abs, 'utf8');
      return `data:${mime};utf8,${encodeURIComponent(text)}`;
    }
    const buffer = await readFile(abs);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  /** Read any absolute path (for files dragged in from outside the workspace). Read-only. */
  static async readAbsFile(absPath: string): Promise<string> {
    const stats = await stat(absPath);
    if (stats.size > 2 * 1024 * 1024) {
      throw new Error(`File too large for editor: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    }
    return readFile(absPath, 'utf8');
  }

  static async readAbsFileAsDataUrl(absPath: string): Promise<string> {
    const stats = await stat(absPath);
    const ext = absPath.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_MAP[ext] ?? 'application/octet-stream';
    const isMedia = mime.startsWith('audio/') || mime.startsWith('video/') || mime === 'application/pdf';
    const maxSize = isMedia ? 500 * 1024 * 1024 : 10 * 1024 * 1024;
    if (stats.size > maxSize) {
      throw new Error(`File too large for preview: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    }
    if (mime === 'image/svg+xml') {
      const text = await readFile(absPath, 'utf8');
      return `data:${mime};utf8,${encodeURIComponent(text)}`;
    }
    const buffer = await readFile(absPath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }
}
