import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SelectedLineRange } from '@pierre/diffs';
import { getFiletypeFromFileName } from '@pierre/diffs';
import type { FileOptions, LineAnnotation } from '@pierre/diffs/react';
import { File as PierreFile } from '@pierre/diffs/react';
import { useResolvedTheme } from '@renderer/App';
import { useAppStore } from '@renderer/store/app-store';
import type { CodeSelectionItem, Tab, Workspace } from '@shared/types';
import { ChevronDown, ChevronUp, Code, Copy, FileCode, Image, MessageSquarePlus, Search, X } from 'lucide-react';
import { code as streamdownCode } from '@streamdown/code';
import { createMermaidPlugin } from '@streamdown/mermaid';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';

type FileTab = Extract<Tab, { type: 'file' }>;

type FileEditorProps = {
  tab: FileTab;
  workspace: Workspace;
};

type MarkdownMode = 'rendered' | 'raw';

type HighlightRegistryLike = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
};

type TextNodeRange = {
  node: Text;
  start: number;
  end: number;
};

type PendingCodeSelection = {
  startLine: number;
  endLine: number;
  note: string;
};

type AnnotationMeta = { kind: 'pending' } | { kind: 'comment'; comment: CodeSelectionItem };

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif']);

function isImageFile(relPath: string): boolean {
  const ext = relPath.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

// --- Streamdown plugins ---

const mermaidDark = createMermaidPlugin({ config: { theme: 'dark' } });
const mermaidLight = createMermaidPlugin({ config: { theme: 'default' } });
const streamdownPluginsDark = { code: streamdownCode, mermaid: mermaidDark };
const streamdownPluginsLight = { code: streamdownCode, mermaid: mermaidLight };

// --- YAML frontmatter → Markdown table conversion ---

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

/**
 * If the markdown starts with a YAML frontmatter block (`---\n…\n---`),
 * parse simple `key: value` pairs and render them as a Markdown table,
 * similar to how GitHub renders frontmatter.
 */
function renderFrontmatterAsTable(md: string): string {
  const match = md.match(FRONTMATTER_RE);
  if (!match) return md;

  const raw = match[1];
  const rest = md.slice(match[0].length);

  const rows: [string, string][] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    rows.push([key, value]);
  }

  if (rows.length === 0) return md;

  const tableLines = ['| Property | Value |', '|----------|-------|', ...rows.map(([k, v]) => `| ${k} | ${v} |`)];

  return `${tableLines.join('\n')}\n\n${rest}`;
}

// --- Search helpers (used for find-in-file in markdown/raw modes) ---

const SEARCH_HIGHLIGHT = 'forgepad-file-search';
const ACTIVE_SEARCH_HIGHLIGHT = 'forgepad-file-search-active';

/** CSS injected into the @pierre/diffs Shadow DOM so `::highlight()` works. */
const SEARCH_HIGHLIGHT_CSS = `
::highlight(${SEARCH_HIGHLIGHT}) {
  color: inherit;
  background: rgba(233, 189, 97, 0.38);
}
::highlight(${ACTIVE_SEARCH_HIGHLIGHT}) {
  color: var(--accent-contrast);
  background: var(--accent);
}
`;

