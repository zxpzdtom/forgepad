import { useEffect, useMemo, useState } from "react";
import { createHighlighter, type Highlighter } from "shiki";
import { Copy, FileCode } from "lucide-react";
import type { Tab, Workspace } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";

type FileTab = Extract<Tab, { type: "file" }>;

type FileEditorProps = {
  tab: FileTab;
  workspace: Workspace;
};

const LANG_MAP: Record<string, string> = {
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
  py: "python",
  go: "go",
  rs: "rust",
  sh: "shellscript",
  bash: "shellscript",
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
  gitignore: "gitignore",
};

function langForPath(path: string): string {
  const name = path.split("/").pop() ?? "";
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  if (lower === ".gitignore") return "gitignore";
  if (lower === ".env" || lower.startsWith(".env.")) return "shellscript";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? "text";
}

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["pierre-dark"],
      langs: [
        "typescript", "tsx", "javascript", "jsx", "json",
        "css", "scss", "less", "html", "markdown",
        "python", "go", "rust", "shellscript", "yaml",
        "toml", "xml", "sql", "graphql",
        "java", "c", "cpp", "ruby", "php",
        "swift", "kotlin", "scala", "dart", "lua",
        "elixir", "haskell", "zig",
        "dockerfile", "makefile", "gitignore", "text",
      ],
    });
  }
  return highlighterPromise;
}

export function FileEditor({ tab, workspace }: FileEditorProps) {
  const [highlighted, setHighlighted] = useState("");
  const [lineCount, setLineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const addToast = useAppStore((state) => state.addToast);
  const addContextFiles = useAppStore((state) => state.addContextFiles);
  const lang = useMemo(() => langForPath(tab.relPath), [tab.relPath]);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setHighlighted("");

    let fileText = "";

    window.forgepad.fs
      .readFile(workspace.worktreePath, tab.relPath)
      .then((text) => {
        if (disposed) return;
        fileText = text;
        setLineCount(text.split("\n").length);
        return getHighlighter();
      })
      .then((hl) => {
        if (!hl || disposed) return;
        const loadedLang = hl.getLoadedLanguages().includes(lang) ? lang : "text";
        const html = hl.codeToHtml(fileText, { lang: loadedLang, theme: "pierre-dark" });
        if (!disposed) setHighlighted(html);
      })
      .catch((error) =>
        addToast("error", error instanceof Error ? error.message : "Failed to load file."),
      )
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => { disposed = true; };
  }, [addToast, tab.relPath, workspace.worktreePath, lang]);

  const copyContent = async () => {
    // Extract text content from highlighted HTML for clipboard
    const div = document.createElement("div");
    div.innerHTML = highlighted;
    const text = div.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      addToast("success", "Copied to clipboard");
    } catch {
      addToast("error", "Failed to copy");
    }
  };

  return (
    <section className="editor-panel">
      <div className="surface-toolbar">
        <div className="toolbar-title" title={tab.relPath}>
          <FileCode size={14} className="muted" />
          {tab.relPath}
          <span className="toolbar-meta">{lineCount} lines</span>
        </div>
        <div className="toolbar-actions">
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
            title="Copy file"
            onClick={copyContent}
          >
            <Copy size={16} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="panel-placeholder">Loading file</div>
      ) : (
        <div className="code-viewer-scroll">
          <div
            className="code-viewer"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </div>
      )}
    </section>
  );
}
