import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LspLocation } from '@shared/types';

const execFileAsync = promisify(execFile);

/**
 * Definition patterns — POSIX Extended Regex (ERE) compatible.
 *
 * Uses `[[:space:]]` instead of `\s`, plain grouping `(a|b)` instead of `(?:a|b)`,
 * and avoids `\b` (not available in ERE).
 *
 * Each pattern is a regex fragment that precedes the token name.
 * The token itself is followed by `[^a-zA-Z0-9_]` or `$` to simulate a word boundary.
 */
const DEFINITION_PREFIXES = [
  // JS / TS
  'function[[:space:]]+',
  'const[[:space:]]+',
  'let[[:space:]]+',
  'var[[:space:]]+',
  'class[[:space:]]+',
  'interface[[:space:]]+',
  'type[[:space:]]+',
  'enum[[:space:]]+',
  // Python
  'def[[:space:]]+',
  // Rust
  'fn[[:space:]]+',
  'struct[[:space:]]+',
  'trait[[:space:]]+',
  'impl[[:space:]]+',
  'mod[[:space:]]+',
  // Go
  'func[[:space:]]+',
  // Ruby
  'module[[:space:]]+',
];

/** Max results to avoid flooding the UI */
const MAX_RESULTS = 100;

/** Directories to exclude from fallback grep */
const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'vendor', 'target'];

function parseGrepLine(line: string): LspLocation | null {
  // git grep -n output format: "filepath:lineNumber:lineText"
  const firstColon = line.indexOf(':');
  if (firstColon === -1) return null;
  const secondColon = line.indexOf(':', firstColon + 1);
  if (secondColon === -1) return null;

  const filePath = line.slice(0, firstColon);
  const lineNumberStr = line.slice(firstColon + 1, secondColon);
  const lineText = line.slice(secondColon + 1);
  const lineNumber = Number.parseInt(lineNumberStr, 10);

  if (Number.isNaN(lineNumber) || lineNumber <= 0) return null;

  return {
    filePath,
    lineNumber,
    charStart: 0,
    lineText: lineText.slice(0, 500), // truncate very long lines
  };
}

/**
 * Escape a token for use inside a POSIX ERE regex.
 */
function escapeEre(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function gitGrepSearch(worktreePath: string, pattern: string, maxCount: number): Promise<LspLocation[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        'grep',
        '-n',
        '-E', // POSIX extended regex
        '--no-color',
        `--max-count=${maxCount}`,
        '--',
        pattern,
      ],
      {
        cwd: worktreePath,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10_000,
      },
    );

    const locations: LspLocation[] = [];
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const loc = parseGrepLine(line);
      if (loc) locations.push(loc);
    }
    return locations;
  } catch (error: unknown) {
    // git grep exits with code 1 when no matches found — not an error
    if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 1) {
      return [];
    }
    console.error('[LspService] git grep failed:', error);
    return [];
  }
}

async function fallbackGrepSearch(worktreePath: string, pattern: string, maxCount: number): Promise<LspLocation[]> {
  const excludeArgs = EXCLUDED_DIRS.flatMap((dir) => ['--exclude-dir', dir]);
  try {
    const { stdout } = await execFileAsync(
      'grep',
      [
        '-r',
        '-n',
        '-E', // POSIX extended regex
        '--no-color',
        `-m${maxCount}`,
        ...excludeArgs,
        '--include=*.ts',
        '--include=*.tsx',
        '--include=*.js',
        '--include=*.jsx',
        '--include=*.py',
        '--include=*.rs',
        '--include=*.go',
        '--include=*.rb',
        '--include=*.java',
        '--include=*.kt',
        '--include=*.swift',
        '--include=*.c',
        '--include=*.cpp',
        '--include=*.h',
        '--include=*.hpp',
        '--include=*.css',
        '--include=*.scss',
        '--include=*.vue',
        '--include=*.svelte',
        pattern,
        '.',
      ],
      {
        cwd: worktreePath,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10_000,
      },
    );

    const locations: LspLocation[] = [];
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const cleanLine = line.startsWith('./') ? line.slice(2) : line;
      const loc = parseGrepLine(cleanLine);
      if (loc) locations.push(loc);
    }
    return locations;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 1) {
      return [];
    }
    console.error('[LspService] grep fallback failed:', error);
    return [];
  }
}

async function isGitRepo(worktreePath: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: worktreePath,
      timeout: 3_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function search(worktreePath: string, pattern: string, maxCount: number): Promise<LspLocation[]> {
  const isGit = await isGitRepo(worktreePath);
  if (isGit) {
    return gitGrepSearch(worktreePath, pattern, maxCount);
  }
  return fallbackGrepSearch(worktreePath, pattern, maxCount);
}

export class LspService {
  /**
   * Search for definition-like declarations of the given token.
   * Uses pattern matching for common declaration keywords.
   */
  static async getDefinition(worktreePath: string, token: string): Promise<LspLocation[]> {
    const escaped = escapeEre(token);

    // Build a combined pattern: (prefix1|prefix2|...)TOKEN($|[^a-zA-Z0-9_])
    // This ensures the token is preceded by a keyword and followed by a non-word char.
    const prefixAlternation = DEFINITION_PREFIXES.join('|');
    const pattern = `(${prefixAlternation})${escaped}([^a-zA-Z0-9_]|$)`;

    const locations = await search(worktreePath, pattern, MAX_RESULTS);

    // Compute charStart for each result
    for (const loc of locations) {
      const idx = loc.lineText.indexOf(token);
      if (idx !== -1) {
        loc.charStart = idx;
      }
    }

    return locations;
  }
}
