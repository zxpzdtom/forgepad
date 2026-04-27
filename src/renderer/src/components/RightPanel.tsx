import { Files, GitCompare, SendHorizontal } from "lucide-react";
import type { RightPanelMode } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";
import { FilesPanel } from "./FilesPanel";
import { ChangesPanel } from "./ChangesPanel";
import { ContextPanel } from "./ContextPanel";

const modes: Array<{
  mode: RightPanelMode;
  label: string;
  icon: typeof Files;
}> = [
  { mode: "files", label: "Files", icon: Files },
  { mode: "changes", label: "Changes", icon: GitCompare },
  { mode: "context", label: "Context", icon: SendHorizontal },
];

export function RightPanel() {
  const mode = useAppStore((state) => state.rightPanelMode);
  const setMode = useAppStore((state) => state.setRightPanelMode);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-panel">
      <div className="flex min-h-10 items-center border-b border-border bg-panel">
        <div className="flex min-w-0 flex-1">
          {modes.map(({ mode: nextMode, label, icon: Icon }) => (
            <button
              className={`flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 text-[13px] bg-transparent cursor-pointer${nextMode === mode ? " border-b-accent text-text" : " text-muted hover:text-text hover:bg-panel-2"}`}
              key={nextMode}
              type="button"
              title={label}
              onClick={() => setMode(nextMode)}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {mode === "files" ? <FilesPanel /> : null}
        {mode === "changes" ? <ChangesPanel /> : null}
        {mode === "context" ? <ContextPanel /> : null}
      </div>
    </aside>
  );
}
