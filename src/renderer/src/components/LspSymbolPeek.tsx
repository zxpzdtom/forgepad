import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { File as PierreFile } from '@pierre/diffs/react';
import { useResolvedTheme } from '@renderer/App';
import { useAppStore } from '@renderer/store/app-store';
import type { LspLocation, Workspace } from '@shared/types';
import { ArrowLeft, FileCode, X } from 'lucide-react';

type LspSymbolPeekProps = {
  workspace: Workspace;
};

/** Group locations by file path */
function groupByFile(locations: LspLocation[]): Map<string, LspLocation[]> {
  const map = new Map<string, LspLocation[]>();
  for (const loc of locations) {
    const list = map.get(loc.filePath) ?? [];
    list.push(loc);
    map.set(loc.filePath, list);
  }
  return map;
}

export function LspSymbolPeek({ workspace }: LspSymbolPeekProps) {
  const symbolPeek = useAppStore((s) => s.symbolPeek);
  const closeSymbolPeek = useAppStore((s) => s.closeSymbolPeek);
  const openFileTab = useAppStore((s) => s.openFileTab);
  const resolvedTheme = useResolvedTheme();
  const panelRef = useRef<HTMLDivElement>(null);

  const [selectedLocation, setSelectedLocation] = useState<LspLocation | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Auto-select first location when peek opens
  useEffect(() => {
    if (symbolPeek && symbolPeek.locations.length > 0) {
      setSelectedLocation(symbolPeek.locations[0]);
    } else {
      setSelectedLocation(null);
      setPreviewContent('');
    }
  }, [symbolPeek]);

  // Load file content for preview when selected location changes
  useEffect(() => {
    if (!selectedLocation) {
      setPreviewContent('');
      return;
    }
    let disposed = false;
    setLoadingPreview(true);
    window.forgepad.fs
      .readFile(workspace.worktreePath, selectedLocation.filePath)
      .then((content) => {
        if (!disposed) setPreviewContent(content ?? '');
      })
      .catch(() => {
        if (!disposed) setPreviewContent('// Failed to load file');
      })
      .finally(() => {
        if (!disposed) setLoadingPreview(false);
      });
    return () => {
      disposed = true;
    };
  }, [selectedLocation, workspace.worktreePath]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeSymbolPeek();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [closeSymbolPeek]);

  const handleLocationClick = useCallback((loc: LspLocation) => {
    setSelectedLocation(loc);
  }, []);

  const handleLocationDoubleClick = useCallback(
    (loc: LspLocation) => {
      openFileTab(workspace.id, loc.filePath, loc.lineNumber);
      closeSymbolPeek();
    },
    [workspace.id, openFileTab, closeSymbolPeek],
  );

  const handleReturnToOrigin = useCallback(() => {
    if (symbolPeek?.originFile) {
      openFileTab(workspace.id, symbolPeek.originFile);
      closeSymbolPeek();
    }
  }, [symbolPeek, workspace.id, openFileTab, closeSymbolPeek]);

  const grouped = useMemo(() => {
    if (!symbolPeek) return new Map();
    return groupByFile(symbolPeek.locations);
  }, [symbolPeek]);

  const fileData = useMemo(() => {
    if (!selectedLocation || !previewContent) return null;
    return { name: selectedLocation.filePath, contents: previewContent };
  }, [selectedLocation, previewContent]);

  const fileOptions = useMemo(
    () => ({
      theme: (resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light') as 'pierre-dark' | 'pierre-light',
      themeType: resolvedTheme as 'dark' | 'light',
      overflow: 'scroll' as const,
      disableFileHeader: true,
    }),
    [resolvedTheme],
  );

  if (!symbolPeek) return null;

  const { token, locations } = symbolPeek;

  return (
    <div
      ref={panelRef}
      className="symbol-peek-panel flex flex-col border-border border-t bg-panel"
      style={{ height: 280, minHeight: 160 }}
    >
      {/* Header */}
      <div className="flex min-h-9 items-center justify-between gap-2 border-border border-b bg-panel-2 px-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {symbolPeek.originFile && (
            <button
              type="button"
              className="icon-button"
              title="Return to origin"
              onClick={handleReturnToOrigin}
            >
              <ArrowLeft size={14} />
            </button>
          )}
          <span className="truncate font-medium text-[13px]">
            <span className="text-accent">"{token}"</span>
            <span className="text-muted"> — {locations.length} definition{locations.length !== 1 ? 's' : ''}</span>
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          title="Close (Esc)"
          onClick={closeSymbolPeek}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body: split preview + locations list */}
      <div className="flex min-h-0 flex-1">
        {/* Left: code preview */}
        <div className="min-w-0 flex-1 overflow-auto border-border border-r">
          {loadingPreview ? (
            <div className="flex h-full items-center justify-center text-muted text-xs">Loading...</div>
          ) : fileData ? (
            <PierreFile file={fileData} options={fileOptions} disableWorkerPool />
          ) : (
            <div className="flex h-full items-center justify-center text-muted text-xs">
              Select a location to preview
            </div>
          )}
        </div>

        {/* Right: locations list */}
        <div className="w-[280px] min-w-[200px] overflow-auto">
          {[...grouped.entries()].map(([filePath, locs]) => (
            <div key={filePath}>
              <div className="sticky top-0 flex items-center gap-1.5 bg-panel-2 px-2.5 py-1.5">
                <FileCode size={13} className="shrink-0 text-muted" />
                <span className="truncate text-[11px] text-muted" title={filePath}>
                  {filePath}
                </span>
                <span className="ml-auto shrink-0 text-[10px] text-subtle">{locs.length}</span>
              </div>
              {locs.map((loc, idx) => {
                const isActive =
                  selectedLocation?.filePath === loc.filePath && selectedLocation?.lineNumber === loc.lineNumber;
                return (
                  <button
                    key={`${loc.filePath}:${loc.lineNumber}:${idx}`}
                    type="button"
                    className={`flex w-full items-baseline gap-2 px-2.5 py-1 text-left text-[12px] transition-colors hover:bg-accent-surface ${isActive ? 'bg-accent-surface' : ''}`}
                    onClick={() => handleLocationClick(loc)}
                    onDoubleClick={() => handleLocationDoubleClick(loc)}
                  >
                    <span className="shrink-0 font-mono text-[11px] text-subtle">L{loc.lineNumber}</span>
                    <span className="min-w-0 truncate font-mono text-text">{loc.lineText.trim()}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
