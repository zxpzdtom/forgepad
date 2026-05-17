import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import type { DiffTokenEventBaseProps, TokenEventBase } from '@pierre/diffs';
import type { LspLocation } from '@shared/types';

/** Alias mappings mirroring the renderer Vite config resolve.alias. */
const PATH_ALIASES: Record<string, string> = {
  '@renderer/': 'src/renderer/src/',
  '@shared/': 'src/shared/',
};

/** Common extensions to try when resolving an import path */
const EXTENSIONS_TO_TRY = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

type ImportResolution = {
  importPath: string;
  exportedName: string | null;
};

/**
 * Strip surrounding quotes (single, double, backtick) from a string.
 */
function stripQuotes(text: string): string {
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === "'" || first === '"' || first === '`') && first === last) {
      return text.slice(1, -1);
    }
  }
  return text;
}

/**
 * Test whether a string looks like a module/file import path.
 */
function looksLikeImportPath(text: string): boolean {
  // Relative paths
  if (text.startsWith('./') || text.startsWith('../')) return true;
  // Aliased paths
  for (const prefix of Object.keys(PATH_ALIASES)) {
    if (text.startsWith(prefix)) return true;
  }
  // Scoped npm packages (e.g. @pierre/diffs)
  if (/^@[a-z0-9-]+\/[a-z0-9-]/.test(text)) return true;
  // Bare identifiers that look like paths (contain /)
  if (text.includes('/') && !text.includes(' ')) return true;
  return false;
}

/**
 * Resolve an import path to a workspace-relative file path by
 * expanding aliases and trying common file extensions.
 * Returns the resolved relPath or null if no file found.
 */
async function resolveImportPath(worktreePath: string, importPath: string, currentFilePath: string): Promise<string | null> {
  let resolvedBase: string;

  // 1. Try alias expansion
  let aliasMatched = false;
  for (const [alias, target] of Object.entries(PATH_ALIASES)) {
    if (importPath.startsWith(alias)) {
      resolvedBase = target + importPath.slice(alias.length);
      aliasMatched = true;
      break;
    }
  }

  if (!aliasMatched) {
    // 2. Relative paths — resolve from the current file's directory
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const currentDir = currentFilePath.includes('/') ? currentFilePath.replace(/\/[^/]+$/, '') : '';
      // Simple path join
      const parts = (currentDir ? `${currentDir}/${importPath}` : importPath).split('/');
      const resolved: string[] = [];
      for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') {
          resolved.pop();
        } else {
          resolved.push(part);
        }
      }
      resolvedBase = resolved.join('/');
    } else {
      // npm package or unknown — can't resolve to a workspace file
      return null;
    }
  }

  // 3. Try extensions
  for (const ext of EXTENSIONS_TO_TRY) {
    const candidate = resolvedBase + ext;
    try {
      const content = await window.forgepad.fs.readFile(worktreePath, candidate);
      if (content !== null && content !== undefined) {
        return candidate;
      }
    } catch {
      // Not found, try next
    }
  }

  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenPattern(token: string): RegExp {
  return new RegExp(`(^|[^\\w$])${escapeRegExp(token)}([^\\w$]|$)`);
}

function importBlocksForLine(content: string, lineNumber: number): string[] {
  const lines = content.split('\n');
  const blocks: string[] = [];
  const lineIndex = Math.max(0, lineNumber - 1);

  for (let start = lineIndex; start >= 0; start--) {
    if (!/\bimport\b/.test(lines[start])) continue;

    const blockLines: string[] = [];
    for (let index = start; index < lines.length; index++) {
      blockLines.push(lines[index]);
      const block = blockLines.join('\n');
      if (/from\s*['"][^'"]+['"]/.test(block) || /^import\s*['"][^'"]+['"]/.test(block.trim())) {
        blocks.push(block);
        break;
      }
      if (index - start > 20) break;
    }
    break;
  }

  return blocks;
}

