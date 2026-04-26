import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import {
  getSharedHighlighter,
  type BundledLanguage,
  type DiffsHighlighter,
} from "@pierre/diffs";
import {
  ChevronDown,
  ChevronUp,
  Code,
  Copy,
  FileCode,
  Image,
  MessageSquarePlus,
  Search,
  X,
} from "lucide-react";
import type { Tab, Workspace } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";

type FileTab = Extract<Tab, { type: "file" }>;

type FileEditorProps = {
  tab: FileTab;
  workspace: Workspace;
};

type MarkdownMode = "rendered" | "raw";

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
  selectedText: string;
  note: string;
};

const LANG_MAP: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  py: "python",
  go: "go",
  rs: "rust",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  graphql: "graphql",
  vue: "html",
  svelte: "html",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  dart: "dart",
  lua: "lua",
  r: "r",
  perl: "perl",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  clj: "clojure",
  zig: "zig",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
  "avif",
]);

function isImageFile(relPath: string): boolean {
  const ext = relPath.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

function langForPath(path: string): BundledLanguage {
  const name = path.split("/").pop() ?? "";
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  if (lower === ".gitignore") return "text";
  if (lower === ".env" || lower.startsWith(".env.")) return "shellscript";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? "text";
}

const ALL_LANGS: BundledLanguage[] = [...new Set(Object.values(LANG_MAP))];
const SEARCH_HIGHLIGHT = "forgepad-file-search";
const ACTIVE_SEARCH_HIGHLIGHT = "forgepad-file-search-active";

let hlPromise: Promise<DiffsHighlighter> | null = null;

function getHl(): Promise<DiffsHighlighter> {
  if (!hlPromise) {
    hlPromise = getSharedHighlighter({
      themes: ["pierre-dark"],
      langs: ALL_LANGS,
    });
  }
  return hlPromise;
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function getHighlightSupport() {
  const registry = (CSS as unknown as { highlights?: HighlightRegistryLike })
    .highlights;
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
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node = walker.nextNode();

  while (node) {
    const text = node.textContent ?? "";
    nodes.push({ node: node as Text, start: offset, end: offset + text.length });
    offset += text.length;
    node = walker.nextNode();
  }

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

  const text = root.textContent ?? "";
  const caseSensitive = /[A-Z]/.test(normalizedQuery);
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? normalizedQuery : normalizedQuery.toLowerCase();
  const nodes = collectTextNodes(root);
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

function addLineMetadata(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("code").forEach((code) => {
    for (const node of [...code.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && /^\s+$/.test(node.textContent ?? "")) {
        node.remove();
      }
    }
  });
  template.content
    .querySelectorAll<HTMLElement>(".line")
    .forEach((line, index) => {
      line.dataset.line = String(index + 1);
    });
  return template.innerHTML;
}

function closestLineNumber(node: Node, root: HTMLElement): number | null {
  let element: Element | null =
    node instanceof Element ? node : node.parentElement;

  while (element && element !== root) {
    if (element instanceof HTMLElement && element.dataset.line) {
      const parsed = Number(element.dataset.line);
      return Number.isFinite(parsed) ? parsed : null;
    }
    element = element.parentElement;
  }

  return null;
}

function scrollRangeIntoContainer(range: Range, container: HTMLElement) {
  const rect = range.getBoundingClientRect();
  const fallback = range.getClientRects()[0];
  const target = rect.width || rect.height ? rect : fallback;
  if (!target) return;

  const containerRect = container.getBoundingClientRect();
  container.scrollTo({
    top:
      container.scrollTop +
      target.top -
      containerRect.top -
      container.clientHeight / 2,
    left:
      container.scrollLeft +
      target.left -
      containerRect.left -
      Math.min(80, container.clientWidth / 4),
    behavior: "smooth",
  });
}

export function FileEditor({ tab, workspace }: FileEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectionFormRef = useRef<HTMLFormElement>(null);
  const [fileText, setFileText] = useState("");
  const [highlighted, setHighlighted] = useState("");
  const [lineCount, setLineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>("rendered");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRanges, setSearchRanges] = useState<Range[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [pendingSelection, setPendingSelection] =
    useState<PendingCodeSelection | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageViewMode, setImageViewMode] = useState<"preview" | "raw">(
    "preview",
  );
  const addToast = useAppStore((state) => state.addToast);
  const addContextFiles = useAppStore((state) => state.addContextFiles);
  const addCodeSelection = useAppStore((state) => state.addCodeSelection);
  const lang = useMemo(() => langForPath(tab.relPath), [tab.relPath]);
  const markdownFile = useMemo(() => isMarkdownPath(tab.relPath), [tab.relPath]);
  const isImage = useMemo(() => isImageFile(tab.relPath), [tab.relPath]);
  const showRenderedMarkdown = markdownFile && markdownMode === "rendered";
  const showImagePreview = isImage && imageViewMode === "preview";
  const activeSearchLabel =
    searchQuery.trim() && searchRanges.length > 0
      ? `${(activeMatchIndex % searchRanges.length) + 1}/${searchRanges.length}`
      : searchQuery.trim()
        ? "0/0"
        : "";

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setFileText("");
    setHighlighted("");
    setSearchRanges([]);
    setPendingSelection(null);
    setImageUrl("");

    if (isImage) {
      window.forgepad.fs
        .readFileAsDataUrl(workspace.worktreePath, tab.relPath)
        .then((dataUrl) => {
          if (!disposed) setImageUrl(dataUrl);
        })
        .catch((error) =>
          addToast(
            "error",
            error instanceof Error ? error.message : "Failed to load image.",
          ),
        )
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }

    let fileText = "";

    window.forgepad.fs
      .readFile(workspace.worktreePath, tab.relPath)
      .then((text) => {
        if (disposed) return;
        fileText = text;
        setFileText(text);
        setLineCount(text.split("\n").length);
        return getHl();
      })
      .then((hl) => {
        if (!hl || disposed) return;
        const loaded = (hl.getLoadedLanguages() as string[]).includes(lang)
          ? lang
          : "text";
        return hl.codeToHtml(fileText, { lang: loaded, theme: "pierre-dark" });
      })
      .then((html) => {
        if (!disposed && html) setHighlighted(addLineMetadata(html));
      })
      .catch((error) => {
        if (isImage) return;
        addToast(
          "error",
          error instanceof Error ? error.message : "Failed to load file.",
        );
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [addToast, tab.relPath, workspace.worktreePath, lang, isImage]);

  useEffect(() => {
    setMarkdownMode("rendered");
    setPendingSelection(null);
    setImageViewMode("preview");
  }, [tab.relPath]);

  useEffect(() => {
    if (showRenderedMarkdown) setPendingSelection(null);
  }, [showRenderedMarkdown]);

  useLayoutEffect(() => {
    clearSearchHighlights();

    if (!searchOpen || loading || !previewRef.current || !searchQuery.trim()) {
      setSearchRanges([]);
      return;
    }

    setSearchRanges(buildSearchRanges(previewRef.current, searchQuery));

    return clearSearchHighlights;
  }, [
    highlighted,
    fileText,
    loading,
    searchOpen,
    searchQuery,
    showRenderedMarkdown,
  ]);

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
      support.registry.set(
        SEARCH_HIGHLIGHT,
        new support.HighlightCtor(...passiveRanges),
      );
    }

    if (activeRange) {
      support.registry.set(
        ACTIVE_SEARCH_HIGHLIGHT,
        new support.HighlightCtor(activeRange),
      );
    }

    return clearSearchHighlights;
  }, [activeMatchIndex, searchOpen, searchRanges]);

  useEffect(() => {
    if (!searchOpen || searchRanges.length === 0) return;
    const activeRange = searchRanges[activeMatchIndex % searchRanges.length];
    const scrollContainer = scrollRef.current;
    if (scrollContainer) scrollRangeIntoContainer(activeRange, scrollContainer);
  }, [activeMatchIndex, searchOpen, searchRanges]);

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
    setSearchQuery("");
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

      if (mod && key === "f") {
        event.preventDefault();
        openSearch();
        return;
      }

      if (!searchOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
      }

      if (event.key === "Enter" && document.activeElement === searchInputRef.current) {
        event.preventDefault();
        goToMatch(event.shiftKey ? -1 : 1);
        return;
      }

      if (mod && key === "g") {
        event.preventDefault();
        goToMatch(event.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeSearch, goToMatch, openSearch, searchOpen]);

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(fileText);
      addToast("success", "Copied to clipboard");
    } catch {
      addToast("error", "Failed to copy");
    }
  };

  const captureCodeSelection = useCallback(() => {
    if (showRenderedMarkdown || loading) return;
    if (selectionFormRef.current?.contains(document.activeElement)) return;

    const root = previewRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (
      !root.contains(range.startContainer) ||
      !root.contains(range.endContainer)
    ) {
      return;
    }

    const selectedText = selection.toString();
    if (!selectedText.trim()) return;

    const startLine = closestLineNumber(range.startContainer, root);
    const endLine = closestLineNumber(range.endContainer, root);
    if (!startLine || !endLine) return;

    setPendingSelection((current) => ({
      startLine: Math.min(startLine, endLine),
      endLine: Math.max(startLine, endLine),
      selectedText,
      note: current?.selectedText === selectedText ? current.note : "",
    }));
  }, [loading, showRenderedMarkdown]);

  const submitCodeSelection = () => {
    if (!pendingSelection || !pendingSelection.note.trim()) return;
    addCodeSelection(
      workspace.id,
      tab.relPath,
      {
        start: pendingSelection.startLine,
        end: pendingSelection.endLine,
        selectedText: pendingSelection.selectedText,
      },
      pendingSelection.note,
    );
    window.getSelection()?.removeAllRanges();
    setPendingSelection(null);
    addToast("success", "Saved code selection to context");
  };

  return (
    <section className="absolute inset-0 flex min-h-0 min-w-0 flex-col bg-bg">
      <div className="flex min-h-[42px] items-center justify-between gap-3 border-b border-border bg-panel px-3">
        <div className="min-w-0 flex items-center gap-[7px] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-[620]" title={tab.relPath}>
          <FileCode size={14} className="text-muted" />
          {tab.relPath}
          <span className="text-muted">{lineCount} lines</span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {isImage ? (
            <div className="view-mode-toggle">
              <button
                className={`view-mode-btn ${imageViewMode === "preview" ? "active" : ""}`}
                type="button"
                title="Preview"
                onClick={() => setImageViewMode("preview")}
              >
                <Image size={14} />
              </button>
              <button
                className={`view-mode-btn ${imageViewMode === "raw" ? "active" : ""}`}
                type="button"
                title="Raw"
                onClick={() => setImageViewMode("raw")}
              >
                <Code size={14} />
              </button>
            </div>
          ) : null}
          {markdownFile ? (
            <div className="segmented-control" role="group" aria-label="Markdown view">
              <button
                type="button"
                className={markdownMode === "rendered" ? "active" : ""}
                onClick={() => setMarkdownMode("rendered")}
              >
                Rendered
              </button>
              <button
                type="button"
                className={markdownMode === "raw" ? "active" : ""}
                onClick={() => setMarkdownMode("raw")}
              >
                Raw
              </button>
            </div>
          ) : null}
          <button
            className="secondary-button"
            type="button"
            onClick={() => addContextFiles(workspace.id, [tab.relPath])}
          >
            Add Context
          </button>
          <button
            className="icon-button"
            type="button"
            title="Search file"
            onClick={openSearch}
          >
            <Search size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Copy file"
            onClick={copyContent}
          >
            <Copy size={16} />
          </button>
        </div>
      </div>
      {searchOpen ? (
        <form
          className="flex min-h-[38px] items-center gap-2 border-b border-border bg-[#11151c] px-2.5 py-1"
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
          <span className="w-[54px] text-center text-xs tabular-nums text-muted">{activeSearchLabel}</span>
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
          <button
            className="icon-button"
            type="button"
            title="Close search"
            onClick={closeSearch}
          >
            <X size={15} />
          </button>
        </form>
      ) : null}
      {loading ? (
        <div className="grid min-h-[90px] place-items-center text-muted">Loading file</div>
      ) : showImagePreview && imageUrl ? (
        <div className="flex flex-1 min-h-0 items-center justify-center overflow-auto bg-[#0c0d10] p-6 scrollbar-thin">
          <img
            className="max-h-full max-w-full rounded object-contain"
            src={imageUrl}
            alt={tab.relPath}
          />
        </div>
      ) : showRenderedMarkdown ? (
        <div className="markdown-viewer-scroll flex-1 min-h-0 overflow-auto scrollbar-thin" ref={scrollRef}>
          <div ref={previewRef} className="markdown-preview">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeSanitize]}
            >
              {fileText}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <div
          className="code-viewer-scroll flex-1 min-h-0 overflow-auto bg-[#0c0d10]"
          ref={scrollRef}
          onMouseUp={captureCodeSelection}
          onKeyUp={captureCodeSelection}
        >
          <div
            ref={previewRef}
            className="code-viewer"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </div>
      )}
      {pendingSelection ? (
        <form
          ref={selectionFormRef}
          className="grid grid-cols-[minmax(160px,240px)_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border bg-[#12161d] px-2.5 py-2 shadow-[0_-12px_28px_rgba(0,0,0,0.18)]"
          onSubmit={(event) => {
            event.preventDefault();
            submitCodeSelection();
          }}
        >
          <div className="flex min-w-0 items-center gap-[7px] text-xs text-muted">
            <MessageSquarePlus size={15} />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={tab.relPath}>
              {tab.relPath} · L{pendingSelection.startLine}
              {pendingSelection.endLine !== pendingSelection.startLine
                ? `-L${pendingSelection.endLine}`
                : ""}
            </span>
          </div>
          <textarea
            value={pendingSelection.note}
            placeholder="Add a note for this selection"
            onChange={(event) => {
              const note = event.currentTarget.value;
              setPendingSelection((current) =>
                current ? { ...current, note } : current,
              );
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submitCodeSelection();
              }
            }}
          />
          <div className="flex items-center gap-[7px]">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setPendingSelection(null)}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={!pendingSelection.note.trim()}
            >
              Add
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
