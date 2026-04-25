import {
  ClipboardList,
  Eye,
  FileCode2,
  GitCompare,
  MessageSquare,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { ContextItem, Workspace } from "@shared/types";
import { useAppStore } from "@renderer/store/app-store";

function useActiveWorkspace(): Workspace | undefined {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId);
}

function itemTitle(item: ContextItem): string {
  if (item.type === "file") return item.relPath;
  if (item.type === "diff") return `${item.relPath} · ${item.bucket}`;
  if (item.type === "task") return `${item.title} · ${item.status}`;
  return `${item.relPath} · L${item.startLine}${item.endLine !== item.startLine ? `-L${item.endLine}` : ""}`;
}

function itemIcon(item: ContextItem) {
  if (item.type === "file") return <FileCode2 size={15} />;
  if (item.type === "diff") return <GitCompare size={15} />;
  if (item.type === "task") return <ClipboardList size={15} />;
  return <MessageSquare size={15} />;
}

export function ContextPanel() {
  const workspace = useActiveWorkspace();
  const items = useAppStore((state) =>
    state.contextItems.filter(
      (item) => item.workspaceId === state.activeWorkspaceId,
    ),
  );
  const composerText = useAppStore((state) => state.composerText);
  const lastBundle = useAppStore((state) => state.lastBundle);
  const removeContextItem = useAppStore((state) => state.removeContextItem);
  const clearWorkspaceContext = useAppStore(
    (state) => state.clearWorkspaceContext,
  );
  const setComposerText = useAppStore((state) => state.setComposerText);
  const updateFileNote = useAppStore((state) => state.updateFileNote);
  const sendContextToTerminal = useAppStore(
    (state) => state.sendContextToTerminal,
  );
  const openContextPreviewTab = useAppStore(
    (state) => state.openContextPreviewTab,
  );

  if (!workspace) {
    return <div className="panel-placeholder">Open a project first</div>;
  }

  return (
    <section className="panel-body context-panel">
      <div className="composer">
        <textarea
          value={composerText}
          onChange={(event) => setComposerText(event.currentTarget.value)}
          placeholder="Ask the agent what to do with the selected context"
        />
        <div className="composer-actions">
          <span>
            {items.length} context item{items.length === 1 ? "" : "s"}
          </span>
          <button
            className="primary-button"
            type="button"
            onClick={sendContextToTerminal}
          >
            <SendHorizontal size={16} />
            Send
          </button>
        </div>
      </div>

      {lastBundle ? (
        <div className="bundle-note">
          <strong>{lastBundle.relPath}</strong>
          <span>{lastBundle.estimatedTokens.toLocaleString()} tokens est.</span>
          <button
            className="secondary-button"
            type="button"
            onClick={() => openContextPreviewTab(workspace.id)}
          >
            <Eye size={15} />
            Preview Bundle
          </button>
        </div>
      ) : null}

      <div className="context-list">
        {items.length === 0 ? (
          <div className="panel-placeholder slim">
            Select files, diffs, or diff ranges to build context
          </div>
        ) : (
          items.map((item) => (
            <article className="context-item" key={item.id}>
              <div className="context-item-head">
                {itemIcon(item)}
                <strong title={itemTitle(item)}>{itemTitle(item)}</strong>
                <button
                  className="icon-button small"
                  type="button"
                  title="Remove"
                  onClick={() => removeContextItem(item.id)}
                >
                  <X size={14} />
                </button>
              </div>
              {item.type === "comment" ? (
                <p>{item.text}</p>
              ) : item.type === "task" ? (
                <>
                  <p>{item.description || "No task description provided."}</p>
                  <textarea
                    value={item.note ?? ""}
                    onChange={(event) =>
                      updateFileNote(item.id, event.currentTarget.value)
                    }
                    placeholder="Optional note for this task"
                  />
                </>
              ) : (
                <textarea
                  value={item.note ?? ""}
                  onChange={(event) =>
                    updateFileNote(item.id, event.currentTarget.value)
                  }
                  placeholder="Optional note for this item"
                />
              )}
            </article>
          ))
        )}
      </div>

      <button
        className="secondary-button full danger-text"
        type="button"
        disabled={items.length === 0}
        onClick={() => clearWorkspaceContext(workspace.id)}
      >
        <Trash2 size={15} />
        Clear Context
      </button>
    </section>
  );
}
