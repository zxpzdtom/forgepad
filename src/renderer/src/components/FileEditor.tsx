import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Save } from "lucide-react";
import type { Tab, Workspace } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";

type FileTab = Extract<Tab, { type: "file" }>;

type FileEditorProps = {
  tab: FileTab;
  workspace: Workspace;
};

function languageForPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    scss: "css",
    less: "css",
    html: "html",
    htm: "html",
    md: "markdown",
    py: "python",
    go: "go",
    rs: "rust",
    sh: "shell",
    bash: "shell",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    xml: "xml",
    svg: "xml",
    sql: "sql",
    graphql: "graphql",
    vue: "html",
    svelte: "html",
  };
  return map[ext ?? ""];
}

export function FileEditor({ tab, workspace }: FileEditorProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const editorFontSize = useAppStore((state) => state.settings.editorFontSize);
  const addToast = useAppStore((state) => state.addToast);
  const addContextFiles = useAppStore((state) => state.addContextFiles);
  const unsaved = content !== savedContent;
  const language = useMemo(() => languageForPath(tab.relPath), [tab.relPath]);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    window.forgepad.fs
      .readFile(workspace.worktreePath, tab.relPath)
      .then((value) => {
        if (disposed) return;
        setContent(value);
        setSavedContent(value);
      })
      .catch((error) => addToast("error", error instanceof Error ? error.message : "Failed to read file."))
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [addToast, tab.relPath, workspace.worktreePath]);

  const handleEditorMount: OnMount = useCallback((ed) => {
    editorRef.current = ed;
    setEditorReady(true);
  }, []);

  // Force layout once the editor mounts AND content is ready
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || loading) return;
    // Double rAF ensures the DOM has settled before we measure
    let raf1: number;
    let raf2: number;
    raf1 = requestAnimationFrame(() => {
      ed.layout();
      raf2 = requestAnimationFrame(() => {
        ed.layout();
        ed.revealLine(1);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [loading, editorReady, tab.id]);

  // Re-layout on window resize
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const onResize = () => ed.layout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [editorReady]);

  const save = async () => {
    setSaving(true);
    try {
      await window.forgepad.fs.writeFile(workspace.worktreePath, tab.relPath, content);
      setSavedContent(content);
      addToast("success", `Saved ${tab.relPath}`);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Failed to save file.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (unsaved && !saving) void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, saving, unsaved]);

  return (
    <section className="editor-panel" ref={containerRef}>
      <div className="surface-toolbar">
        <div className="toolbar-title" title={tab.relPath}>
          {tab.relPath}
          {unsaved ? <span className="dirty-dot" title="Unsaved" /> : null}
        </div>
        <div className="toolbar-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => addContextFiles(workspace.id, [tab.relPath])}
          >
            Add Context
          </button>
          <button className="icon-button" type="button" title="Save" disabled={!unsaved || saving} onClick={save}>
            <Save size={16} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="panel-placeholder">Loading file</div>
      ) : (
        <div className="editor-host">
          <Editor
            defaultValue={content}
            language={language}
            theme="vs-dark"
            onMount={handleEditorMount}
            onChange={(value) => setContent(value ?? "")}
            options={{
              fontSize: editorFontSize,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              renderWhitespace: "selection",
              tabSize: 2,
            }}
          />
        </div>
      )}
    </section>
  );
}