function importedSymbolFromBlock(block: string, localName: string): ImportResolution | null {
  if (!tokenPattern(localName).test(block)) return null;

  const fromMatch = block.match(/from\s*['"]([^'"]+)['"]/);
  const sideEffectMatch = block.trim().match(/^import\s*['"]([^'"]+)['"]/);
  const importPath = fromMatch?.[1] ?? sideEffectMatch?.[1];
  if (!importPath) return null;

  const namedMatch = block.match(/\{([\s\S]*?)\}/);
  if (namedMatch) {
    const namedImports = namedMatch[1].split(',');
    for (const item of namedImports) {
      const parts = item.trim().split(/\s+as\s+/);
      const exported = parts[0]?.trim();
      const local = (parts[1] ?? parts[0])?.trim();
      if (local === localName && exported) {
        return { importPath, exportedName: exported };
      }
    }
  }

  const namespaceMatch = block.match(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/);
  if (namespaceMatch?.[1] === localName) {
    return { importPath, exportedName: null };
  }

  const defaultMatch = block.match(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|\s+from)/);
  if (defaultMatch?.[1] === localName) {
    return { importPath, exportedName: 'default' };
  }

  return null;
}

function findDefinitionLine(content: string, exportedName: string | null): number {
  if (!exportedName) return 1;

  const lines = content.split('\n');
  if (exportedName === 'default') {
    const defaultIndex = lines.findIndex((line) => /\bexport\s+default\b/.test(line));
    return defaultIndex >= 0 ? defaultIndex + 1 : 1;
  }

  const name = escapeRegExp(exportedName);
  const definitionPatterns = [
    new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:const|let|var|function|class|interface|type|enum)\\s+${name}\\b`),
    new RegExp(`\\b(?:const|let|var|function|class|interface|type|enum)\\s+${name}\\b`),
  ];

  for (const pattern of definitionPatterns) {
    const index = lines.findIndex((line) => pattern.test(line));
    if (index >= 0) return index + 1;
  }

  return 1;
}

async function resolveImportedSymbolDefinition(
  worktreePath: string,
  currentFilePath: string,
  lineNumber: number,
  token: string,
): Promise<{ filePath: string; lineNumber: number } | null> {
  let currentContent: string;
  try {
    currentContent = await window.forgepad.fs.readFile(worktreePath, currentFilePath);
  } catch {
    return null;
  }

  for (const block of importBlocksForLine(currentContent, lineNumber)) {
    const imported = importedSymbolFromBlock(block, token);
    if (!imported) continue;

    const filePath = await resolveImportPath(worktreePath, imported.importPath, currentFilePath);
    if (!filePath) return null;

    try {
      const targetContent = await window.forgepad.fs.readFile(worktreePath, filePath);
      return {
        filePath,
        lineNumber: findDefinitionLine(targetContent, imported.exportedName),
      };
    } catch {
      return { filePath, lineNumber: 1 };
    }
  }

  return null;
}

function chooseBestDefinitionLocation(locations: LspLocation[], token: string, originFile: string): LspLocation {
  const definitionPattern = new RegExp(
    `\\b(?:export\\s+)?(?:declare\\s+)?(?:const|let|var|function|class|interface|type|enum)\\s+${escapeRegExp(token)}\\b`,
  );
  return (
    locations.find((loc) => loc.filePath !== originFile && definitionPattern.test(loc.lineText)) ??
    locations.find((loc) => definitionPattern.test(loc.lineText)) ??
    locations.find((loc) => loc.filePath !== originFile) ??
    locations[0]
  );
}

/**
 * Returns `onTokenClick`, `onTokenEnter`, and `onTokenLeave` callbacks
 * compatible with `@pierre/diffs` options (both File and FileDiff modes).
 *
 * Behaviour:
 * - Cmd/Ctrl + Click on an import path string → directly open the file
 * - Cmd/Ctrl + Click on an imported symbol → open the imported file at its definition line
 * - Cmd/Ctrl + Click on a symbol → directly open the best definition match
 * - Only the "additions" side is handled in diff mode (ignores deleted lines)
 */
export function useLspTokenNavigation(
  worktreePath: string,
  filePath: string,
  workspaceId: string,
  /** Set to 'diff' to restrict clicks to the additions side. */
  mode: 'file' | 'diff' = 'file',
) {
  const openFileTab = useAppStore((s) => s.openFileTab);

  // Track whether modifier key is held for underline styling
  const cmdHeldRef = useRef(false);
  const hoveredTokenRef = useRef<HTMLElement | null>(null);

  // ── Modifier-key listeners for cursor styling ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        cmdHeldRef.current = true;
        if (hoveredTokenRef.current) {
          hoveredTokenRef.current.style.textDecoration = 'underline';
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) {
        cmdHeldRef.current = false;
        if (hoveredTokenRef.current) {
          hoveredTokenRef.current.style.textDecoration = '';
          hoveredTokenRef.current.style.cursor = '';
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const onTokenClick = useCallback(
    async (props: DiffTokenEventBaseProps | TokenEventBase, event: MouseEvent) => {
      // In diff mode, only handle the additions side
      if (mode === 'diff' && 'side' in props && props.side !== 'additions') return;

      // Only handle Cmd/Ctrl + Click (Go to Definition)
      const isDefinition = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
      if (!isDefinition) return;

      event.preventDefault();
      event.stopPropagation();

      const rawToken = props.tokenText.trim();
      if (!rawToken || rawToken.length < 2) return;

      // Strip quotes from string tokens (e.g. '@renderer/store/app-store')
      const stripped = stripQuotes(rawToken);

      try {
        // ── Import path navigation ──
        // If the token looks like a file/module path, try to open it directly.
        if (looksLikeImportPath(stripped)) {
          const resolved = await resolveImportPath(worktreePath, stripped, filePath);
          if (resolved) {
            openFileTab(workspaceId, resolved, 1);
            return;
          }
          // Could not resolve → fall through to grep search using the last segment
        }

        // ── Symbol search (grep) ──
        const token = stripped;
        // Skip tokens that look like paths for grep search — they won't match definitions
        if (looksLikeImportPath(token)) return;

        if (!token || token.length < 2) return;

        const importedDefinition = await resolveImportedSymbolDefinition(worktreePath, filePath, props.lineNumber, token);
        if (importedDefinition) {
          openFileTab(workspaceId, importedDefinition.filePath, importedDefinition.lineNumber);
          return;
        }

        const locations = await window.forgepad.lsp.getDefinition(worktreePath, token);

        if (locations.length === 0) return;

        const loc = chooseBestDefinitionLocation(locations, token, filePath);
        openFileTab(workspaceId, loc.filePath, loc.lineNumber);
      } catch (err) {
        console.error('[useLspTokenNavigation] search failed:', err);
      }
    },
    [worktreePath, filePath, workspaceId, mode, openFileTab],
  );

  const onTokenEnter = useCallback(
    (props: DiffTokenEventBaseProps | TokenEventBase, _event: PointerEvent) => {
      if (mode === 'diff' && 'side' in props && props.side !== 'additions') return;
      hoveredTokenRef.current = props.tokenElement;
      if (cmdHeldRef.current) {
        props.tokenElement.style.textDecoration = 'underline';
      }
    },
    [mode],
  );

  const onTokenLeave = useCallback((props: DiffTokenEventBaseProps | TokenEventBase, _event: PointerEvent) => {
    if (hoveredTokenRef.current === props.tokenElement) {
      hoveredTokenRef.current.style.textDecoration = '';
      hoveredTokenRef.current.style.cursor = '';
      hoveredTokenRef.current = null;
    }
  }, []);

  return { onTokenClick, onTokenEnter, onTokenLeave };
}
