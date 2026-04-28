import { useEffect, useRef, useCallback } from "react";
import type { Tab } from "@shared/types";

type TabContextMenuProps = {
  tab: Tab;
  workspacePath?: string;
  x: number;
  y: number;
  onClose: () => void;
  onCloseTab: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseAll: (workspaceId: string, type: "terminal" | "file") => void;
  onCloseToRight: (id: string) => void;
  onRename?: (id: string) => void;
};

export function TabContextMenu({
  tab,
  workspacePath,
  x,
  y,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  onCloseToRight,
  onRename,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const isFileType = tab.type === "file";
  const isTerminalType = tab.type === "terminal";
  const fullPath = workspacePath && isFileType ? `${workspacePath}/${tab.relPath}` : null;

  const handleCopyPath = () => {
    if (fullPath) {
      void navigator.clipboard.writeText(fullPath);
    }
    onClose();
  };

  const handleCopyRelPath = () => {
    if (isFileType) {
      void navigator.clipboard.writeText(tab.relPath);
    }
    onClose();
  };

  const handleRevealInFinder = () => {
    if (fullPath) {
      void window.forgepad.shell.showItemInFolder(fullPath);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] grid gap-[2px] rounded-[7px] border border-border bg-panel-2 p-[5px] shadow-[0_14px_32px_rgba(0,0,0,0.3)]"
      style={{ left: x, top: y }}
    >
      {tab.type === "terminal" && tab.isAgent && onRename && (
        <>
          <button
            type="button"
            className="h-7 rounded-[5px] px-[9px] text-left text-[13px] bg-transparent text-text hover:bg-panel-3 cursor-pointer border-none"
            onClick={() => {
              onRename(tab.id);
              onClose();
            }}
          >
            Rename
          </button>
          <div className="mx-[5px] my-[3px] h-px bg-border" />
        </>
      )}
      <button
        type="button"
        className="h-7 rounded-[5px] px-[9px] text-left text-[13px] bg-transparent text-text hover:bg-panel-3 cursor-pointer border-none"
        onClick={() => {
          onCloseTab(tab.id);
          onClose();
        }}
      >
        Close
      </button>
      <button
        type="button"
        className="h-7 rounded-[5px] px-[9px] text-left text-[13px] bg-transparent text-text hover:bg-panel-3 cursor-pointer border-none"
        onClick={() => {
          onCloseOthers(tab.id);
          onClose();
        }}
      >
        Close Others
      </button>
      <button
        type="button"
        className="h-7 rounded-[5px] px-[9px] text-left text-[13px] bg-transparent text-text hover:bg-panel-3 cursor-pointer border-none"
        onClick={() => {
          onCloseToRight(tab.id);
          onClose();
        }}
      >
        Close to Right
      </button>
      <button
        type="button"
        className="h-7 rounded-[5px] px-[9px] text-left text-[13px] bg-transparent text-text hover:bg-panel-3 cursor-pointer border-none"
        onClick={() => {
          onCloseAll(tab.workspaceId, isTerminalType ? "terminal" : "file");
          onClose();
        }}
      >
        Close All
      </button>
      {isFileType && (
        <>
          <div className="mx-[5px] my-[3px] h-px bg-border" />
          <button
            type="button"
            className="h-7 rounded-[5px] px-[9px] text-left text-[13px] bg-transparent text-text hover:bg-panel-3 cursor-pointer border-none"
            onClick={handleCopyPath}
          >
            Copy Path
          </button>
          <button
            type="button"
            className="h-7 rounded-[5px] px-[9px] text-left text-[13px] bg-transparent text-text hover:bg-panel-3 cursor-pointer border-none"
            onClick={handleCopyRelPath}
          >
            Copy Relative Path
          </button>
          <button
            type="button"
            className="h-7 rounded-[5px] px-[9px] text-left text-[13px] bg-transparent text-text hover:bg-panel-3 cursor-pointer border-none"
            onClick={handleRevealInFinder}
          >
            Reveal in Finder
          </button>
        </>
      )}
    </div>
  );
}
