import { Files, GitCompare, PanelRightClose, SendHorizontal } from "lucide-react";
import type { RightPanelMode } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";
import { FilesPanel } from "./FilesPanel";
import { ChangesPanel } from "./ChangesPanel";
import { ContextPanel } from "./ContextPanel";

const modes: Array<{ mode: RightPanelMode; label: string; icon: typeof Files }> = [
  { mode: "files", label: "Files", icon: Files },
  { mode: "changes", label: "Changes", icon: GitCompare },
  { mode: "context", label: "Context", icon: SendHorizontal },
];

export function RightPanel() {
  const mode = useAppStore((state) => state.rightPanelMode);
  const setMode = useAppStore((state) => state.setRightPanelMode);

  return (
    <aside className="right-panel">
      <div className="right-panel-header">
        <div className="segmented-control">
          {modes.map(({ mode: nextMode, label, icon: Icon }) => (
            <button
              className={nextMode === mode ? "active" : ""}
              key={nextMode}
              type="button"
              title={label}
              onClick={() => setMode(nextMode)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          type="button"
          title="Collapse side panel"
          onClick={() => useAppStore.setState({ rightPanelOpen: false })}
        >
          <PanelRightClose size={16} />
        </button>
      </div>
      {mode === "files" ? <FilesPanel /> : null}
      {mode === "changes" ? <ChangesPanel /> : null}
      {mode === "context" ? <ContextPanel /> : null}
    </aside>
  );
}
