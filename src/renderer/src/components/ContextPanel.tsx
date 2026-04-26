import {
  Bot,
  ClipboardList,
  Eye,
  FileCode2,
  GitCompare,
  MessageSquare,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useMemo } from "react";
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
  if (item.type === "selection")
    return `${item.relPath} · L${item.startLine}${
      item.endLine !== item.startLine ? `-L${item.endLine}` : ""
    }`;
  return `${item.relPath} · L${item.startLine}${item.endLine !== item.startLine ? `-L${item.endLine}` : ""}`;
}

function itemIcon(item: ContextItem) {
  if (item.type === "file") return <FileCode2 size={15} />;
  if (item.type === "diff") return <GitCompare size={15} />;
  if (item.type === "task") return <ClipboardList size={15} />;
  if (item.type === "selection") return <MessageSquare size={15} />;
  return <MessageSquare size={15} />;
}

export function ContextPanel() {
  const workspace = useActiveWorkspace();
  const contextItems = useAppStore((state) => state.contextItems);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const items = useMemo(
    () => contextItems.filter((item) => item.workspaceId === activeWorkspaceId),
    [contextItems, activeWorkspaceId],
  );
  const settings = useAppStore((state) => state.settings);
  const composerText = useAppStore((state) => state.composerText);
  const lastBundle = useAppStore((state) => state.lastBundle);
  const removeContextItem = useAppStore((state) => state.removeContextItem);
  const clearWorkspaceContext = useAppStore(
    (state) => state.clearWorkspaceContext,
  );
  const setComposerText = useAppStore((state) => state.setComposerText);
  const updateFileNote = useAppStore((state) => state.updateFileNote);
  const updateFileIncludeContent = useAppStore(
    (state) => state.updateFileIncludeContent,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const sendContextToTerminal = useAppStore(
    (state) => state.sendContextToTerminal,
  );
  const openContextPreviewTab = useAppStore(
    (state) => state.openContextPreviewTab,
  );
  const enabledPresets = settings.agentPresets.filter((p) => p.enabled);
  const selectedAgentPreset =
    enabledPresets.find((preset) => preset.command === settings.defaultAgentCommand)
      ?.id ?? "custom";

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
        <label className="agent-command-row">
          <Bot size={15} />
          <span>Agent</span>
          <select
            className="toolbar-select agent-preset-select"
            value={selectedAgentPreset}
            onChange={(event) => {
              const preset = enabledPresets.find(
                (item) => item.id === event.currentTarget.value,
              );
              if (preset) updateSettings({ defaultAgentCommand: preset.command });
            }}
          >
            {enabledPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          <input
            value={settings.defaultAgentCommand}
            onChange={(event) =>
              updateSettings({ defaultAgentCommand: event.currentTarget.value })
            }
            placeholder="codex"
          />
        </label>
        <div className="composer-actions">
          <span>
            {items.length} context item{items.length === 1 ? "" : "s"}
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                const tab = useAppStore.getState().tabs.find(
                  (t) =>
                    t.workspaceId === useAppStore.getState().activeWorkspaceId &&
                    t.type === "terminal",
                );
                if (!tab || tab.type !== "terminal") {
                  useAppStore.getState().addToast("error", "No terminal tab found.");
                  return;
                }
                const text = "Hello from ForgePad! This is a test message.";
                window.forgepad.pty.write(
                  tab.ptyId,
                  `\x1b[200~${text}\x1b[201~\r`,
                );
                useAppStore.getState().addToast("success", "Test sent to terminal.");
              }}
            >
              Send Test
            </button>
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
              {item.type === "selection" ? (
                <>
                  <p>{item.text}</p>
                  <pre className="context-selection-snippet">
                    {item.selectedText}
                  </pre>
                </>
              ) : item.type === "comment" ? (
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
              ) : item.type === "file" ? (
                <>
                  <label className="context-file-option">
                    <input
                      type="checkbox"
                      checked={item.includeContent}
                      onChange={(event) =>
                        updateFileIncludeContent(
                          item.id,
                          event.currentTarget.checked,
                        )
                      }
                    />
                    <span>
                      {item.includeContent
                        ? "Include file contents"
                        : "Reference path only"}
                    </span>
                  </label>
                  <textarea
                    value={item.note ?? ""}
                    onChange={(event) =>
                      updateFileNote(item.id, event.currentTarget.value)
                    }
                    placeholder="Optional note for this file"
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
