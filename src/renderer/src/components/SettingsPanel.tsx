import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Columns2,
  GripVertical,
  Keyboard,
  Paintbrush,
  Plus,
  RotateCcw,
  Rows2,
  Settings,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { type BrailleSpinnerName, spinners } from "unicode-animations";
import { PatchDiff } from "@pierre/diffs/react";
import { Spinner } from "./Spinner";
import { useAppStore, type SettingsSection } from "@renderer/store/app-store";
import { useResolvedTheme } from "@renderer/App";
import { agentPresetIcon } from "./AgentIcons";
import { SegmentedControl } from "./SegmentedControl";
import { ShortcutRecorder } from "./ShortcutRecorder";
import { ThemePicker } from "./ThemePicker";
import type { AgentPreset, ShortcutCategory } from "@shared/types";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
} from "@shared/types";

/* ─── Sample diff for live preview ─── */

const SAMPLE_PATCH = `--- a/src/utils/format.ts
+++ b/src/utils/format.ts
@@ -1,12 +1,14 @@
-import { format } from 'date-fns';
+import { format, formatDistanceToNow } from 'date-fns';

 export function formatDate(date: Date): string {
-  return format(date, 'yyyy-MM-dd');
+  return format(date, 'MMM d, yyyy');
 }

-export function formatTime(date: Date): string {
-  return format(date, 'HH:mm:ss');
+export function formatRelative(date: Date): string {
+  return formatDistanceToNow(date, { addSuffix: true });
 }
+
+export const DATE_FORMAT = 'MMM d, yyyy' as const;
`;

/* ─── Sidebar nav items ─── */

type SectionId = SettingsSection;

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <Paintbrush size={15} /> },
  { id: "agent", label: "Agent", icon: <Bot size={15} /> },
  { id: "terminal", label: "Terminal", icon: <Terminal size={15} /> },
  { id: "changes", label: "Changes", icon: <Rows2 size={15} /> },
  { id: "advanced", label: "Advanced", icon: <Settings size={15} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard size={15} /> },
];

/* ─── Reusable UI primitives ─── */

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-[13px] font-[510] text-text">{label}</div>
        {description && (
          <div className="mt-0.5 text-[11px] leading-tight text-subtle">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-4 text-[15px] font-[590] text-text">{title}</h3>;
}

function Divider() {
  return <div className="my-4 border-t border-border" />;
}

function NumberStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        className="icon-button small border-transparent"
        type="button"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <ChevronDown size={14} />
      </button>
      <span className="w-8 text-center text-[13px] text-text tabular-nums">
        {value}
      </span>
      <button
        className="icon-button small border-transparent"
        type="button"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <ChevronUp size={14} />
      </button>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={`relative inline-flex h-5 w-8 items-center rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-panel-3"
      }`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`inline-block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[14px]" : ""
        }`}
      />
    </button>
  );
}

/* ─── Agent preset components ─── */

