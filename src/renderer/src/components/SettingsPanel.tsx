import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PatchDiff } from '@pierre/diffs/react';
import { useResolvedTheme } from '@renderer/App';
import { useTranslation } from '@renderer/i18n';
import { type SettingsSection, useAppStore } from '@renderer/store/app-store';
import type { AgentPreset, ShortcutCategory } from '@shared/types';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, SHORTCUT_DEFINITIONS } from '@shared/types';
import {
  ArrowLeft,
  Bell,
  Bot,
  Cat,
  Check,
  ChevronDown,
  ChevronUp,
  Columns2,
  FolderOpen,
  GitBranch,
  GripVertical,
  Keyboard,
  Paintbrush,
  Plus,
  RotateCcw,
  Rows2,
  Settings,
  SwatchBook,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { agentPresetIcon } from './AgentIcons';
import { AppearancePanel } from './AppearancePanel';
import { DOTMATRIX_SPINNERS } from './dotmatrix';
import { NotificationsSection } from './NotificationsSection';
import { PetsSection } from './PetsSection';
import { SegmentedControl } from './SegmentedControl';
import { ShortcutRecorder } from './ShortcutRecorder';
import { Spinner } from './Spinner';
import { ThemePicker } from './ThemePicker';

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
  { id: 'general', label: 'settings.nav.general', icon: <Paintbrush size={15} /> },
  { id: 'appearance', label: 'settings.nav.appearance', icon: <SwatchBook size={15} /> },
  { id: 'agent', label: 'settings.nav.agent', icon: <Bot size={15} /> },
  { id: 'terminal', label: 'settings.nav.terminal', icon: <Terminal size={15} /> },
  { id: 'changes', label: 'settings.nav.changes', icon: <Rows2 size={15} /> },
  { id: 'notifications', label: 'settings.nav.notifications', icon: <Bell size={15} /> },
  { id: 'git', label: 'settings.nav.git', icon: <GitBranch size={15} /> },
  { id: 'advanced', label: 'settings.nav.advanced', icon: <Settings size={15} /> },
  { id: 'shortcuts', label: 'settings.nav.shortcuts', icon: <Keyboard size={15} /> },
  { id: 'pets', label: 'settings.nav.pets', icon: <Cat size={15} /> },
];

/* ─── Reusable UI primitives ─── */

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="font-[510] text-[13px] text-text">{label}</div>
        {description && <div className="mt-0.5 text-[11px] text-subtle leading-tight">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-4 font-[590] text-[15px] text-text">{title}</h3>;
}

function Divider() {
  return <div className="my-4 border-border border-t" />;
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
      <span className="w-8 text-center text-[13px] text-text tabular-nums">{value}</span>
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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={`relative inline-flex h-5 w-8 items-center rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-panel-3'
      }`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`inline-block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[14px]' : ''
        }`}
      />
    </button>
  );
}

