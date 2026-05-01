import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SelectedLineRange } from '@pierre/diffs';
import { getFiletypeFromFileName } from '@pierre/diffs';
import type { FileOptions, LineAnnotation } from '@pierre/diffs/react';
import { File as PierreFile } from '@pierre/diffs/react';
import { useResolvedTheme } from '@renderer/App';
import { useAppStore } from '@renderer/store/app-store';
import type { CodeSelectionItem, Tab, Workspace } from '@shared/types';
import { code as streamdownCode } from '@streamdown/code';
import { createMermaidPlugin } from '@streamdown/mermaid';
import { Check, ChevronDown, ChevronUp, Code, Copy, FileVideo, Image, List, MessageSquarePlus, Music, Search, X } from 'lucide-react';
import type { Components } from 'streamdown';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';
import { FileIcon } from './FileIcon';

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
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv']);

function getExt(relPath: string): string {
  return relPath.split('.').pop()?.toLowerCase() ?? '';
}

function isImageFile(relPath: string): boolean {
  return IMAGE_EXTENSIONS.has(getExt(relPath));
}

function isAudioFile(relPath: string): boolean {
  return AUDIO_EXTENSIONS.has(getExt(relPath));
}

function isVideoFile(relPath: string): boolean {
  return VIDEO_EXTENSIONS.has(getExt(relPath));
}

