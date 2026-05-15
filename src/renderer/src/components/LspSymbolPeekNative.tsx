import { useAppStore } from '@renderer/store/app-store';
import type { Workspace } from '@shared/types';
import { ArrowLeft, FileCode, X } from 'lucide-react';

type LspSymbolPeekNativeProps = {
  workspace: Workspace;
};

export function LspSymbolPeekNative({ workspace }: LspSymbolPeekNativeProps) {
  const symbolPeek = useAppStore((state) => state.symbolPeek);
  const closeSymbolPeek = useAppStore((state) => state.closeSymbolPeek);
  const openFileTab = useAppStore((state) => state.openFileTab);

  if (!symbolPeek) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-[360px] flex-col border-border border-l bg-bg shadow-xl">
      <div className="flex h-10 shrink-0 items-center gap-2 border-border border-b px-3">
        <button type="button" className="icon-button" onClick={closeSymbolPeek} aria-label="Close symbol peek">
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1 truncate font-medium text-[13px] text-text">{symbolPeek.token}</div>
        <button type="button" className="icon-button" onClick={closeSymbolPeek} aria-label="Close">
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {symbolPeek.locations.map((location) => (
          <button
            key={`${location.filePath}:${location.line}:${location.column}`}
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-panel"
            onClick={() => {
              openFileTab(workspace.id, location.filePath, location.line);
              closeSymbolPeek();
            }}
          >
            <FileCode size={14} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-text">{location.filePath}</span>
            <span className="shrink-0 text-[11px] text-muted">{location.line}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