function PresetIcon({
  preset,
  size = 16,
}: {
  preset: AgentPreset;
  size?: number;
}) {
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
            ? "border-accent/40 bg-accent-surface"
            : "border-border bg-panel-2"
          : "border-border/50 bg-panel opacity-60"
      }`}
    >
      <span className="shrink-0 cursor-grab text-subtle hover:text-text">
        <GripVertical size={14} />
      </span>
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-panel-3 text-text">
        <PresetIcon preset={preset} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-[510] text-text">
            {preset.label}
          </span>
          {isDefault && (
            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
              Default
            </span>
          )}
          {preset.builtIn && (
            <span className="rounded-full bg-panel-3 px-1.5 py-0.5 text-[10px] text-subtle">
              Built-in
            </span>
          )}
        </div>
        <code className="mt-0.5 block truncate font-mono text-[11px] text-subtle">
          {preset.command}
        </code>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {preset.enabled && !isDefault && (
          <button
            className="hidden h-6 items-center rounded px-2 text-[11px] text-muted hover:bg-panel-3 hover:text-text group-hover:flex"
            type="button"
            title="Set as default"
            onClick={onSetDefault}
          >
            Set default
          </button>
        )}
        <button
          className="icon-button small border-transparent opacity-0 transition-opacity group-hover:opacity-100"
          type="button"
          title="Edit preset"
          onClick={onEdit}
        >
          <Settings size={13} />
        </button>
        {!preset.builtIn && (
          <button
            className="icon-button small border-transparent opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
            type="button"
            title="Delete preset"
            onClick={onRemove}
          >
            <Trash2 size={13} />
          </button>
        )}
        <Toggle
          checked={preset.enabled}
          onChange={onToggleEnabled}
          label={preset.enabled ? "Disable" : "Enable"}
        />
      </div>
    </div>
  );
}

function EditPresetDialog({
  preset,
  onSave,
  onClose,
}: {
  preset: AgentPreset | null;
  onSave: (data: {
    label: string;
    command: string;
    restoreTemplate?: string;
  }) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(preset?.label ?? "");
  const [command, setCommand] = useState(preset?.command ?? "");
  const [restoreTemplate, setRestoreTemplate] = useState(
    preset?.restoreTemplate ?? "",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  const canSave = label.trim().length > 0 && command.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/85"
      onMouseDown={onClose}
    >
      <div
        className="w-[min(480px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-surface-dialog shadow-[0_28px_70px_rgba(0,0,0,0.46)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <span className="text-[15px] font-[590] text-text">
            {preset ? "Edit Preset" : "Add Preset"}
          </span>
          <button
            className="icon-button border-transparent"
            type="button"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <label
              className="text-[12px] font-[510] text-subtle"
              htmlFor="preset-label"
            >
              Name
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
            <label
              className="text-[12px] font-[510] text-subtle"
              htmlFor="preset-command"
            >
              Command
            </label>
            <input
              id="preset-command"
              className="h-8 w-full rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              value={command}
              placeholder="my-agent --flag"
              onChange={(e) => setCommand(e.currentTarget.value)}
            />
          </div>

          <div>
            <button
              className="flex items-center gap-1.5 text-[12px] text-subtle hover:text-text"
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? (
                <ChevronUp size={13} />
              ) : (
                <ChevronDown size={13} />
              )}
              Advanced
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-1.5">
                <label
                  className="text-[12px] font-[510] text-subtle"
                  htmlFor="preset-restore"
                >
                  Restore command template{" "}
                  <span className="text-subtle/60">
                    (optional, use {"{sessionId}"})
                  </span>
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
            Cancel
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
            {preset ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Spinner presets filtered to ≤2 chars wide (suitable for sidebar). */
const SPINNER_OPTIONS: { name: BrailleSpinnerName; label: string }[] = (
  Object.keys(spinners) as BrailleSpinnerName[]
)
  .filter((name) => {
    const maxLen = Math.max(...spinners[name].frames.map((f) => [...f].length));
    return maxLen <= 2;
  })
  .map((name) => ({ name, label: name }));

/* ─── Section: General ─── */

function GeneralSection() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <div>
      <SectionHeader title="General" />

      <SettingRow label="Theme" description="Application color scheme">
        <ThemePicker
          value={settings.theme}
          label="Theme"
          includeSystem
          onChange={(v) => updateSettings({ theme: v })}
        />
      </SettingRow>

      <SettingRow
        label="Editor Font Size"
        description="Font size for the code editor"
      >
        <NumberStepper
          value={settings.editorFontSize}
          min={10}
          max={24}
          onChange={(v) => updateSettings({ editorFontSize: v })}
        />
      </SettingRow>

      <SettingRow
        label="Open With"
        description="Default external editor / tool for opening files"
      >
        <select
          className="h-8 rounded-md border border-border bg-panel-2 px-2.5 text-[13px] text-text outline-none focus:border-accent/60"
          value={settings.defaultOpenWith}
          onChange={(e) =>
            updateSettings({ defaultOpenWith: e.currentTarget.value })
          }
        >
          <option value="finder">Finder</option>
          <option value="vscode">VS Code</option>
          <option value="terminal">Terminal</option>
        </select>
      </SettingRow>

      <Divider />

      <div className="py-2">
        <div className="mb-1 text-[13px] font-[510] text-text">
          Loading Animation
        </div>
        <div className="mb-3 text-[11px] leading-tight text-subtle">
          Spinner shown in sidebar when an agent is working
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SPINNER_OPTIONS.map(({ name, label }) => (
            <button
              key={name}
              type="button"
              className={`flex h-9 items-center gap-2.5 rounded-lg border px-3 text-left transition-colors${
                settings.spinnerStyle === name
                  ? " border-accent/60 bg-accent-surface text-text"
                  : " border-border bg-panel-2 text-muted hover:bg-panel-3 hover:text-text"
              }`}
              onClick={() => updateSettings({ spinnerStyle: name })}
            >
              <span className="w-4 shrink-0 text-center text-[14px] leading-none text-accent">
                <Spinner name={name} />
              </span>
              <span className="truncate text-[12px]">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Section: Agent ─── */

function AgentSection() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const addAgentPreset = useAppStore((state) => state.addAgentPreset);
  const removeAgentPreset = useAppStore((state) => state.removeAgentPreset);
  const updateAgentPreset = useAppStore((state) => state.updateAgentPreset);

  const [editingPreset, setEditingPreset] = useState<
    AgentPreset | null | "new"
  >(null);

  const presets = settings.agentPresets;
  const defaultCommand = settings.defaultAgentCommand;

  const handleToggleEnabled = (preset: AgentPreset) => {
    updateAgentPreset(preset.id, { enabled: !preset.enabled });
  };

  const handleSetDefault = (preset: AgentPreset) => {
    updateSettings({ defaultAgentCommand: preset.command });
  };

  const handleSaveEdit = (data: {
    label: string;
    command: string;
    restoreTemplate?: string;
  }) => {
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
    if (window.confirm(`Delete preset "${preset.label}"?`)) {
      removeAgentPreset(preset.id);
    }
  };

  return (
    <div>
      <SectionHeader title="Agent" />

      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-[510] text-text">Agent Presets</div>
          <p className="text-[11px] text-subtle">
            Configure and sort AI coding assistants
          </p>
        </div>
        <button
          className="secondary-button small"
          type="button"
          onClick={() => setEditingPreset("new")}
        >
          <Plus size={13} />
          Add
        </button>
      </div>

      <div className="space-y-2">
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

      <Divider />

      <SettingRow
        label="Agent Theme"
        description="Override agent terminal color scheme independently from the app theme"
      >
        <ThemePicker
          value={settings.agentThemeMode}
          label="Agent theme"
          onChange={(v) => updateSettings({ agentThemeMode: v })}
        />
      </SettingRow>

      <SettingRow
        label="Clear Comments on Send"
        description="Automatically remove comments and selections from context after sending"
      >
        <Toggle
          checked={settings.sendAndClearComments}
          onChange={(v) => updateSettings({ sendAndClearComments: v })}
          label="Clear comments on send"
        />
      </SettingRow>

      {editingPreset !== null && (
        <EditPresetDialog
          preset={editingPreset === "new" ? null : editingPreset}
          onSave={handleSaveEdit}
          onClose={() => setEditingPreset(null)}
        />
      )}
    </div>
  );
}

/* ─── Section: Terminal ─── */

function TerminalSection() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <div>
      <SectionHeader title="Terminal" />

      <SettingRow
        label="Default Shell"
        description="Shell to use for new terminals (leave empty for system default)"
      >
        <input
          className="h-8 w-48 rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          value={settings.defaultShell}
          placeholder="/bin/zsh"
          onChange={(e) =>
            updateSettings({ defaultShell: e.currentTarget.value })
          }
        />
      </SettingRow>

      <SettingRow label="Font Size" description="Terminal text size">
        <NumberStepper
          value={settings.terminalFontSize}
          min={10}
          max={24}
          onChange={(v) => updateSettings({ terminalFontSize: v })}
        />
      </SettingRow>

      <SettingRow
        label="Terminal Theme"
        description="Override shell terminal color scheme independently from the app theme"
      >
        <ThemePicker
          value={settings.terminalThemeMode}
          label="Terminal theme"
          onChange={(v) => updateSettings({ terminalThemeMode: v })}
        />
      </SettingRow>
    </div>
  );
}

/* ─── Section: Changes (with live preview) ─── */

function ChangesSection() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const resolvedTheme = useResolvedTheme();

  const diffOptions = useMemo(
    () => ({
      theme:
        resolvedTheme === "dark"
          ? ("pierre-dark" as const)
          : ("pierre-light" as const),
      themeType: resolvedTheme as "dark" | "light",
      diffStyle: settings.diffStyle,
      diffIndicators: settings.diffIndicators,
      lineDiffType: settings.diffLineDiffType,
      overflow: settings.diffOverflow,
      disableBackground: settings.diffDisableBackground,
      disableFileHeader: false,
      expandUnchanged: false,
    }),
    [
      resolvedTheme,
      settings.diffStyle,
      settings.diffIndicators,
      settings.diffLineDiffType,
      settings.diffOverflow,
      settings.diffDisableBackground,
    ],
  );

  return (
    <div>
      <SectionHeader title="Changes" />

      <SettingRow
        label="Layout"
        description="Side-by-side or interleaved diff view"
      >
        <SegmentedControl
          value={settings.diffStyle}
          label="Diff layout"
          options={[
            { value: "split", label: "Split", icon: <Columns2 size={12} /> },
            { value: "unified", label: "Unified", icon: <Rows2 size={12} /> },
          ]}
          onChange={(v) =>
            updateSettings({
              diffStyle: v,
              diffInline: v === "unified",
            })
          }
        />
      </SettingRow>

      <SettingRow
        label="Indicators"
        description="Visual style for added/removed line markers"
      >
        <SegmentedControl
          value={settings.diffIndicators}
          label="Diff indicators"
          options={[
            { value: "bars", label: "Bars" },
            { value: "classic", label: "+/\u2212" },
            { value: "none", label: "None" },
          ]}
          onChange={(v) => updateSettings({ diffIndicators: v })}
        />
      </SettingRow>

      <SettingRow
        label="Inline Diff"
        description="Granularity of inline change highlighting"
      >
        <SegmentedControl
          value={settings.diffLineDiffType}
          label="Inline diff type"
          options={[
            { value: "word-alt", label: "Word Alt" },
            { value: "word", label: "Word" },
            { value: "char", label: "Char" },
            { value: "none", label: "None" },
          ]}
          onChange={(v) => updateSettings({ diffLineDiffType: v })}
        />
      </SettingRow>

      <SettingRow
        label="Overflow"
        description="How long lines are handled in diff view"
      >
        <SegmentedControl
          value={settings.diffOverflow}
          label="Diff overflow"
          options={[
            { value: "scroll", label: "Scroll" },
            { value: "wrap", label: "Wrap" },
          ]}
          onChange={(v) => updateSettings({ diffOverflow: v })}
        />
      </SettingRow>

      <SettingRow
        label="Diff Background"
        description="Show colored background tint on changed lines"
      >
        <Toggle
          checked={!settings.diffDisableBackground}
          onChange={(v) => updateSettings({ diffDisableBackground: !v })}
          label="Diff background"
        />
      </SettingRow>

      {/* Live diff preview */}
      <Divider />
      <div className="mb-2 text-[13px] font-[510] text-text">Preview</div>
      <div className="overflow-hidden rounded-lg border border-border">
        <PatchDiff patch={SAMPLE_PATCH} options={diffOptions} />
      </div>
    </div>
  );
}

/* ─── Section: Advanced ─── */

function AdvancedSection() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const handleReset = () => {
    if (
      window.confirm("Reset all settings to defaults? This cannot be undone.")
    ) {
      updateSettings({ ...DEFAULT_SETTINGS });
    }
  };

  return (
    <div>
      <SectionHeader title="Advanced" />

      <SettingRow
        label="Run Command"
        description="Custom command executed via the Run action"
      >
        <input
          className="h-8 w-48 rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          value={settings.runCommand ?? ""}
          placeholder="npm run dev"
          onChange={(e) =>
            updateSettings({ runCommand: e.currentTarget.value || undefined })
          }
        />
      </SettingRow>

      <Divider />

      <div className="flex items-center justify-between py-2">
        <div>
          <div className="text-[13px] font-[510] text-text">Reset Settings</div>
          <div className="mt-0.5 text-[11px] text-subtle">
            Restore all settings to their default values
          </div>
        </div>
        <button
          className="secondary-button small text-danger hover:border-danger/40 hover:bg-danger/10"
          type="button"
          onClick={handleReset}
        >
          <RotateCcw size={13} />
          Reset All
        </button>
      </div>
    </div>
  );
}

/* ─── Keyboard Shortcuts Section ─── */

const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  navigation: "Navigation",
  tabs: "Tabs",
  panels: "Panels",
  other: "Other",
};

const CATEGORY_ORDER: ShortcutCategory[] = [
  "panels",
  "navigation",
  "tabs",
  "other",
];

function ShortcutsSection() {
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const shortcuts = useMemo(
    () => ({ ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) }),
    [keyboardShortcuts],
  );
  const resetAllShortcuts = useAppStore((s) => s.resetAllShortcuts);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <SectionHeader title="Keyboard Shortcuts" />
        <button
          type="button"
          className="secondary-button small"
          onClick={() => {
            if (window.confirm("Reset all keyboard shortcuts to defaults?")) {
              resetAllShortcuts();
            }
          }}
        >
          <RotateCcw size={13} />
          Reset All
        </button>
      </div>

      <div className="space-y-6">
        {CATEGORY_ORDER.map((cat) => {
          const defs = SHORTCUT_DEFINITIONS.filter((d) => d.category === cat);
          if (defs.length === 0) return null;
          return (
            <div key={cat}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                {CATEGORY_LABELS[cat]}
              </div>
              <div className="divide-y divide-border rounded-lg border border-border bg-panel">
                {defs.map((def) => (
                  <div
                    key={def.id}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-[13px] text-text">{def.label}</span>
                    <ShortcutRecorder
                      actionId={def.id}
                      currentCombo={shortcuts[def.id]}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Settings Page ─── */

const SECTIONS: Record<SectionId, React.ComponentType> = {
  general: GeneralSection,
  agent: AgentSection,
  terminal: TerminalSection,
  changes: ChangesSection,
  advanced: AdvancedSection,
  shortcuts: ShortcutsSection,
};

export function SettingsPanel() {
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const lastSettingsTab = useAppStore(
    (state) => state.settings.lastSettingsTab,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const initialSection: SectionId =
    typeof settingsOpen === "string"
      ? settingsOpen
      : ((lastSettingsTab as SectionId) ?? "general");
  const [activeSection, setActiveSectionLocal] =
    useState<SectionId>(initialSection);

  const setActiveSection = (tab: SectionId) => {
    setActiveSectionLocal(tab);
    updateSettings({ lastSettingsTab: tab });
  };

  const close = () => useAppStore.setState({ settingsOpen: false });

  // Sync section when settingsOpen changes (e.g. QuickSearch → "Agent Settings")
  useEffect(() => {
    if (typeof settingsOpen === "string") {
      setActiveSectionLocal(settingsOpen);
    }
  }, [settingsOpen]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ActiveSection = SECTIONS[activeSection];

  return (
    <div className="flex size-full bg-bg">
      {/* Sidebar navigation */}
      <div className="flex w-[200px] shrink-0 flex-col border-r border-border bg-panel">
        {/* Back button */}
        <div className="flex h-12 items-center border-b border-border px-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted transition-colors hover:bg-panel-2 hover:text-text"
            onClick={close}
          >
            <ArrowLeft size={14} />
            Back
          </button>
        </div>

        {/* Section title */}
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
          <Settings size={16} className="text-muted" />
          <span className="text-[15px] font-[590] text-text">Settings</span>
        </div>

        {/* Nav items */}
        <nav
          className="flex-1 overflow-y-auto px-3 pb-4"
          aria-label="Settings sections"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                activeSection === item.id
                  ? "bg-panel-3 font-[510] text-text"
                  : "text-muted hover:bg-panel-2 hover:text-text"
              }`}
              onClick={() => setActiveSection(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-[1080px] px-10 py-8">
          <ActiveSection />
        </div>
      </div>
    </div>
  );
}
