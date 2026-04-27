import { useEffect, useRef, useState } from "react";
import { Bot, Check, ChevronDown, ChevronUp, GripVertical, Plus, Settings, Trash2, X } from "lucide-react";
import { useAppStore } from "@renderer/store/app-store";
import { agentPresetIcon } from "./AgentIcons";
import type { AgentPreset } from "@shared/types";

function PresetIcon({ preset, size = 16 }: { preset: AgentPreset; size?: number }) {
  const icon = agentPresetIcon(preset.id, size);
  return icon ?? <Bot size={size} />;
}

function AgentPresetRow({
  preset,
  isDefault,
  onToggleEnabled,
  onSetDefault,
  onEdit,
  onRemove,
}: {
  preset: AgentPreset;
  isDefault: boolean;
  onToggleEnabled: () => void;
  onSetDefault: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        preset.enabled
          ? isDefault
            ? "border-accent/40 bg-[#172424]"
            : "border-border bg-panel-2"
          : "border-border/50 bg-panel opacity-60"
      }`}
    >
      <span className="shrink-0 cursor-grab text-subtle hover:text-text">
        <GripVertical size={14} />
      </span>

      {/* Icon */}
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-panel-3 text-text">
        <PresetIcon preset={preset} size={15} />
      </span>

      {/* Label + command */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text">{preset.label}</span>
          {isDefault && (
            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
              默认
            </span>
          )}
          {preset.builtIn && (
            <span className="rounded-full bg-panel-3 px-1.5 py-0.5 text-[10px] text-subtle">
              内置
            </span>
          )}
        </div>
        <code className="mt-0.5 block truncate font-mono text-[11px] text-subtle">
          {preset.command}
        </code>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Set as default */}
        {preset.enabled && !isDefault && (
          <button
            className="hidden h-6 items-center rounded px-2 text-[11px] text-muted hover:bg-panel-3 hover:text-text group-hover:flex"
            type="button"
            title="设为默认"
            onClick={onSetDefault}
          >
            设为默认
          </button>
        )}
        {/* Edit */}
        <button
          className="icon-button small border-transparent opacity-0 transition-opacity group-hover:opacity-100"
          type="button"
          title="编辑预设"
          onClick={onEdit}
        >
          <Settings size={13} />
        </button>
        {/* Remove (non-built-in only) */}
        {!preset.builtIn && (
          <button
            className="icon-button small border-transparent opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
            type="button"
            title="删除预设"
            onClick={onRemove}
          >
            <Trash2 size={13} />
          </button>
        )}
        {/* Toggle enabled */}
        <button
          className={`relative inline-flex h-5 w-8 items-center rounded-full transition-colors ${
            preset.enabled ? "bg-accent" : "bg-panel-3"
          }`}
          type="button"
          title={preset.enabled ? "禁用" : "启用"}
          onClick={onToggleEnabled}
        >
          <span
            className={`inline-block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
              preset.enabled ? "translate-x-[14px]" : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function EditPresetDialog({
  preset,
  onSave,
  onClose,
}: {
  preset: AgentPreset | null; // null = create new
  onSave: (data: { label: string; command: string; restoreTemplate?: string }) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(preset?.label ?? "");
  const [command, setCommand] = useState(preset?.command ?? "");
  const [restoreTemplate, setRestoreTemplate] = useState(preset?.restoreTemplate ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  const canSave = label.trim().length > 0 && command.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40"
      onMouseDown={onClose}
    >
      <div
        className="w-[min(480px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-[#181715] shadow-[0_28px_70px_rgba(0,0,0,0.46)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <span className="text-[15px] font-semibold text-text">
            {preset ? "编辑预设" : "添加预设"}
          </span>
          <button className="icon-button border-transparent" type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-subtle" htmlFor="preset-label">
              名称
            </label>
            <input
              ref={labelRef}
              id="preset-label"
              className="h-8 w-full rounded-md border border-border bg-panel-2 px-3 text-[13px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              value={label}
              placeholder="My Agent"
              onChange={(e) => setLabel(e.currentTarget.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-subtle" htmlFor="preset-command">
              启动命令
            </label>
            <input
              id="preset-command"
              className="h-8 w-full rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              value={command}
              placeholder="my-agent --flag"
              onChange={(e) => setCommand(e.currentTarget.value)}
            />
          </div>

          {/* Advanced section */}
          <div>
            <button
              className="flex items-center gap-1.5 text-[12px] text-subtle hover:text-text"
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              高级选项
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-1.5">
                <label className="text-[12px] font-medium text-subtle" htmlFor="preset-restore">
                  恢复命令模板{" "}
                  <span className="text-subtle/60">（可选，使用 {"{sessionId}"}）</span>
                </label>
                <input
                  id="preset-restore"
                  className="h-8 w-full rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
                  value={restoreTemplate}
                  placeholder="my-agent --resume {sessionId}"
                  onChange={(e) => setRestoreTemplate(e.currentTarget.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                label: label.trim(),
                command: command.trim(),
                restoreTemplate: restoreTemplate.trim() || undefined,
              })
            }
          >
            <Check size={14} />
            {preset ? "保存" : "添加"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const addAgentPreset = useAppStore((state) => state.addAgentPreset);
  const removeAgentPreset = useAppStore((state) => state.removeAgentPreset);
  const updateAgentPreset = useAppStore((state) => state.updateAgentPreset);

  const [editingPreset, setEditingPreset] = useState<AgentPreset | null | "new">(null);

  const close = () => useAppStore.setState({ settingsOpen: false });

  // ESC to close
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editingPreset === null) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, editingPreset]);

  if (!settingsOpen) return null;

  const presets = settings.agentPresets;
  const defaultCommand = settings.defaultAgentCommand;

  const handleToggleEnabled = (preset: AgentPreset) => {
    updateAgentPreset(preset.id, { enabled: !preset.enabled });
  };

  const handleSetDefault = (preset: AgentPreset) => {
    updateSettings({ defaultAgentCommand: preset.command });
  };

  const handleSaveEdit = (data: { label: string; command: string; restoreTemplate?: string }) => {
    if (editingPreset === "new") {
      addAgentPreset({
        id: `custom-${Date.now()}`,
        label: data.label,
        command: data.command,
        restoreTemplate: data.restoreTemplate,
        enabled: true,
        builtIn: false,
      });
    } else if (editingPreset) {
      updateAgentPreset(editingPreset.id, {
        label: data.label,
        command: data.command,
        restoreTemplate: data.restoreTemplate,
      });
    }
    setEditingPreset(null);
  };

  const handleRemove = (preset: AgentPreset) => {
    if (window.confirm(`删除预设「${preset.label}」？`)) {
      removeAgentPreset(preset.id);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/32 pt-[48px]"
        onMouseDown={close}
      >
        <div
          className="flex max-h-[calc(100vh-80px)] w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-border bg-[#181715] shadow-[0_28px_70px_rgba(0,0,0,0.46)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2.5">
              <Settings size={16} className="text-muted" />
              <span className="text-[15px] font-semibold text-text">设置</span>
            </div>
            <button className="icon-button border-transparent" type="button" onClick={close}>
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
            {/* Section: Agent 预设 */}
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-text">Agent 预设</h3>
                <p className="text-[11px] text-subtle">
                  配置并排序 AI 编程助手，点击切换启用/禁用
                </p>
              </div>
              <button
                className="secondary-button small"
                type="button"
                onClick={() => setEditingPreset("new")}
              >
                <Plus size={13} />
                添加
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {presets.map((preset) => (
                <AgentPresetRow
                  key={preset.id}
                  preset={preset}
                  isDefault={preset.command === defaultCommand}
                  onToggleEnabled={() => handleToggleEnabled(preset)}
                  onSetDefault={() => handleSetDefault(preset)}
                  onEdit={() => setEditingPreset(preset)}
                  onRemove={() => handleRemove(preset)}
                />
              ))}
            </div>

            {/* Section: 终端字体大小 */}
            <div className="mt-6 border-t border-border pt-5">
              <h3 className="mb-3 text-[13px] font-semibold text-text">终端</h3>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-text">字体大小</span>
                <div className="flex items-center gap-2">
                  <button
                    className="icon-button small border-transparent"
                    type="button"
                    disabled={settings.terminalFontSize <= 10}
                    onClick={() =>
                      updateSettings({ terminalFontSize: settings.terminalFontSize - 1 })
                    }
                  >
                    <ChevronDown size={14} />
                  </button>
                  <span className="w-8 text-center text-[13px] text-text tabular-nums">
                    {settings.terminalFontSize}
                  </span>
                  <button
                    className="icon-button small border-transparent"
                    type="button"
                    disabled={settings.terminalFontSize >= 24}
                    onClick={() =>
                      updateSettings({ terminalFontSize: settings.terminalFontSize + 1 })
                    }
                  >
                    <ChevronUp size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit/Add dialog */}
      {editingPreset !== null && (
        <EditPresetDialog
          preset={editingPreset === "new" ? null : editingPreset}
          onSave={handleSaveEdit}
          onClose={() => setEditingPreset(null)}
        />
      )}
    </>
  );
}
