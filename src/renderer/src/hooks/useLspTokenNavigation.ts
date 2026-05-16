import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import type { DiffTokenEventBaseProps, TokenEventBase } from '@pierre/diffs';

/** Alias mappings mirroring the renderer Vite config resolve.alias. */
const PATH_ALIASES: Record<string, string> = {
  '@renderer/': 'src/renderer/src/',
  '@shared/': 'src/shared/',
};

/** Common extensions to try when resolving an import path */
const EXTENSIONS_TO_TRY = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

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

/**
 * Returns `onTokenClick`, `onTokenEnter`, and `onTokenLeave` callbacks
 * compatible with `@pierre/diffs` options (both File and FileDiff modes).
 *
 * Behaviour:
 * - Cmd/Ctrl + Click on an import path string → directly open the file
 * - Cmd/Ctrl + Click on a symbol → Go to Definition (grep search)
 * - Alt + Click  or  Cmd/Ctrl + Shift + Click → Find References
 * - Only the "additions" side is handled in diff mode (ignores deleted lines)
 */
export function useLspTokenNavigation(
  worktreePath: string,
  filePath: string,
  workspaceId: string,
  /** Set to 'diff' to restrict clicks to the additions side. */
  mode: 'file' | 'diff' = 'file',
) {
  const openSymbolPeek = useAppStore((s) => s.openSymbolPeek);
  const openFileTab = useAppStore((s) => s.openFileTab);
  const closeSymbolPeek = useAppStore((s) => s.closeSymbolPeek);

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
            closeSymbolPeek();
            return;
          }
          // Could not resolve → fall through to grep search using the last segment
        }

        // ── Symbol search (grep) ──
        const token = stripped;
        // Skip tokens that look like paths for grep search — they won't match definitions
        if (looksLikeImportPath(token)) return;

        if (!token || token.length < 2) return;

        const locations = await window.forgepad.lsp.getDefinition(worktreePath, token);

        if (locations.length === 0) return;

        // Single definition → jump directly to the file and line
        if (locations.length === 1) {
          const loc = locations[0];
          openFileTab(workspaceId, loc.filePath, loc.lineNumber);
          closeSymbolPeek();
          return;
        }

        // Multiple results → show peek panel
        openSymbolPeek({
          locations,
          token,
          kind: 'definition',
          originFile: filePath,
          originLine: props.lineNumber,
        });
      } catch (err) {
        console.error('[useLspTokenNavigation] search failed:', err);
      }
    },
    [worktreePath, filePath, workspaceId, mode, openSymbolPeek, openFileTab, closeSymbolPeek],
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