function isPdfFile(relPath: string): boolean {
  return getExt(relPath) === 'pdf';
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

// --- Slug generation for heading anchors ---

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '') // keep letters (any language), numbers, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Extract text content from React children recursively. */
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText((children as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return '';
}

// --- Custom heading components that add id for anchor links ---

/** Create a set of heading components (h1–h6) that add id attributes based on text content. */
function createHeadingComponents(): Components {
  // Per-render slug counters for deduplication (reset each time Streamdown re-renders the tree)
  const counters = new Map<string, number>();

  function uniqueSlug(base: string): string {
    const count = counters.get(base) ?? 0;
    counters.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }

  function makeHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
    const Tag = `h${level}` as const;
    const HeadingComponent = (props: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => {
      const { children, node: _, ...rest } = props;
      const text = extractText(children);
      const slug = uniqueSlug(generateSlug(text));
      return (
        <Tag {...rest} id={slug}>
          {children}
        </Tag>
      );
    };
    HeadingComponent.displayName = `Heading${level}`;
    return HeadingComponent;
  }

  return {
    h1: makeHeading(1),
    h2: makeHeading(2),
    h3: makeHeading(3),
    h4: makeHeading(4),
    h5: makeHeading(5),
    h6: makeHeading(6),
  };
}

// NOTE: headingComponents instances are created per-render via useMemo in the component,
// so that slug counters reset when markdown content changes.

// --- TOC types ---

type TocItem = {
  id: string;
  text: string;
  level: number;
};

// --- TOC rail path helpers ---

const RAIL_X_LEFT = 8; // x of the leftmost rail position (level 0)
const RAIL_X_STEP = 12; // extra x per indentation level

/**
 * Build a tree-style rail path with diagonal transitions between indent levels.
 *
 * When the level changes between two items the path uses a diagonal line to
 * bridge the X difference, with the remaining vertical distance as a straight
 * vertical segment:
 *
 *   - Same level   (H2→H2):  pure vertical │
 *   - Deeper       (H2→H3):  vertical down then diagonal ╲ to child
 *   - Shallower    (H3→H2):  diagonal ╱ back to parent then vertical down
 *
 * The diagonal always consumes a fixed portion of the vertical gap so the
 * slope stays consistent regardless of the distance between items.
 */
function buildRailPath(
  itemYCenters: number[],
  itemLevels: number[],
  minLevel: number,
): { d: string; segmentLengths: number[] } {
  if (itemYCenters.length === 0) return { d: '', segmentLengths: [] };

  const xOf = (level: number) => RAIL_X_LEFT + (level - minLevel) * RAIL_X_STEP;

  const points: [number, number][] = itemYCenters.map((y, i) => [xOf(itemLevels[i]), y]);

  let d = `M ${points[0][0]} ${points[0][1]}`;
  const segmentLengths: number[] = [];

  const diagLen = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

  for (let i = 1; i < points.length; i++) {
    const [prevX, prevY] = points[i - 1];
    const [curX, curY] = points[i];

    if (prevX === curX) {
      // Same indent level — pure vertical
      d += ` L ${curX} ${curY}`;
      segmentLengths.push(Math.abs(curY - prevY));
    } else {
      const totalDy = curY - prevY;
      // Diagonal consumes up to 40% of the vertical gap, capped so the
      // slope doesn't get too steep or too shallow.
      const diagonalDy = Math.min(Math.abs(totalDy) * 0.4, 16);
      const dx = curX - prevX;

      if (curX > prevX) {
        // Going deeper (e.g. H2 → H3): vertical first, then diagonal
        const midY = curY - diagonalDy;
        d += ` L ${prevX} ${midY}`;                 // vertical down
        d += ` L ${curX} ${curY}`;                   // diagonal to child
        const vertLen = Math.abs(midY - prevY);
        segmentLengths.push(vertLen + diagLen(dx, diagonalDy));
      } else {
        // Going shallower (e.g. H3 → H2): diagonal first, then vertical
        const midY = prevY + diagonalDy;
        d += ` L ${curX} ${midY}`;                   // diagonal back
        d += ` L ${curX} ${curY}`;                   // vertical down
        const vertLen = Math.abs(curY - midY);
        segmentLengths.push(diagLen(dx, diagonalDy) + vertLen);
      }
    }
  }

  return { d, segmentLengths };
}

// --- TOC sidebar component ---

function MarkdownToc({
  items,
  activeId,
  scrollContainerRef,
  collapsed,
}: {
  items: TocItem[];
  activeId: string;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  collapsed: boolean;
}) {
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [railData, setRailData] = useState<{
    d: string;
    totalLength: number;
    segmentLengths: number[];
    svgHeight: number;
    /** Pre-computed [x, y] centers for each item, in same order as items. */
    points: [number, number][];
  } | null>(null);

  const handleClick = useCallback(
    (id: string) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const target = container.querySelector(`#${CSS.escape(id)}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [scrollContainerRef],
  );

  const minLevel = items.length > 0 ? Math.min(...items.map((item) => item.level)) : 1;

  // Measure item positions and build SVG path whenever items change
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || items.length === 0) {
      setRailData(null);
      return;
    }

    // Wait one frame for layout to settle after render
    const raf = requestAnimationFrame(() => {
      const navRect = nav.getBoundingClientRect();
      const yCenters: number[] = [];
      const levels: number[] = [];

      for (const item of items) {
        const el = itemRefs.current.get(item.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        yCenters.push(rect.top - navRect.top + rect.height / 2);
        levels.push(item.level);
      }

      if (yCenters.length < 1) {
        setRailData(null);
        return;
      }

      const { d, segmentLengths } = buildRailPath(yCenters, levels, minLevel);
      const totalLength = segmentLengths.reduce((a, b) => a + b, 0);
      const svgHeight = navRect.height;
      const points: [number, number][] = yCenters.map((y, idx) => [
        RAIL_X_LEFT + (levels[idx] - minLevel) * RAIL_X_STEP,
        y,
      ]);

      setRailData({ d, totalLength, segmentLengths, svgHeight, points });
    });

    return () => cancelAnimationFrame(raf);
  }, [items, minLevel]);

  // Auto-scroll the TOC panel so the active item stays visible
  useEffect(() => {
    if (!activeId) return;
    const el = itemRefs.current.get(activeId);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeId]);

  if (items.length === 0) return null;

  // Calculate how much of the path to highlight up to the active item
  let activeDrawLength = 0;
  if (railData && activeId) {
    const activeIndex = items.findIndex((item) => item.id === activeId);
    if (activeIndex >= 0) {
      // Sum segment lengths up to activeIndex (segments connect item i-1 to item i)
      for (let i = 0; i < activeIndex && i < railData.segmentLengths.length; i++) {
        activeDrawLength += railData.segmentLengths[i];
      }
    }
  }

  return (
    <nav className={`markdown-toc scrollbar-thin ${collapsed ? 'collapsed' : ''}`} ref={navRef}>
      <div className="markdown-toc-title">
        <List size={14} />
        目录
      </div>

      {/* Rail SVG — positioned absolutely behind the items */}
      {railData && railData.d && (
        <svg className="markdown-toc-rail" height={railData.svgHeight} aria-hidden="true">
          {/* Background track */}
          <path
            d={railData.d}
            className="markdown-toc-rail-track"
            strokeDasharray="none"
          />
          {/* Active highlight */}
          <path
            d={railData.d}
            className="markdown-toc-rail-active"
            strokeDasharray={`${activeDrawLength} ${railData.totalLength}`}
          />
          {/* Active dot at the current position */}
          {(() => {
            const idx = items.findIndex((item) => item.id === activeId);
            if (idx < 0 || !railData.points[idx]) return null;
            const [cx, cy] = railData.points[idx];
            return <circle cx={cx} cy={cy} r="3" className="markdown-toc-rail-dot" />;
          })()}
        </svg>
      )}

      {items.map((item) => (
        <button
          key={item.id}
          ref={(el) => {
            if (el) itemRefs.current.set(item.id, el);
            else itemRefs.current.delete(item.id);
          }}
          type="button"
          className={`markdown-toc-item ${activeId === item.id ? 'active' : ''}`}
          style={{ paddingLeft: `${(item.level - minLevel) * RAIL_X_STEP + RAIL_X_LEFT + 12}px` }}
          onClick={() => handleClick(item.id)}
          title={item.text}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
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
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaViewMode, setMediaViewMode] = useState<'preview' | 'raw'>('preview');
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
  const isAudio = useMemo(() => isAudioFile(tab.relPath), [tab.relPath]);
  const isVideo = useMemo(() => isVideoFile(tab.relPath), [tab.relPath]);
  const isPdf = useMemo(() => isPdfFile(tab.relPath), [tab.relPath]);
  /** Any file type that requires loading a data URL for preview */
  const isMediaFile = isImage || isAudio || isVideo || isPdf;
  const markdownText = useMemo(() => (markdownFile ? renderFrontmatterAsTable(fileText) : fileText), [markdownFile, fileText]);
  // Create fresh heading components whenever markdown changes so slug counters reset
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional recreation on content change
  const mdHeadingComponents = useMemo(() => createHeadingComponents(), [markdownText]);
  const showRenderedMarkdown = markdownFile && markdownMode === 'rendered';
  const showMediaPreview = isMediaFile && mediaViewMode === 'preview';
  // showCodeViewer is computed later but we need it for search; mirror the logic here.
  const showCodeViewer = !loading && !showMediaPreview && !showRenderedMarkdown && fileText;
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

  // --- TOC state and logic ---
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState('');
  const [tocOpen, setTocOpen] = useState(true);

  // Extract TOC items from rendered DOM via MutationObserver
  useEffect(() => {
    if (!showRenderedMarkdown) {
      setTocItems([]);
      return;
    }

    const container = previewRef.current;
    if (!container) return;

    function extractToc() {
      if (!container) return;
      const headings = container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
      const items: TocItem[] = [];
      for (const heading of headings) {
        const id = heading.id;
        const text = heading.textContent?.trim() ?? '';
        const level = Number.parseInt(heading.tagName[1], 10);
        if (id && text) {
          items.push({ id, text, level });
        }
      }
      setTocItems(items);
    }

    // Initial extraction (after Streamdown has rendered)
    const raf = requestAnimationFrame(extractToc);

    // Re-extract on DOM changes (e.g. streaming updates)
    const observer = new MutationObserver(extractToc);
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [showRenderedMarkdown, markdownText]);

  // Track which heading is currently visible via IntersectionObserver
  useEffect(() => {
    if (!showRenderedMarkdown || tocItems.length === 0) return;

    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const headingElements = tocItems
      .map((item) => scrollContainer.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`))
      .filter(Boolean) as HTMLElement[];

    if (headingElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible heading
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveTocId(entry.target.id);
            return;
          }
        }
      },
      {
        root: scrollContainer,
        rootMargin: '0px 0px -80% 0px',
        threshold: 0,
      },
    );

    for (const el of headingElements) observer.observe(el);
    return () => observer.disconnect();
  }, [showRenderedMarkdown, tocItems]);

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
    setMediaUrl('');

    if (isMediaFile) {
      const mediaPromise = tab.absPath
        ? window.forgepad.fs.readAbsFileAsDataUrl(tab.absPath)
        : window.forgepad.fs.readFileAsDataUrl(workspace.worktreePath, tab.relPath);
      mediaPromise
        .then((dataUrl) => {
          if (!disposed) setMediaUrl(dataUrl);
        })
        .catch((error) => addToast('error', error instanceof Error ? error.message : 'Failed to load file preview.'))
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }

    // For media files (except PDF where there's no useful text fallback),
    // still try loading as text so "Raw" mode works (shows base64 / binary).
    // For PDF skip the text load entirely.
    if (!isPdf) {
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
          if (isMediaFile) return; // media preview already handles errors above
          addToast('error', error instanceof Error ? error.message : 'Failed to load file.');
        })
        .finally(() => {
          if (!disposed && !isMediaFile) setLoading(false);
        });
    } else {
      // PDF: nothing to load as text, just wait for data URL
    }

    return () => {
      disposed = true;
    };
  }, [addToast, tab.relPath, tab.absPath, workspace.worktreePath, isMediaFile, isPdf]);

  useEffect(() => {
    setMarkdownMode('rendered');
    setPendingSelection(null);
    setSelectedRange(null);
    setMediaViewMode('preview');
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

  const [copied, setCopied] = useState(false);
  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(fileText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
          <FileIcon filePath={tab.relPath} size={14} />
          {tab.relPath}
          {!isMediaFile && <span className="text-muted">{lineCount} lines</span>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {(isImage || isAudio || isVideo) ? (
            <div className="view-mode-toggle" role="radiogroup" aria-label="Media view">
              <button
                className={`view-mode-btn ${mediaViewMode === 'preview' ? 'active' : ''}`}
                type="button"
                role="radio"
                aria-checked={mediaViewMode === 'preview'}
                title="Preview"
                onClick={() => setMediaViewMode('preview')}
              >
                {isAudio ? <Music size={14} /> : isVideo ? <FileVideo size={14} /> : <Image size={14} />}
              </button>
              <button
                className={`view-mode-btn ${mediaViewMode === 'raw' ? 'active' : ''}`}
                type="button"
                role="radio"
                aria-checked={mediaViewMode === 'raw'}
                title="Raw"
                onClick={() => setMediaViewMode('raw')}
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
          {!isExternal && !isMediaFile && (
            <button className="secondary-button" type="button" onClick={() => addContextFiles(workspace.id, [tab.relPath])}>
              Add Context
            </button>
          )}
          {searchable ? (
            <button className="icon-button" type="button" title="Search file" onClick={openSearch}>
              <Search size={16} />
            </button>
          ) : null}
          {showRenderedMarkdown && tocItems.length > 0 ? (
            <button
              className={`icon-button ${tocOpen ? 'active' : ''}`}
              type="button"
              title="Toggle table of contents"
              onClick={() => setTocOpen((v) => !v)}
            >
              <List size={16} />
            </button>
          ) : null}
          <button className="icon-button" type="button" title="Copy file" onClick={copyContent}>
            {copied ? (
              <span key="check" className="icon-swap"><Check size={16} /></span>
            ) : (
              <span key="copy" className="icon-swap"><Copy size={16} /></span>
            )}
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
      ) : showMediaPreview && isImage && mediaUrl ? (
        <div className="scrollbar-thin scroll-mask flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface-inset p-6">
          <img className="max-h-full max-w-full rounded object-contain" src={mediaUrl} alt={tab.relPath} />
        </div>
      ) : showMediaPreview && isAudio && mediaUrl ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-inset p-8">
          <audio controls className="w-full max-w-2xl" src={mediaUrl} />
        </div>
      ) : showMediaPreview && isVideo && mediaUrl ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-inset p-4">
          <video controls className="max-h-full max-w-full rounded" src={mediaUrl} />
        </div>
      ) : showMediaPreview && isPdf && mediaUrl ? (
        <iframe
          className="min-h-0 flex-1 border-none"
          src={mediaUrl}
          title={tab.relPath}
          style={{ width: '100%', height: '100%' }}
        />
      ) : showRenderedMarkdown ? (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="markdown-viewer-scroll scrollbar-thin scroll-mask-y min-h-0 min-w-0 flex-1 overflow-auto" ref={scrollRef}>
            <div ref={previewRef} className="markdown-preview">
              <Streamdown
                components={mdHeadingComponents}
                plugins={resolvedTheme === 'dark' ? streamdownPluginsDark : streamdownPluginsLight}
              >
                {markdownText}
              </Streamdown>
            </div>
          </div>
          {tocItems.length > 0 ? (
            <MarkdownToc items={tocItems} activeId={activeTocId} scrollContainerRef={scrollRef} collapsed={!tocOpen} />
          ) : null}
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