function getHighlightSupport() {
  const registry = (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights;
  const HighlightCtor = (
    window as Window & {
      Highlight?: new (...ranges: Range[]) => unknown;
    }
  ).Highlight;

  if (!registry || !HighlightCtor) return null;
  return { registry, HighlightCtor };
}

function clearSearchHighlights() {
  const support = getHighlightSupport();
  support?.registry.delete(SEARCH_HIGHLIGHT);
  support?.registry.delete(ACTIVE_SEARCH_HIGHLIGHT);
}

function collectTextNodes(root: HTMLElement): TextNodeRange[] {
  const nodes: TextNodeRange[] = [];
  let offset = 0;

  function walk(parent: Node) {
    // If the node is an Element with a shadowRoot, descend into it instead of
    // the light-DOM children.  This lets us reach text rendered by
    // @pierre/diffs inside its Shadow DOM <diffs-container>.
    if (parent instanceof HTMLElement && parent.shadowRoot) {
      // Inside the shadow root, only walk the *content* column
      // (data-content) so we skip gutter line-numbers.
      const contentCol = parent.shadowRoot.querySelector('[data-content]');
      if (contentCol) {
        walk(contentCol);
        return;
      }
      // Fallback: walk entire shadow root if the expected structure changed.
      for (const child of parent.shadowRoot.childNodes) walk(child);
      return;
    }

    if (parent.nodeType === Node.TEXT_NODE) {
      const text = parent.textContent ?? '';
      if (text.length > 0) {
        nodes.push({
          node: parent as Text,
          start: offset,
          end: offset + text.length,
        });
        offset += text.length;
      }
      return;
    }

    for (const child of parent.childNodes) walk(child);
  }

  walk(root);
  return nodes;
}

function locateTextPosition(nodes: TextNodeRange[], offset: number) {
  for (const item of nodes) {
    if (offset >= item.start && offset <= item.end) {
      return {
        node: item.node,
        offset: Math.min(offset - item.start, item.end - item.start),
      };
    }
  }

  const last = nodes.at(-1);
  if (!last) return null;
  return { node: last.node, offset: last.end - last.start };
}

function buildSearchRanges(root: HTMLElement, query: string): Range[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  // Collect text nodes first — this traverses into Shadow DOM when present.
  const nodes = collectTextNodes(root);
  // Reconstruct the full text from the collected nodes so it matches the
  // offsets exactly (root.textContent won't include Shadow DOM text).
  const text = nodes.map((n) => n.node.textContent ?? '').join('');
  const caseSensitive = /[A-Z]/.test(normalizedQuery);
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? normalizedQuery : normalizedQuery.toLowerCase();
  const ranges: Range[] = [];
  let index = haystack.indexOf(needle);

  while (index !== -1) {
    const start = locateTextPosition(nodes, index);
    const end = locateTextPosition(nodes, index + needle.length);

    if (start && end) {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      ranges.push(range);
    }

    index = haystack.indexOf(needle, index + needle.length);
  }

  return ranges;
}

function scrollRangeIntoContainer(range: Range, container: HTMLElement) {
  const rect = range.getBoundingClientRect();
  const fallback = range.getClientRects()[0];
  const target = rect.width || rect.height ? rect : fallback;
  if (!target) return;

  // When the Range lives inside a Shadow DOM (e.g. @pierre/diffs), the real
  // scrollable element is the <pre> inside the shadow root, not the outer
  // container we were given.  Walk up from the range's ancestor to find the
  // nearest scrollable element.
  const scrollTarget = findScrollableAncestor(range.startContainer, container);

  const containerRect = scrollTarget.getBoundingClientRect();
  scrollTarget.scrollTo({
    top: scrollTarget.scrollTop + target.top - containerRect.top - scrollTarget.clientHeight / 2,
    left: scrollTarget.scrollLeft + target.left - containerRect.left - Math.min(80, scrollTarget.clientWidth / 4),
    behavior: 'smooth',
  });
}

/** Walk up from `node` to find the nearest scrollable ancestor, stopping at
 *  `boundary`.  Falls back to `boundary` itself. */
function findScrollableAncestor(node: Node, boundary: HTMLElement): HTMLElement {
  let current: Node | null = node;
  while (current && current !== boundary) {
    if (current instanceof HTMLElement) {
      const { overflowY, overflowX } = getComputedStyle(current);
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowX === 'auto' || overflowX === 'scroll') {
        return current;
      }
    }
    // Traverse up: if we hit a shadow root, jump out to the host element.
    current = current.parentNode instanceof ShadowRoot ? current.parentNode.host : current.parentNode;
  }
  return boundary;
}

// --- Helpers ---

/** Extract lines from file text by 1-based line numbers (inclusive). */
function extractLines(text: string, startLine: number, endLine: number): string {
  const lines = text.split('\n');
  return lines.slice(startLine - 1, endLine).join('\n');
}

// --- Main component ---