/* ─── Agent preset components ─── */

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
  const { t } = useTranslation();
  return (
    <div
      className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        preset.enabled
          ? isDefault
            ? 'border-accent/40 bg-accent-surface'
            : 'border-border bg-panel-2'
          : 'border-border/50 bg-panel opacity-60'
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
          <span className="font-[510] text-[13px] text-text">{preset.label}</span>
          {isDefault && <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">{t('common.default')}</span>}
          {preset.builtIn && <span className="rounded-full bg-panel-3 px-1.5 py-0.5 text-[10px] text-subtle">{t('common.builtIn')}</span>}
        </div>
        <code className="mt-0.5 block truncate font-mono text-[11px] text-subtle">{preset.command}</code>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {preset.enabled && !isDefault && (
          <button
            className="hidden h-6 items-center rounded px-2 text-[11px] text-muted hover:bg-panel-3 hover:text-text group-hover:flex"
            type="button"
            title={t('settings.agent.setDefault')}
            onClick={onSetDefault}
          >
            {t('settings.agent.setDefault')}
          </button>
        )}
        <button
          className="icon-button small border-transparent opacity-0 transition-opacity group-hover:opacity-100"
          type="button"
          title={t('settings.agent.editPreset')}
          onClick={onEdit}
        >
          <Settings size={13} />
        </button>
        {!preset.builtIn && (
          <button
            className="icon-button small border-transparent opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
            type="button"
            title={t('settings.agent.deletePreset')}
            onClick={onRemove}
          >
            <Trash2 size={13} />
          </button>
        )}
        <Toggle checked={preset.enabled} onChange={onToggleEnabled} label={preset.enabled ? 'Disable' : 'Enable'} />
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
  onSave: (data: { label: string; command: string; restoreTemplate?: string }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(preset?.label ?? '');
  const [command, setCommand] = useState(preset?.command ?? '');
  const [restoreTemplate, setRestoreTemplate] = useState(preset?.restoreTemplate ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  const canSave = label.trim().length > 0 && command.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85" onMouseDown={onClose}>
      <div
        className="w-[min(480px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-surface-dialog shadow-[0_28px_70px_rgba(0,0,0,0.46)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between border-border border-b px-4">
          <span className="font-[590] text-[15px] text-text">{preset ? t('settings.agent.editPresetTitle') : t('settings.agent.addPresetTitle')}</span>
          <button className="icon-button border-transparent" type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <label className="font-[510] text-[12px] text-subtle" htmlFor="preset-label">
              {t('settings.agent.presetName')}
            </label>
            <input
              ref={labelRef}
              id="preset-label"
              className="h-8 w-full rounded-md border border-border bg-panel-2 px-3 text-[13px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              value={label}
              placeholder={t('settings.agent.presetNamePlaceholder')}
              onChange={(e) => setLabel(e.currentTarget.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-[510] text-[12px] text-subtle" htmlFor="preset-command">
              {t('settings.agent.presetCommand')}
            </label>
            <input
              id="preset-command"
              className="h-8 w-full rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
              value={command}
              placeholder={t('settings.agent.presetCommandPlaceholder')}
              onChange={(e) => setCommand(e.currentTarget.value)}
            />
          </div>

          <div>
            <button
              className="flex items-center gap-1.5 text-[12px] text-subtle hover:text-text"
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {t('common.advanced')}
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-1.5">
                <label className="font-[510] text-[12px] text-subtle" htmlFor="preset-restore">
                  {t('settings.agent.restoreTemplate')} <span className="text-subtle/60">{t('settings.agent.restoreTemplateOptional')}</span>
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

        <div className="flex items-center justify-end gap-2 border-border border-t px-4 py-3">
          <button className="secondary-button" type="button" onClick={onClose}>
            {t('common.cancel')}
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
            {preset ? t('common.save') : t('common.add')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** DotMatrix spinner options for the settings picker. */
const SPINNER_OPTIONS = DOTMATRIX_SPINNERS;

/* ─── Section: General ─── */

function GeneralSection() {
  const { t } = useTranslation();
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <div>
      <SectionHeader title={t('settings.general.title')} />

      <SettingRow label={t('settings.general.language')} description={t('settings.general.languageDesc')}>
        <select
          className="h-8 rounded-md border border-border bg-panel-2 px-2.5 text-[13px] text-text outline-none focus:border-accent/60"
          value={settings.locale}
          onChange={(e) => updateSettings({ locale: e.currentTarget.value as 'en' | 'zh-CN' })}
        >
          <option value="en">English</option>
          <option value="zh-CN">中文</option>
        </select>
      </SettingRow>

      <SettingRow label={t('settings.general.theme')} description={t('settings.general.themeDesc')}>
        <ThemePicker value={settings.theme} label="Theme" includeSystem onChange={(v) => updateSettings({ theme: v })} />
      </SettingRow>

      <SettingRow label={t('settings.general.editorFontSize')} description={t('settings.general.editorFontSizeDesc')}>
        <NumberStepper
          value={settings.editorFontSize}
          min={10}
          max={24}
          onChange={(v) => updateSettings({ editorFontSize: v })}
        />
      </SettingRow>

      <SettingRow label={t('settings.general.openWith')} description={t('settings.general.openWithDesc')}>
        <select
          className="h-8 rounded-md border border-border bg-panel-2 px-2.5 text-[13px] text-text outline-none focus:border-accent/60"
          value={settings.defaultOpenWith}
          onChange={(e) => updateSettings({ defaultOpenWith: e.currentTarget.value })}
        >
          <option value="finder">{t('settings.general.openWith.finder')}</option>
          <option value="vscode">{t('settings.general.openWith.vscode')}</option>
          <option value="terminal">{t('settings.general.openWith.terminal')}</option>
        </select>
      </SettingRow>

      <Divider />

      <div className="py-2">
        <div className="mb-1 font-[510] text-[13px] text-text">{t('settings.general.loadingAnimation')}</div>
        <div className="mb-3 text-[11px] text-subtle leading-tight">{t('settings.general.loadingAnimationDesc')}</div>
        <div className="grid grid-cols-3 gap-2">
          {SPINNER_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`flex h-9 items-center gap-2.5 rounded-lg border px-3 text-left transition-colors ${
                settings.spinnerStyle === id
                  ? 'border-accent/60 bg-accent-surface text-text'
                  : 'border-border bg-panel-2 text-muted hover:bg-panel-3 hover:text-text'
              }`}
              onClick={() => updateSettings({ spinnerStyle: id })}
            >
              <span className="shrink-0 text-accent leading-none">
                <Spinner name={id} size={16} dotSize={2} />
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
  const { t } = useTranslation();
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const addAgentPreset = useAppStore((state) => state.addAgentPreset);
  const removeAgentPreset = useAppStore((state) => state.removeAgentPreset);
  const updateAgentPreset = useAppStore((state) => state.updateAgentPreset);

  const [editingPreset, setEditingPreset] = useState<AgentPreset | null | 'new'>(null);

  const presets = settings.agentPresets;
  const defaultCommand = settings.defaultAgentCommand;

  const handleToggleEnabled = (preset: AgentPreset) => {
    updateAgentPreset(preset.id, { enabled: !preset.enabled });
  };

  const handleSetDefault = (preset: AgentPreset) => {
    updateSettings({ defaultAgentCommand: preset.command });
  };

  const handleSaveEdit = (data: { label: string; command: string; restoreTemplate?: string }) => {
    if (editingPreset === 'new') {
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
    if (window.confirm(t('settings.agent.deleteConfirm', { name: preset.label }))) {
      removeAgentPreset(preset.id);
    }
  };

  return (
    <div>
      <SectionHeader title={t('settings.agent.title')} />

      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-[510] text-[13px] text-text">{t('settings.agent.presets')}</div>
          <p className="text-[11px] text-subtle">{t('settings.agent.presetsDesc')}</p>
        </div>
        <button className="secondary-button small" type="button" onClick={() => setEditingPreset('new')}>
          <Plus size={13} />
          {t('common.add')}
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

      <SettingRow label={t('settings.agent.agentTheme')} description={t('settings.agent.agentThemeDesc')}>
        <ThemePicker
          value={settings.agentThemeMode}
          label="Agent theme"
          onChange={(v) => updateSettings({ agentThemeMode: v })}
        />
      </SettingRow>

      <SettingRow
        label={t('settings.agent.clearComments')}
        description={t('settings.agent.clearCommentsDesc')}
      >
        <Toggle
          checked={settings.sendAndClearComments}
          onChange={(v) => updateSettings({ sendAndClearComments: v })}
          label="Clear comments on send"
        />
      </SettingRow>

      {editingPreset !== null && (
        <EditPresetDialog
          preset={editingPreset === 'new' ? null : editingPreset}
          onSave={handleSaveEdit}
          onClose={() => setEditingPreset(null)}
        />
      )}
    </div>
  );
}

/* ─── Section: Terminal ─── */

function TerminalSection() {
  const { t } = useTranslation();
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <div>
      <SectionHeader title={t('settings.terminal.title')} />

      <SettingRow label={t('settings.terminal.defaultShell')} description={t('settings.terminal.defaultShellDesc')}>
        <input
          className="h-8 w-48 rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          value={settings.defaultShell}
          placeholder="/bin/zsh"
          onChange={(e) => updateSettings({ defaultShell: e.currentTarget.value })}
        />
      </SettingRow>

      <SettingRow label={t('settings.terminal.fontSize')} description={t('settings.terminal.fontSizeDesc')}>
        <NumberStepper
          value={settings.terminalFontSize}
          min={10}
          max={24}
          onChange={(v) => updateSettings({ terminalFontSize: v })}
        />
      </SettingRow>

      <SettingRow label={t('settings.terminal.terminalTheme')} description={t('settings.terminal.terminalThemeDesc')}>
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
  const { t } = useTranslation();
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const resolvedTheme = useResolvedTheme();

  const diffOptions = useMemo(
    () => ({
      theme: resolvedTheme === 'dark' ? ('pierre-dark' as const) : ('pierre-light' as const),
      themeType: resolvedTheme as 'dark' | 'light',
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
      <SectionHeader title={t('settings.changes.title')} />

      <SettingRow label={t('settings.changes.layout')} description={t('settings.changes.layoutDesc')}>
        <SegmentedControl
          value={settings.diffStyle}
          label="Diff layout"
          options={[
            { value: 'split', label: t('settings.changes.split'), icon: <Columns2 size={12} /> },
            { value: 'unified', label: t('settings.changes.unified'), icon: <Rows2 size={12} /> },
          ]}
          onChange={(v) =>
            updateSettings({
              diffStyle: v,
              diffInline: v === 'unified',
            })
          }
        />
      </SettingRow>

      <SettingRow label={t('settings.changes.indicators')} description={t('settings.changes.indicatorsDesc')}>
        <SegmentedControl
          value={settings.diffIndicators}
          label="Diff indicators"
          options={[
            { value: 'bars', label: t('settings.changes.bars') },
            { value: 'classic', label: t('settings.changes.classic') },
            { value: 'none', label: t('common.none') },
          ]}
          onChange={(v) => updateSettings({ diffIndicators: v })}
        />
      </SettingRow>

      <SettingRow label={t('settings.changes.inlineDiff')} description={t('settings.changes.inlineDiffDesc')}>
        <SegmentedControl
          value={settings.diffLineDiffType}
          label="Inline diff type"
          options={[
            { value: 'word-alt', label: t('settings.changes.wordAlt') },
            { value: 'word', label: t('settings.changes.word') },
            { value: 'char', label: t('settings.changes.char') },
            { value: 'none', label: t('common.none') },
          ]}
          onChange={(v) => updateSettings({ diffLineDiffType: v })}
        />
      </SettingRow>

      <SettingRow label={t('settings.changes.overflow')} description={t('settings.changes.overflowDesc')}>
        <SegmentedControl
          value={settings.diffOverflow}
          label="Diff overflow"
          options={[
            { value: 'scroll', label: t('settings.changes.scroll') },
            { value: 'wrap', label: t('settings.changes.wrap') },
          ]}
          onChange={(v) => updateSettings({ diffOverflow: v })}
        />
      </SettingRow>

      <SettingRow label={t('settings.changes.diffBackground')} description={t('settings.changes.diffBackgroundDesc')}>
        <Toggle
          checked={!settings.diffDisableBackground}
          onChange={(v) => updateSettings({ diffDisableBackground: !v })}
          label="Diff background"
        />
      </SettingRow>

      {/* Live diff preview */}
      <Divider />
      <div className="mb-2 font-[510] text-[13px] text-text">{t('settings.changes.preview')}</div>
      <div className="overflow-hidden rounded-lg border border-border">
        <PatchDiff patch={SAMPLE_PATCH} options={diffOptions} />
      </div>
    </div>
  );
}

/* ─── Section: Advanced ─── */

function AdvancedSection() {
  const { t } = useTranslation();
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const handleReset = () => {
    if (window.confirm(t('settings.advanced.resetConfirm'))) {
      updateSettings({ ...DEFAULT_SETTINGS });
    }
  };

  return (
    <div>
      <SectionHeader title={t('settings.advanced.title')} />

      <SettingRow label={t('settings.advanced.runCommands')} description={t('settings.advanced.runCommandsDesc')}>
        <div className="space-y-1 text-[12px]">
          {(settings.runCommands ?? []).map((entry, i) => (
            <div key={`${entry.command}-${i}`} className="flex items-center gap-1.5">
              <span className="font-[510] text-text">{entry.name}</span>
              <span className="truncate font-mono text-subtle">{entry.command}</span>
            </div>
          ))}
          {(settings.runCommands ?? []).length === 0 && (
            <span className="text-subtle/60">{t('settings.advanced.noCommands')}</span>
          )}
        </div>
      </SettingRow>

      <Divider />

      <div className="flex items-center justify-between py-2">
        <div>
          <div className="font-[510] text-[13px] text-text">{t('settings.advanced.resetSettings')}</div>
          <div className="mt-0.5 text-[11px] text-subtle">{t('settings.advanced.resetSettingsDesc')}</div>
        </div>
        <button
          className="secondary-button small text-danger hover:border-danger/40 hover:bg-danger/10"
          type="button"
          onClick={handleReset}
        >
          <RotateCcw size={13} />
          {t('settings.advanced.resetAll')}
        </button>
      </div>
    </div>
  );
}

/* ─── Keyboard Shortcuts Section ─── */

const CATEGORY_ORDER: ShortcutCategory[] = ['panels', 'navigation', 'tabs', 'other'];

function ShortcutsSection() {
  const { t } = useTranslation();
  const keyboardShortcuts = useAppStore((s) => s.settings.keyboardShortcuts);
  const shortcuts = useMemo(() => ({ ...DEFAULT_SHORTCUTS, ...(keyboardShortcuts ?? {}) }), [keyboardShortcuts]);
  const resetAllShortcuts = useAppStore((s) => s.resetAllShortcuts);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <SectionHeader title={t('settings.shortcuts.title')} />
        <button
          type="button"
          className="secondary-button small"
          onClick={() => {
            if (window.confirm(t('settings.shortcuts.resetConfirm'))) {
              resetAllShortcuts();
            }
          }}
        >
          <RotateCcw size={13} />
          {t('settings.advanced.resetAll')}
        </button>
      </div>

      <div className="space-y-6">
        {CATEGORY_ORDER.map((cat) => {
          const defs = SHORTCUT_DEFINITIONS.filter((d) => d.category === cat);
          if (defs.length === 0) return null;
          return (
            <div key={cat}>
              <div className="mb-2 font-semibold text-[11px] text-subtle uppercase tracking-wider">{t(`settings.shortcuts.category.${cat}` as any)}</div>
              <div className="divide-y divide-border rounded-lg border border-border bg-panel">
                {defs.map((def) => (
                  <div key={def.id} className="flex items-center justify-between px-3 py-2">
                    <span className="text-[13px] text-text">{def.label}</span>
                    <ShortcutRecorder actionId={def.id} currentCombo={shortcuts[def.id]} />
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

/* ─── Git Section ─── */

function GitSection() {
  const { t } = useTranslation();
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const syncWorktrees = useAppStore((state) => state.syncWorktreesFromDisk);

  const handleBrowse = async () => {
    const dir = await window.forgepad.app.pickDirectory('Choose Worktree Base Directory');
    if (dir) {
      updateSettings({ worktreeBaseDir: dir });
      // Re-scan the new directory to discover existing worktrees
      setTimeout(() => syncWorktrees(), 100);
    }
  };

  return (
    <div>
      <SectionHeader title={t('settings.git.title')} />

      {/* ── Worktrees ── */}
      <div className="mb-1 font-[510] text-[13px] text-text">{t('settings.git.worktrees')}</div>
      <div className="mb-3 text-[11px] text-subtle leading-tight">{t('settings.git.worktreesDesc')}</div>

      {/* Worktree Base Directory — full-width layout for long paths */}
      <div className="py-2">
        <div className="font-[510] text-[13px] text-text">{t('settings.git.worktreeBaseDir')}</div>
        <div className="mt-0.5 mb-2 text-[11px] text-subtle leading-tight">
          {t('settings.git.worktreeBaseDirDesc')}
        </div>
        <div className="flex gap-2">
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-panel-2 px-3 font-mono text-[12px] text-text outline-none placeholder:text-muted focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
            value={settings.worktreeBaseDir}
            placeholder="~/.forgepad/worktrees"
            onChange={(e) => updateSettings({ worktreeBaseDir: e.currentTarget.value })}
          />
          <button className="secondary-button small shrink-0" type="button" onClick={() => void handleBrowse()}>
            <FolderOpen size={13} />
            {t('settings.git.browse')}
          </button>
        </div>
        {settings.worktreeBaseDir && (
          <button
            className="mt-1.5 text-[11px] text-subtle hover:text-text transition-colors"
            type="button"
            onClick={() => { updateSettings({ worktreeBaseDir: '' }); setTimeout(() => syncWorktrees(), 100); }}
          >
            {t('settings.git.resetToDefault')}
          </button>
        )}
      </div>

      <SettingRow label={t('settings.git.trackRemote')} description={t('settings.git.trackRemoteDesc')}>
        <Toggle
          checked={settings.worktreeTrackRemoteByDefault}
          onChange={(v) => updateSettings({ worktreeTrackRemoteByDefault: v })}
          label="Track remote by default"
        />
      </SettingRow>

      <SettingRow label={t('settings.git.deleteBranch')} description={t('settings.git.deleteBranchDesc')}>
        <Toggle
          checked={settings.worktreeAutoDeleteBranch}
          onChange={(v) => updateSettings({ worktreeAutoDeleteBranch: v })}
          label="Auto-delete branch"
        />
      </SettingRow>

      <Divider />

      {/* ── Remote ── */}
      <div className="mb-1 font-[510] text-[13px] text-text">{t('settings.git.remote')}</div>
      <div className="mb-3 text-[11px] text-subtle leading-tight">{t('settings.git.remoteDesc')}</div>

      <SettingRow label={t('settings.git.autoFetch')} description={t('settings.git.autoFetchDesc')}>
        <Toggle
          checked={settings.autoFetchEnabled}
          onChange={(v) => updateSettings({ autoFetchEnabled: v })}
          label="Auto-fetch"
        />
      </SettingRow>

      {settings.autoFetchEnabled && (
        <SettingRow label={t('settings.git.fetchInterval')} description={t('settings.git.fetchIntervalDesc')}>
          <NumberStepper
            value={settings.autoFetchIntervalMinutes}
            min={1}
            max={60}
            onChange={(v) => updateSettings({ autoFetchIntervalMinutes: v })}
          />
        </SettingRow>
      )}
    </div>
  );
}

/* ─── Main Settings Page ─── */

const SECTIONS: Record<SectionId, React.ComponentType> = {
  general: GeneralSection,
  appearance: AppearancePanel,
  agent: AgentSection,
  terminal: TerminalSection,
  changes: ChangesSection,
  notifications: NotificationsSection,
  git: GitSection,
  advanced: AdvancedSection,
  shortcuts: ShortcutsSection,
  pets: PetsSection,
};

export function SettingsPanel() {
  const { t } = useTranslation();
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const lastSettingsTab = useAppStore((state) => state.settings.lastSettingsTab);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const initialSection: SectionId =
    typeof settingsOpen === 'string' ? settingsOpen : ((lastSettingsTab as SectionId) ?? 'general');
  const [activeSection, setActiveSectionLocal] = useState<SectionId>(initialSection);

  const setActiveSection = (tab: SectionId) => {
    setActiveSectionLocal(tab);
    updateSettings({ lastSettingsTab: tab });
  };

  const close = useCallback(() => useAppStore.setState({ settingsOpen: false }), []);

  // Sync section when settingsOpen changes (e.g. QuickSearch → "Agent Settings")
  useEffect(() => {
    if (typeof settingsOpen === 'string') {
      setActiveSectionLocal(settingsOpen);
    }
  }, [settingsOpen]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const ActiveSection = SECTIONS[activeSection];

  return (
    <div className="flex size-full bg-bg">
      {/* Sidebar navigation */}
      <div className="flex w-[200px] shrink-0 flex-col border-border border-r bg-panel">
        {/* Back button */}
        <div className="flex h-12 items-center border-border border-b px-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted transition-colors hover:bg-panel-2 hover:text-text"
            onClick={close}
          >
            <ArrowLeft size={14} />
            {t('common.back')}
          </button>
        </div>

        {/* Section title */}
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
          <Settings size={16} className="text-muted" />
          <span className="font-[590] text-[15px] text-text">{t('settings.title')}</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Settings sections">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                activeSection === item.id ? 'bg-panel-3 font-[510] text-text' : 'text-muted hover:bg-panel-2 hover:text-text'
              }`}
              onClick={() => setActiveSection(item.id)}
            >
              {item.icon}
              {t(item.label as any)}
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-[1080px] px-10 py-8">
          <ActiveSection />
        </div>
      </div>
    </div>
  );
}
