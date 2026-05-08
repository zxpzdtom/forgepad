import { useCallback, useEffect, useRef, useState } from "react";
import { useResolvedTheme } from "@renderer/App";
import { useTranslation } from "@renderer/i18n";
import { useAppStore } from "@renderer/store/app-store";
import type { Tab, Workspace, WorkspaceChangeEvent } from "@shared/types";
import type { Editor, TLEditorSnapshot } from "tldraw";
import { Tldraw, getSnapshot, loadSnapshot } from "tldraw";
import "tldraw/tldraw.css";

type CanvasTabProps = {
  tab: Extract<Tab, { type: "canvas" }>;
  workspace: Workspace;
};

/**
 * CanvasTab — renders a tldraw whiteboard for the given .tldr file.
 *
 * Uses tldraw v2.4.6 (last Apache 2.0 open-source version).
 *
 * Persistence flow:
 *  1. On mount, read the `.tldr` file from disk (if it exists) and load the snapshot.
 *  2. Subscribe to store changes via editor.store.listen() for auto-save.
 *  3. Watch the workspace directory for external file changes (AI agent writes).
 */
export function CanvasTab({ tab, workspace }: CanvasTabProps) {
  const { t } = useTranslation();
  const resolvedTheme = useResolvedTheme();

  // Editor ref for imperative access
  const editorRef = useRef<Editor | null>(null);
  // Track whether we are currently loading from disk to avoid write-back loops
  const loadingRef = useRef(false);
  // Save debounce timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Track last saved JSON to avoid spurious writes
  const lastSavedRef = useRef<string>("");
  // File reload debounce timer (for external file changes by AI)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Whether the initial file load has completed
  const initialLoadDoneRef = useRef(false);

  const [initError, setInitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const addToast = useAppStore((s) => s.addToast);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const readCanvasFile = useCallback(async (): Promise<TLEditorSnapshot | null> => {
    try {
      const raw = await window.forgepad.fs.readFile(workspace.worktreePath, tab.relPath);
      if (!raw.trim()) return null;
      return JSON.parse(raw) as TLEditorSnapshot;
    } catch {
      return null; // File doesn't exist yet → blank canvas
    }
  }, [workspace.worktreePath, tab.relPath]);

  const writeCanvasFile = useCallback(
    async (snapshot: TLEditorSnapshot) => {
      const json = JSON.stringify(snapshot, null, 2);
      if (json === lastSavedRef.current) return; // no-op if unchanged
      try {
        setSaving(true);
        await window.forgepad.fs.writeFile(workspace.worktreePath, tab.relPath, json);
        lastSavedRef.current = json;
      } catch (err) {
        addToast("error", err instanceof Error ? err.message : t("canvas.saveFailed"));
      } finally {
        setSaving(false);
      }
    },
    [workspace.worktreePath, tab.relPath, addToast, t],
  );

  // ── Load snapshot from disk ─────────────────────────────────────────────

  const loadFromDisk = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const snapshot = await readCanvasFile();
    if (snapshot) {
      loadingRef.current = true;
      try {
        // v2 API: loadSnapshot(store, snapshot) — standalone function
        loadSnapshot(editor.store, snapshot);
        lastSavedRef.current = JSON.stringify(snapshot, null, 2);
      } catch (err) {
        setInitError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        loadingRef.current = false;
      }
    }
    initialLoadDoneRef.current = true;
  }, [readCanvasFile]);

  // ── onMount: called when tldraw editor is ready ──────────────────────────

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Set dark/light mode matching ForgePad theme
      editor.user.updateUserPreferences({
        colorScheme: resolvedTheme,
      });

      // Load file from disk
      void loadFromDisk();

      // Subscribe to store changes for auto-save (debounced)
      const unsubscribe = editor.store.listen(
        () => {
          if (loadingRef.current) return; // skip write-back during load
          if (!initialLoadDoneRef.current) return; // skip before first load completes

          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            // v2 API: getSnapshot(store) — standalone function
            const snapshot = getSnapshot(editor.store);
            void writeCanvasFile(snapshot);
          }, 600);
        },
        { scope: "document" },
      );

      // Return cleanup so tldraw can call it when it unmounts
      return unsubscribe;
    },
    [resolvedTheme, loadFromDisk, writeCanvasFile],
  );

  // ── Sync tldraw theme when ForgePad theme changes ────────────────────────

  useEffect(() => {
    editorRef.current?.user.updateUserPreferences({
      colorScheme: resolvedTheme,
    });
  }, [resolvedTheme]);

  // ── Watch for external file changes (AI agent writes to .tldr file) ──────

  useEffect(() => {
    let watchId: string | null = null;
    let removeListener: (() => void) | null = null;

    window.forgepad.fs
      .watchWorkspace(workspace.worktreePath)
      .then((id) => {
        watchId = id;
        removeListener = window.forgepad.fs.onChanged(id, (event: WorkspaceChangeEvent) => {
          // Only react if our specific .tldr file changed
          const filename = tab.relPath.split("/").pop() ?? "";
          const fileChanged = event.paths.some((p) => p.includes(filename));
          if (!fileChanged) return;
          if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
          reloadTimerRef.current = setTimeout(() => {
            void loadFromDisk();
          }, 300);
        });
      })
      .catch(() => {
        // File watching is best-effort; don't show error for this
      });

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      removeListener?.();
      if (watchId) {
        window.forgepad.fs.unwatchWorkspace(watchId);
      }
    };
  }, [workspace.worktreePath, tab.relPath, loadFromDisk]);

  // ── Flush pending save on unmount ────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // Flush: write immediately if there's a pending save
        const editor = editorRef.current;
        if (editor && initialLoadDoneRef.current) {
          const snapshot = getSnapshot(editor.store);
          void writeCanvasFile(snapshot);
        }
      }
    };
  }, [writeCanvasFile]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (initError) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 bg-bg text-muted">
        <p className="text-sm">{t("canvas.loadError")}</p>
        <p className="max-w-xs font-mono text-[11px] text-subtle">{initError}</p>
        <button
          type="button"
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90"
          onClick={() => {
            setInitError(null);
            void loadFromDisk();
          }}
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="canvas-tab-wrapper relative size-full overflow-hidden">
      {saving && (
        <div className="pointer-events-none absolute right-3 top-3 z-50 flex items-center gap-1.5 rounded-md bg-panel-2/80 px-2 py-1 text-[11px] text-muted backdrop-blur-sm">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
          {t("canvas.saving")}
        </div>
      )}
      <Tldraw
        onMount={handleMount}
        inferDarkMode={false}
      />
    </div>
  );
}