export function FileEditor({ tab, workspace }: FileEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const codeViewerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [fileText, setFileText] = useState('');
  const [lineCount, setLineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>('rendered');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRanges, setSearchRanges] = useState<Range[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<PendingCodeSelection | null>(null);
  const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageViewMode, setImageViewMode] = useState<'preview' | 'raw'>('preview');
  const resolvedTheme = useResolvedTheme();
  const addToast = useAppStore((state) => state.addToast);
  const addContextFiles = useAppStore((state) => state.addContextFiles);
  const addCodeSelection = useAppStore((state) => state.addCodeSelection);
  const contextItems = useAppStore((state) => state.contextItems);
  const editorFontSize = useAppStore((state) => state.settings.editorFontSize);
  /** True when this tab was opened from outside the workspace (read-only, no context actions). */
  const isExternal = Boolean(tab.absPath);
  const markdownFile = useMemo(() => isMarkdownPath(tab.relPath), [tab.relPath]);
  const isImage = useMemo(() => isImageFile(tab.relPath), [tab.relPath]);
  const markdownText = useMemo(() => (markdownFile ? renderFrontmatterAsTable(fileText) : fileText), [markdownFile, fileText]);
  const showRenderedMarkdown = markdownFile && markdownMode === 'rendered';
  const showImagePreview = isImage && imageViewMode === 'preview';
  // showCodeViewer is computed later but we need it for search; mirror the logic here.
  const showCodeViewer = !loading && !showImagePreview && !showRenderedMarkdown && fileText;
  const searchable = showRenderedMarkdown || !!showCodeViewer;
  const searchTargetRef = showRenderedMarkdown ? previewRef : codeViewerRef;
  const searchScrollRef = showRenderedMarkdown ? scrollRef : codeViewerRef;
  const activeSearchLabel =
    searchQuery.trim() && searchRanges.length > 0
      ? `${(activeMatchIndex % searchRanges.length) + 1}/${searchRanges.length}`
      : searchQuery.trim()
        ? '0/0'
        : '';

  // Existing code selection comments for this file
  const fileComments = useMemo(
    () =>
      contextItems.filter(
        (item): item is CodeSelectionItem =>
          item.type === 'selection' && item.workspaceId === workspace.id && item.relPath === tab.relPath,
      ),
    [contextItems, workspace.id, tab.relPath],
  );

  // --- File options for @pierre/diffs File component ---
  const fileOptions: FileOptions<AnnotationMeta> = useMemo(
    () => ({
      theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light',
      themeType: resolvedTheme,
      overflow: 'scroll' as const,
      disableFileHeader: true,
      enableLineSelection: true,
      lineHoverHighlight: 'both' as const,
      unsafeCSS: SEARCH_HIGHLIGHT_CSS,
      onLineSelectionEnd: (range: SelectedLineRange | null) => {
        if (range && !isExternal) {
          setSelectedRange(range);
          setPendingSelection({
            startLine: Math.min(range.start, range.end),
            endLine: Math.max(range.start, range.end),
            note: '',
          });
        }
      },
    }),
    [resolvedTheme],
  );

  // --- File data for @pierre/diffs File component ---
  // Detect plain-text files (unrecognised extensions, dotfiles, etc.) so we
  // can avoid passing them to PierreFile which has an infinite-loop bug when
  // the computed language is "text".
  const detectedLang = useMemo(() => getFiletypeFromFileName(tab.relPath), [tab.relPath]);
  const isPlainText = detectedLang === 'text';

  const pierreFileData = useMemo(() => ({ name: tab.relPath, contents: fileText }), [tab.relPath, fileText]);

  // --- Load file ---
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setFileText('');
    setSearchRanges([]);
    setPendingSelection(null);
    setSelectedRange(null);
    setImageUrl('');

    if (isImage) {
      const imagePromise = tab.absPath
        ? window.forgepad.fs.readAbsFileAsDataUrl(tab.absPath)
        : window.forgepad.fs.readFileAsDataUrl(workspace.worktreePath, tab.relPath);
      imagePromise
        .then((dataUrl) => {
          if (!disposed) setImageUrl(dataUrl);
        })
        .catch((error) => addToast('error', error instanceof Error ? error.message : 'Failed to load image.'))
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }

    const textPromise = tab.absPath
      ? window.forgepad.fs.readAbsFile(tab.absPath)
      : window.forgepad.fs.readFile(workspace.worktreePath, tab.relPath);
    textPromise
      .then((text) => {
        if (disposed) return;
        setFileText(text);
        setLineCount(text.split('\n').length);
      })
      .catch((error) => {
        if (isImage) return;
        addToast('error', error instanceof Error ? error.message : 'Failed to load file.');
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [addToast, tab.relPath, tab.absPath, workspace.worktreePath, isImage]);

  useEffect(() => {
    setMarkdownMode('rendered');
    setPendingSelection(null);
    setSelectedRange(null);
    setImageViewMode('preview');
  }, []);

  useEffect(() => {
    if (showRenderedMarkdown) {
      setPendingSelection(null);
      setSelectedRange(null);
    }
  }, [showRenderedMarkdown]);

  // --- Search (for rendered markdown & code viewer modes) ---

  useLayoutEffect(() => {
    clearSearchHighlights();

    if (!searchOpen || loading || !searchTargetRef.current || !searchQuery.trim() || !searchable) {
      setSearchRanges([]);
      return;
    }

    setSearchRanges(buildSearchRanges(searchTargetRef.current, searchQuery));

    return clearSearchHighlights;
  }, [loading, searchOpen, searchQuery, searchable, searchTargetRef.current]);

  useEffect(() => {
    setActiveMatchIndex((index) => {
      if (searchRanges.length === 0) return 0;
      return Math.min(index, searchRanges.length - 1);
    });
  }, [searchRanges.length]);

  useEffect(() => {
    clearSearchHighlights();
    const support = getHighlightSupport();
    if (!support || !searchOpen || searchRanges.length === 0) return;

    const normalizedIndex = activeMatchIndex % searchRanges.length;
    const activeRange = searchRanges[normalizedIndex];
    const passiveRanges = searchRanges.filter((_, index) => index !== normalizedIndex);

    if (passiveRanges.length > 0) {
      support.registry.set(SEARCH_HIGHLIGHT, new support.HighlightCtor(...passiveRanges));
    }

    if (activeRange) {
      support.registry.set(ACTIVE_SEARCH_HIGHLIGHT, new support.HighlightCtor(activeRange));
    }

    return clearSearchHighlights;
  }, [activeMatchIndex, searchOpen, searchRanges]);

  useEffect(() => {
    if (!searchOpen || searchRanges.length === 0) return;
    const activeRange = searchRanges[activeMatchIndex % searchRanges.length];
    const scrollContainer = searchScrollRef.current;
    if (scrollContainer) scrollRangeIntoContainer(activeRange, scrollContainer);
  }, [activeMatchIndex, searchOpen, searchRanges, searchScrollRef.current]);

  const focusSearch = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    focusSearch();
  }, [focusSearch]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchRanges([]);
    clearSearchHighlights();
  }, []);

  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      setActiveMatchIndex((index) => {
        if (searchRanges.length === 0) return 0;
        return (index + direction + searchRanges.length) % searchRanges.length;
      });
    },
    [searchRanges.length],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;

      if (mod && key === 'f') {
        event.preventDefault();
        openSearch();
        return;
      }

      if (event.key === 'Escape') {
        if (pendingSelection) {
          event.preventDefault();
          setPendingSelection(null);
          setSelectedRange(null);
          return;
        }
        if (searchOpen) {
          event.preventDefault();
          closeSearch();
          return;
        }
        return;
      }

      if (!searchOpen) return;

      if (event.key === 'Enter' && document.activeElement === searchInputRef.current) {
        event.preventDefault();
        goToMatch(event.shiftKey ? -1 : 1);
        return;
      }

      if (mod && key === 'g') {
        event.preventDefault();
        goToMatch(event.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [closeSearch, goToMatch, openSearch, searchOpen, pendingSelection]);

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(fileText);
      addToast('success', 'Copied to clipboard');
    } catch {
      addToast('error', 'Failed to copy');
    }
  };

  // --- Submit code selection comment ---
  const submitCodeSelection = useCallback(() => {
    if (!pendingSelection?.note.trim()) return;
    const selectedText = extractLines(fileText, pendingSelection.startLine, pendingSelection.endLine);
    addCodeSelection(
      workspace.id,
      tab.relPath,
      {
        start: pendingSelection.startLine,
        end: pendingSelection.endLine,
        selectedText,
      },
      pendingSelection.note,
    );
    setSelectedRange(null);
    setPendingSelection(null);
    addToast('success', 'Saved code selection to context');
  }, [addCodeSelection, addToast, fileText, pendingSelection, tab.relPath, workspace.id]);

  // --- Inline annotations: pending comment form + existing comments ---
  const lineAnnotations = useMemo(() => {
    const annotations: LineAnnotation<AnnotationMeta>[] = [];
    // Existing saved comments → appear after their end line
    for (const comment of fileComments) {
      annotations.push({
        lineNumber: comment.endLine,
        metadata: { kind: 'comment', comment },
      });
    }
    // Pending comment form → appears after the last selected line
    if (pendingSelection) {
      annotations.push({
        lineNumber: pendingSelection.endLine,
        metadata: { kind: 'pending' },
      });
    }
    return annotations;
  }, [pendingSelection, fileComments]);

  const renderAnnotation = useCallback(
    (annotation: LineAnnotation<AnnotationMeta>) => {
      const meta = annotation.metadata!;
      if (meta.kind === 'pending' && pendingSelection) {
        return (
          <div className="m-2.5 rounded-lg border border-border bg-panel p-2.5">
            <div className="mb-2 flex items-center gap-2 text-accent text-xs">
              <MessageSquarePlus size={15} />
              Comment on L{pendingSelection.startLine}
              {pendingSelection.endLine !== pendingSelection.startLine ? `-L${pendingSelection.endLine}` : ''}
            </div>
            <textarea
              className="w-full"
              value={pendingSelection.note}
              onChange={(event) =>
                setPendingSelection({
                  ...pendingSelection,
                  note: event.currentTarget.value,
                })
              }
              placeholder="Add a note for the agent"
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  submitCodeSelection();
                }
              }}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setPendingSelection(null);
                  setSelectedRange(null);
                }}
              >
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={submitCodeSelection}>
                Add Comment
              </button>
            </div>
          </div>
        );
      }
      if (meta.kind === 'comment') {
        const { comment } = meta;
        return (
          <div className="mx-2.5 my-1 grid gap-2 rounded-lg border border-border bg-surface-card p-[9px]">
            <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
              L{comment.startLine}
              {comment.endLine !== comment.startLine ? `-L${comment.endLine}` : ''}
            </strong>
            <p className="m-0 text-muted text-sm leading-relaxed">{comment.text}</p>
          </div>
        );
      }
      return null;
    },
    [pendingSelection, submitCodeSelection],
  );

  return (
    <section className="absolute inset-0 flex min-h-0 min-w-0 flex-col bg-bg">
      {/* Toolbar */}
      <div className="flex min-h-[42px] items-center justify-between gap-3 border-border border-b bg-panel px-3">
        <div
          className="flex min-w-0 items-center gap-[7px] overflow-hidden text-ellipsis whitespace-nowrap font-[510] text-[13px]"
          title={tab.relPath}
        >
          <FileCode size={14} className="text-muted" />
          {tab.relPath}
          <span className="text-muted">{lineCount} lines</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {isImage ? (
            <div className="view-mode-toggle" role="radiogroup" aria-label="Image view">
              <button
                className={`view-mode-btn ${imageViewMode === 'preview' ? 'active' : ''}`}
                type="button"
                role="radio"
                aria-checked={imageViewMode === 'preview'}
                title="Preview"
                onClick={() => setImageViewMode('preview')}
              >
                <Image size={14} />
              </button>
              <button
                className={`view-mode-btn ${imageViewMode === 'raw' ? 'active' : ''}`}
                type="button"
                role="radio"
                aria-checked={imageViewMode === 'raw'}
                title="Raw"
                onClick={() => setImageViewMode('raw')}
              >
                <Code size={14} />
              </button>
            </div>
          ) : null}
          {markdownFile ? (
            <div className="segmented-control" role="radiogroup" aria-label="Markdown view">
              <button
                type="button"
                role="radio"
                aria-checked={markdownMode === 'rendered'}
                className={markdownMode === 'rendered' ? 'active' : ''}
                onClick={() => setMarkdownMode('rendered')}
              >
                Rendered
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={markdownMode === 'raw'}
                className={markdownMode === 'raw' ? 'active' : ''}
                onClick={() => setMarkdownMode('raw')}
              >
                Raw
              </button>
            </div>
          ) : null}
          {!isExternal && (
            <button className="secondary-button" type="button" onClick={() => addContextFiles(workspace.id, [tab.relPath])}>
              Add Context
            </button>
          )}
          {searchable ? (
            <button className="icon-button" type="button" title="Search file" onClick={openSearch}>
              <Search size={16} />
            </button>
          ) : null}
          <button className="icon-button" type="button" title="Copy file" onClick={copyContent}>
            <Copy size={16} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && searchable ? (
        <form
          className="flex min-h-[38px] items-center gap-2 border-border border-b bg-surface-card px-2.5 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            goToMatch(1);
          }}
        >
          <Search size={14} className="text-muted" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            placeholder="Search file"
            onChange={(event) => {
              setSearchQuery(event.currentTarget.value);
              setActiveMatchIndex(0);
            }}
          />
          <span className="w-[54px] text-center text-muted text-xs tabular-nums">{activeSearchLabel}</span>
          <button
            className="icon-button"
            type="button"
            title="Previous match"
            disabled={searchRanges.length === 0}
            onClick={() => goToMatch(-1)}
          >
            <ChevronUp size={15} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Next match"
            disabled={searchRanges.length === 0}
            onClick={() => goToMatch(1)}
          >
            <ChevronDown size={15} />
          </button>
          <button className="icon-button" type="button" title="Close search" onClick={closeSearch}>
            <X size={15} />
          </button>
        </form>
      ) : null}

      {/* Content area */}
      {loading ? (
        <div className="grid min-h-[90px] place-items-center text-muted">Loading file</div>
      ) : showImagePreview && imageUrl ? (
        <div className="scrollbar-thin scroll-mask flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface-inset p-6">
          <img className="max-h-full max-w-full rounded object-contain" src={imageUrl} alt={tab.relPath} />
        </div>
      ) : showRenderedMarkdown ? (
        <div className="markdown-viewer-scroll scrollbar-thin scroll-mask-y min-h-0 flex-1 overflow-auto" ref={scrollRef}>
          <div ref={previewRef} className="markdown-preview">
            <Streamdown plugins={resolvedTheme === 'dark' ? streamdownPluginsDark : streamdownPluginsLight}>
              {markdownText}
            </Streamdown>
          </div>
        </div>
      ) : (
        <div ref={codeViewerRef} className="scrollbar-thin scroll-mask flex min-h-0 flex-1 flex-col overflow-auto">
          {/* Code viewer via @pierre/diffs File component */}
          {showCodeViewer ? (
            isPlainText ? (
              <pre
                className="pierre-plain-text m-0 flex-1 overflow-auto p-4 font-mono text-text"
                style={{
                  fontSize: `${editorFontSize}px`,
                  lineHeight: 1.6,
                  tabSize: 4,
                }}
              >
                <table className="border-collapse">
                  <tbody>
                    {fileText.split('\n').map((line, i) => (
                      <tr key={i}>
                        <td className="select-none pr-4 text-right align-top text-subtle/50" style={{ minWidth: '3em' }}>
                          {i + 1}
                        </td>
                        <td className="whitespace-pre-wrap break-all">{line || '\u00A0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </pre>
            ) : (
              <PierreFile
                file={pierreFileData}
                options={fileOptions}
                selectedLines={selectedRange}
                lineAnnotations={lineAnnotations}
                renderAnnotation={renderAnnotation}
                disableWorkerPool
                style={{ fontSize: `${editorFontSize}px` }}
              />
            )
          ) : null}
        </div>
      )}
    </section>
  );
}
