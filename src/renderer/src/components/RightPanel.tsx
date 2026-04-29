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
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-bg">
      <div className="flex min-h-9 items-center border-b border-border bg-bg">
        <div className="flex min-w-0 flex-1" role="tablist">
          {modes.map(({ mode: nextMode, label, icon: Icon }) => (
            <div
              className={`relative flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 text-[13px] transition-colors select-none${nextMode === mode ? " text-text" : " text-muted hover:text-text"}`}
              key={nextMode}
              role="tab"
              tabIndex={0}
              aria-selected={nextMode === mode}
              title={label}
              onClick={() => setMode(nextMode)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setMode(nextMode);
                }
              }}
            >
              <Icon size={14} />
              <span>{label}</span>
              {nextMode === mode && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-accent" />
              )}
            </div>
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
