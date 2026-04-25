import {
  Files,
  GitCompare,
  Maximize2,
  Minimize2,
  PanelRightClose,
  SendHorizontal,
} from "lucide-react";
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
  const rightPanelOpen = useAppStore((state) => state.rightPanelOpen);

  return (
    <aside className="right-panel">
      <div className="right-panel-header">
        <div className="right-panel-tabs">
          {modes.map(({ mode: nextMode, label, icon: Icon }) => (
            <button
              className={`right-panel-tab ${nextMode === mode ? "active" : ""}`}
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
        <div className="right-panel-actions">
          <button
            className="icon-button small"
            type="button"
            title={rightPanelOpen ? "Minimize panel" : "Expand panel"}
            onClick={() => useAppStore.setState({ rightPanelOpen: !rightPanelOpen })}
          >
            {rightPanelOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            className="icon-button small"
            type="button"
            title="Close panel"
            onClick={() => useAppStore.setState({ rightPanelOpen: false })}
          >
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>
      <div className="right-panel-content">
        {mode === "files" ? <FilesPanel /> : null}
        {mode === "changes" ? <ChangesPanel /> : null}
        {mode === "context" ? <ContextPanel /> : null}
      </div>
    </aside>
  );
}
