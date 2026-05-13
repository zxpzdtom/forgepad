import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import { useTranslation } from '@renderer/i18n';
import { BUILTIN_THEMES, THEME_SCHEMA_VERSION, type AppIconVariant, type ThemeDefinition, type ThemeTokens } from '@shared/types';
import { Check, Download, ExternalLink, Pencil, Upload, X } from 'lucide-react';

import clsx from 'clsx';

/* ─── Theme validation ─── */

const REQUIRED_TOKEN_KEYS: (keyof ThemeTokens)[] = ['bg', 'panel', 'text', 'accent', 'border'];

type ValidationResult = { ok: true } | { ok: false; errors: string[] };

function validateTheme(raw: unknown, t: (key: string, params?: Record<string, unknown>) => string): ValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: [t('appearance.invalidJson')] };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion !== THEME_SCHEMA_VERSION) {
    errors.push(t('appearance.schemaMismatch', { expected: THEME_SCHEMA_VERSION, got: obj.schemaVersion }));
  }
  if (!obj.id || typeof obj.id !== 'string') errors.push(t('appearance.missingId'));
  if (!obj.name || typeof obj.name !== 'string') errors.push(t('appearance.missingName'));
  if (!['dark', 'light', 'system'].includes(obj.mode as string)) {
    errors.push(t('appearance.invalidMode', { mode: JSON.stringify(obj.mode) }));
  }
  if (!obj.tokens || typeof obj.tokens !== 'object') {
    errors.push(t('appearance.missingTokens'));
  } else {
    const tokens = obj.tokens as Record<string, unknown>;
    for (const key of REQUIRED_TOKEN_KEYS) {
      if (!tokens[key]) errors.push(t('appearance.missingToken', { key }));
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/* ─── Color swatch palette ─── */

const SWATCH_KEYS: (keyof ThemeTokens)[] = ['bg', 'panel', 'accent', 'text', 'ok', 'danger', 'warn'];

const DARK_PREVIEW_TOKENS: ThemeTokens = {
  bg: '#08090a',
  panel: '#0f1011',
  'panel-2': '#191a1b',
  'panel-3': '#28282c',
  border: 'rgba(255,255,255,0.08)',
  text: '#f7f8f8',
  muted: '#8a8f98',
  subtle: '#62666d',
  accent: '#5e6ad2',
  warn: '#e9bd61',
  danger: '#ff7777',
  ok: '#27a644',
  'accent-surface': 'rgba(94,106,210,0.08)',
};

const APP_ICON_OPTIONS: Array<{
  id: AppIconVariant;
  nameKey: string;
  descriptionKey: string;
}> = [
  { id: 'graphite', nameKey: 'appearance.appIcon.graphite', descriptionKey: 'appearance.appIcon.graphiteDesc' },
  { id: 'aurora', nameKey: 'appearance.appIcon.aurora', descriptionKey: 'appearance.appIcon.auroraDesc' },
  { id: 'ember', nameKey: 'appearance.appIcon.ember', descriptionKey: 'appearance.appIcon.emberDesc' },
  { id: 'frost', nameKey: 'appearance.appIcon.frost', descriptionKey: 'appearance.appIcon.frostDesc' },
  { id: 'violet', nameKey: 'appearance.appIcon.violet', descriptionKey: 'appearance.appIcon.violetDesc' },
];

function resolveSwatches(theme: ThemeDefinition): string[] {
  const tokens = resolvePreviewTokens(theme);
  return SWATCH_KEYS.map((k) => {
    const val = tokens[k];
    if (val) return val;
    const builtinDark = BUILTIN_THEMES.find((t) => t.id === 'dark');
    return builtinDark?.tokens[k] ?? '#888';
  });
}

function resolvePreviewTokens(theme: ThemeDefinition): ThemeTokens {
  const base = theme.mode === 'light' ? BUILTIN_THEMES.find((t) => t.id === 'light')?.tokens : DARK_PREVIEW_TOKENS;
  return { ...(base ?? {}), ...theme.tokens };
}

function resolveSystemSwatchGroups(): Array<{ colors: string[]; tokens: ThemeTokens }> {
  const lightTokens = BUILTIN_THEMES.find((theme) => theme.id === 'light')?.tokens ?? {};
  return [
    { colors: SWATCH_KEYS.map((key) => DARK_PREVIEW_TOKENS[key] ?? '#888'), tokens: DARK_PREVIEW_TOKENS },
    { colors: SWATCH_KEYS.map((key) => lightTokens[key] ?? DARK_PREVIEW_TOKENS[key] ?? '#888'), tokens: lightTokens },
  ];
}

function PaletteSwatches({ colors, theme }: { colors: string[]; theme: ThemeDefinition }) {
  const tokens = resolvePreviewTokens(theme);
  const bg = tokens.bg ?? '#08090a';
  const text = tokens.text ?? '#f7f8f8';

  return (
    <div
      className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-1"
      style={{
        background: `color-mix(in srgb, ${bg} 88%, ${text})`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${text} 16%, transparent)`,
      }}
      aria-hidden="true"
    >
      {colors.map((color, i) => (
        <span
          key={i}
          className="block h-3 w-1.5 shrink-0 rounded-full"
          style={{
            background: color,
            boxShadow:
              `inset 0 0 0 1px color-mix(in srgb, ${text} 18%, transparent), 0 0 0 1px color-mix(in srgb, ${bg} 45%, transparent)`,
          }}
        />
      ))}
    </div>
  );
}

function SystemPaletteSwatches() {
  return (
    <div className="inline-flex w-fit items-center gap-1 rounded-md bg-panel-2 px-1.5 py-1 shadow-[inset_0_0_0_1px_var(--border)]" aria-hidden="true">
      {resolveSystemSwatchGroups().map((group, groupIndex) => {
        const bg = group.tokens.bg ?? '#08090a';
        const text = group.tokens.text ?? '#f7f8f8';

        return (
          <div
            key={groupIndex}
            className="inline-flex items-center gap-1 rounded-[4px] px-1 py-0.5"
            style={{
              background: `color-mix(in srgb, ${bg} 88%, ${text})`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${text} 16%, transparent)`,
            }}
          >
            {group.colors.map((color, i) => (
              <span
                key={i}
                className="block h-3 w-1.5 shrink-0 rounded-full"
                style={{
                  background: color,
                  boxShadow:
                    `inset 0 0 0 1px color-mix(in srgb, ${text} 18%, transparent), 0 0 0 1px color-mix(in srgb, ${bg} 45%, transparent)`,
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ─── System card split preview ─── */

function SystemSplitPreview() {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-[6px]">
      <div className="flex flex-1 flex-col gap-1 bg-[#08090a] p-2">
        <div className="flex gap-1">
          <div className="h-1.5 w-8 rounded-full bg-[#f7f8f8]/20" />
          <div className="h-1.5 w-12 rounded-full bg-[#5e6ad2]/60" />
        </div>
        <div className="h-1 w-full rounded-full bg-[#f7f8f8]/10" />
        <div className="h-1 w-3/4 rounded-full bg-[#f7f8f8]/10" />
        <div className="mt-auto h-1.5 w-5 rounded-full bg-[#5e6ad2]/50" />
      </div>
      <div className="w-px bg-white/10" />
      <div className="flex flex-1 flex-col gap-1 bg-[#f5f5f7] p-2">
        <div className="flex gap-1">
          <div className="h-1.5 w-8 rounded-full bg-black/20" />
          <div className="h-1.5 w-12 rounded-full bg-[#4f46e5]/60" />
        </div>
        <div className="h-1 w-full rounded-full bg-black/10" />
        <div className="h-1 w-3/4 rounded-full bg-black/10" />
        <div className="mt-auto h-1.5 w-5 rounded-full bg-[#4f46e5]/50" />
      </div>
    </div>
  );
}

/* ─── Terminal preview inside card ─── */

function TerminalPreview({ theme }: { theme: ThemeDefinition }) {
  const tokens = resolvePreviewTokens(theme);
  const bg = theme.terminal?.background ?? tokens.bg ?? '#08090a';
  const fg = theme.terminal?.foreground ?? tokens.text ?? '#f7f8f8';
  const green = theme.terminal?.green ?? tokens.ok ?? '#27a644';
  const blue = theme.terminal?.blue ?? tokens.accent ?? '#5e6ad2';
  const yellow = theme.terminal?.yellow ?? tokens.warn ?? '#e9bd61';

  return (
    <div
      className="h-full w-full overflow-hidden rounded-[6px] p-2 font-mono text-[9px] leading-[1.4]"
      style={{ background: bg, color: fg }}
      aria-hidden="true"
    >
      <div>
        <span style={{ color: green }}>❯</span>
        <span className="opacity-70"> git status</span>
      </div>
      <div style={{ color: green }} className="opacity-80">
        On branch main
      </div>
      <div>
        <span style={{ color: yellow }}>M</span>
        <span className="opacity-60"> src/index.ts</span>
      </div>
      <div>
        <span style={{ color: blue }}>?</span>
        <span className="opacity-60"> README.md</span>
      </div>
      <div className="mt-1">
        <span style={{ color: green }}>❯</span>
        <span className="opacity-40"> _</span>
      </div>
    </div>
  );
}

/* ─── Theme card ─── */

function ThemeCard({
  theme,
  isSelected,
  onSelect,
  t,
}: {
  theme: ThemeDefinition;
  isSelected: boolean;
  onSelect: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const swatches = resolveSwatches(theme);
  const isSystem = theme.id === 'system';
  const previewTokens = resolvePreviewTokens(theme);

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={t('appearance.selectTheme', { name: theme.name })}
      onClick={onSelect}
      className={clsx(
        'group relative flex w-full min-w-0 flex-col items-stretch overflow-hidden rounded-xl border text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-border focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        isSelected ? 'border-accent shadow-[0_0_0_2px_var(--accent)]' : 'border-border hover:border-border-soft hover:shadow-sm',
      )}
      style={{
        background: isSystem ? undefined : (previewTokens.panel ?? 'var(--panel)'),
      }}
    >
      {/* Preview area */}
      <div
        className="relative h-[90px] w-full overflow-hidden"
        style={{
          background: isSystem ? undefined : (previewTokens.bg ?? 'var(--bg)'),
        }}
      >
        {isSystem ? <SystemSplitPreview /> : <TerminalPreview theme={theme} />}

        {isSelected && (
          <div className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-accent text-white shadow">
            <Check size={11} strokeWidth={3} />
          </div>
        )}
      </div>

      {/* Palette swatches */}
      <div className="w-full px-3 py-2">
        {isSystem ? <SystemPaletteSwatches /> : <PaletteSwatches colors={swatches} theme={theme} />}
      </div>

      {/* Card footer */}
      <div className="flex w-full items-center justify-between px-3 pt-0.5 pb-3">
        <div className="min-w-0">
          <div className="truncate font-[510] text-[12px]" style={{ color: previewTokens.text ?? 'var(--text)' }}>
            {theme.name}
          </div>
          {theme.author && (
            <div className="truncate text-[10px]" style={{ color: previewTokens.muted ?? 'var(--muted)' }}>
              {theme.author}
            </div>
          )}
        </div>
        <div
          className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[9px]"
          style={{
            background: previewTokens['accent-surface'] ?? 'var(--accent-surface)',
            color: previewTokens.accent ?? 'var(--accent)',
          }}
        >
          {theme.mode}
        </div>
      </div>
    </button>
  );
}

function AppIconCard({
  id,
  name,
  description,
  selected,
  onSelect,
}: {
  id: AppIconVariant;
  name: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={clsx(
        'group relative flex min-w-0 items-center gap-3 rounded-xl border bg-panel-2 p-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-border',
        selected ? 'border-accent shadow-[0_0_0_2px_var(--accent)]' : 'border-border hover:border-border-soft hover:bg-panel-3',
      )}
      onClick={onSelect}
    >
      <img
        src={`app-icons/${id}.png`}
        alt=""
        className="size-13 shrink-0 rounded-[14px]"
        draggable={false}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-[510] text-[12px] text-text">{name}</span>
        <span className="mt-0.5 block text-[10px] text-muted leading-tight">{description}</span>
      </span>
      {selected && (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-white">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/* ─── Import error banner ─── */

function ImportErrorBanner({
  errors,
  onDismiss,
  t,
}: {
  errors: string[];
  onDismiss: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="font-[510] text-[12px] text-danger">{t('appearance.importFailed')}</div>
        <ul className="mt-1 space-y-0.5">
          {errors.map((e, i) => (
            <li key={i} className="text-[11px] text-muted">
              {e}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        aria-label={t('appearance.dismissError')}
        className="shrink-0 rounded p-0.5 text-muted hover:text-text"
        onClick={onDismiss}
      >
        <X size={13} />
      </button>
    </div>
  );
}

/* ─── Toggle switch ─── */

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={clsx(
        'relative inline-flex h-5 w-8 items-center rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-panel-3',
      )}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span
        className={clsx(
          'inline-block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-[14px]',
        )}
      />
    </button>
  );
}

/* ─── Main AppearancePanel ─── */

export function AppearancePanel() {
  const { t } = useTranslation();
  const themeId = useAppStore((s) => s.settings.themeId);
  const appIconVariant = useAppStore((s) => s.settings.appIconVariant);
  const sketchyMode = useAppStore((s) => s.settings.sketchyMode);
  const customThemes = useAppStore((s) => s.settings.customThemes ?? []);
  const addCustomTheme = useAppStore((s) => s.addCustomTheme);
  const removeCustomTheme = useAppStore((s) => s.removeCustomTheme);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const allThemes = useMemo<ThemeDefinition[]>(() => [...BUILTIN_THEMES, ...customThemes], [customThemes]);

  /* ── Select theme ── */
  const handleSelect = useCallback(
    (id: string) => {
      const theme = allThemes.find((t) => t.id === id);
      if (!theme) return;
      updateSettings({
        themeId: id,
        theme: theme.mode === 'dark' || theme.mode === 'light' || theme.mode === 'system' ? theme.mode : 'dark',
      });
    },
    [allThemes, updateSettings],
  );

  /* ── Import theme ── */
  const handleImportFile = useCallback(
    async (file: File) => {
      setImportErrors(null);
      setImportSuccess(null);
      try {
        const text = await file.text();
        const raw = JSON.parse(text) as unknown;
        const result = validateTheme(raw, t);
        if (!result.ok) {
          setImportErrors(result.errors);
          return;
        }
        const incoming = raw as ThemeDefinition;
        if (BUILTIN_THEMES.some((bt) => bt.id === incoming.id)) {
          setImportErrors([t('appearance.conflictBuiltIn', { id: incoming.id })]);
          return;
        }
        addCustomTheme({ ...incoming, schemaVersion: THEME_SCHEMA_VERSION });
        setImportSuccess(incoming.name);
      } catch {
        setImportErrors([t('appearance.invalidJsonFile')]);
      }
    },
    [addCustomTheme, t],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleImportFile(file);
      e.target.value = '';
    },
    [handleImportFile],
  );

  /* ── Download base file ── */
  const handleDownloadBase = useCallback(() => {
    const active = allThemes.find((t) => t.id === themeId) ?? BUILTIN_THEMES[1];
    const base: ThemeDefinition = {
      schemaVersion: THEME_SCHEMA_VERSION,
      id: `${active.id}-custom`,
      name: `${active.name} (Custom)`,
      author: 'Your Name',
      mode: active.mode === 'system' ? 'dark' : active.mode,
      version: '1.0.0',
      tokens: { ...active.tokens },
      terminal: active.terminal ? { ...active.terminal } : undefined,
      syntax: active.syntax ? { ...active.syntax } : undefined,
      markdown: active.markdown ? { ...active.markdown } : undefined,
      diff: active.diff ? { ...active.diff } : undefined,
    };
    const blob = new Blob([JSON.stringify(base, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allThemes, themeId]);

  /* ── Export active theme ── */
  const handleExportActive = useCallback(() => {
    const active = allThemes.find((t) => t.id === themeId);
    if (!active) return;
    const blob = new Blob([JSON.stringify(active, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allThemes, themeId]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Sketchy mode toggle ── */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-panel-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Pencil size={15} className="shrink-0 text-muted" />
          <div>
            <div className="font-[510] text-[13px] text-text">{t('appearance.sketchyMode')}</div>
            <div className="text-[11px] text-muted">{t('appearance.sketchyModeDesc')}</div>
          </div>
        </div>
        <Toggle checked={sketchyMode} onChange={(v) => updateSettings({ sketchyMode: v })} label={t('appearance.sketchyMode')} />
      </div>

      {/* ── App icon gallery ── */}
      <section aria-label={t('appearance.appIcon')}>
        <div className="mb-3">
          <h3 className="font-[590] text-[13px] text-muted uppercase tracking-wider">{t('appearance.appIcon')}</h3>
          <p className="mt-1 text-[11px] text-muted">{t('appearance.appIconDesc')}</p>
        </div>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
          role="radiogroup"
          aria-label={t('appearance.appIcon')}
        >
          {APP_ICON_OPTIONS.map((icon) => (
            <AppIconCard
              key={icon.id}
              id={icon.id}
              name={t(icon.nameKey)}
              description={t(icon.descriptionKey)}
              selected={appIconVariant === icon.id}
              onSelect={() => updateSettings({ appIconVariant: icon.id })}
            />
          ))}
        </div>
      </section>

      {/* ── Header actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-[12px] text-text transition-colors hover:bg-panel-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-border"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('appearance.importThemeAria')}
        >
          <Upload size={13} />
          {t('appearance.importTheme')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          tabIndex={-1}
          onChange={handleFileInputChange}
        />

        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-[12px] text-text transition-colors hover:bg-panel-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-border"
          onClick={handleDownloadBase}
          aria-label={t('appearance.downloadBaseAria')}
        >
          <Download size={13} />
          {t('appearance.downloadBase')}
        </button>

        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-panel-3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-border"
          onClick={handleExportActive}
          aria-label={t('appearance.exportCurrentAria')}
        >
          <ExternalLink size={13} />
          {t('appearance.exportCurrent')}
        </button>
      </div>

      {/* ── Error / success banners ── */}
      {importErrors && <ImportErrorBanner errors={importErrors} onDismiss={() => setImportErrors(null)} t={t} />}
      {importSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/8 px-3 py-2 text-[12px] text-ok">
          <Check size={13} />
          <span>{t('appearance.importSuccess', { name: importSuccess })}</span>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            className="ml-auto rounded p-0.5 text-ok/70 hover:text-ok"
            onClick={() => setImportSuccess(null)}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Built-in themes gallery ── */}
      <section aria-label={t('appearance.builtInThemes')}>
        <h3 className="mb-3 font-[590] text-[13px] text-muted uppercase tracking-wider">{t('appearance.builtIn')}</h3>
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          }}
          role="radiogroup"
          aria-label={t('appearance.selectBuiltIn')}
        >
          {BUILTIN_THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isSelected={themeId === theme.id}
              onSelect={() => handleSelect(theme.id)}
              t={t}
            />
          ))}
        </div>
      </section>

      {/* ── Custom themes gallery ── */}
      {customThemes.length > 0 && (
        <section aria-label={t('appearance.customThemes')}>
          <h3 className="mb-3 font-[590] text-[13px] text-muted uppercase tracking-wider">{t('appearance.custom')}</h3>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            }}
            role="radiogroup"
            aria-label={t('appearance.selectCustom')}
          >
            {customThemes.map((theme) => (
              <div key={theme.id} className="group relative">
                <ThemeCard theme={theme} isSelected={themeId === theme.id} onSelect={() => handleSelect(theme.id)} t={t} />
                <button
                  type="button"
                  aria-label={t('appearance.removeTheme', { name: theme.name })}
                  className="absolute top-1.5 left-1.5 hidden size-5 items-center justify-center rounded-full bg-panel-3/90 text-muted transition-colors hover:bg-danger/20 hover:text-danger group-hover:flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCustomTheme(theme.id);
                  }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
