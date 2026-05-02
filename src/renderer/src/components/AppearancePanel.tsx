import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import { BUILTIN_THEMES, THEME_SCHEMA_VERSION, type ThemeDefinition, type ThemeTokens } from '@shared/types';
import { Check, Download, ExternalLink, Upload, X } from 'lucide-react';

/* ─── Theme validation ─── */

const REQUIRED_TOKEN_KEYS: (keyof ThemeTokens)[] = ['bg', 'panel', 'text', 'accent', 'border'];

type ValidationResult = { ok: true } | { ok: false; errors: string[] };

function validateTheme(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Invalid JSON: not an object.'] };
  }
  const t = raw as Record<string, unknown>;

  if (t.schemaVersion !== THEME_SCHEMA_VERSION) {
    errors.push(`Schema version mismatch: expected ${THEME_SCHEMA_VERSION}, got ${t.schemaVersion}.`);
  }
  if (!t.id || typeof t.id !== 'string') errors.push('Missing required field: "id".');
  if (!t.name || typeof t.name !== 'string') errors.push('Missing required field: "name".');
  if (!['dark', 'light', 'system'].includes(t.mode as string)) {
    errors.push(`"mode" must be "dark", "light", or "system" (got: ${JSON.stringify(t.mode)}).`);
  }
  if (!t.tokens || typeof t.tokens !== 'object') {
    errors.push('Missing required field: "tokens" (object).');
  } else {
    const tokens = t.tokens as Record<string, unknown>;
    for (const key of REQUIRED_TOKEN_KEYS) {
      if (!tokens[key]) errors.push(`Missing required token: "${key}".`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/* ─── Color swatch palette ─── */

const SWATCH_KEYS: (keyof ThemeTokens)[] = ['bg', 'panel', 'accent', 'text', 'ok', 'danger', 'warn'];

function resolveSwatches(theme: ThemeDefinition): string[] {
  const tokens = theme.tokens;
  return SWATCH_KEYS.map((k) => {
    const val = tokens[k];
    if (val) return val;
    const builtinDark = BUILTIN_THEMES.find((t) => t.id === 'dark');
    return builtinDark?.tokens[k] ?? '#888';
  });
}

/* ─── System card split preview ─── */

function SystemSplitPreview() {
  return (
    <div className="flex h-full overflow-hidden rounded-[6px]">
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
  const bg = theme.terminal?.background ?? theme.tokens.bg ?? '#08090a';
  const fg = theme.terminal?.foreground ?? theme.tokens.text ?? '#f7f8f8';
  const green = theme.terminal?.green ?? theme.tokens.ok ?? '#27a644';
  const blue = theme.terminal?.blue ?? theme.tokens.accent ?? '#5e6ad2';
  const yellow = theme.terminal?.yellow ?? theme.tokens.warn ?? '#e9bd61';

  return (
    <div
      className="h-full overflow-hidden rounded-[6px] p-2 font-mono text-[9px] leading-[1.4]"
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

function ThemeCard({ theme, isSelected, onSelect }: { theme: ThemeDefinition; isSelected: boolean; onSelect: () => void }) {
  const swatches = resolveSwatches(theme);
  const isSystem = theme.id === 'system';

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`Select ${theme.name} theme`}
      onClick={onSelect}
      className={`group relative flex w-full flex-col overflow-hidden rounded-xl border text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-border focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        isSelected ? 'border-accent shadow-[0_0_0_2px_var(--accent)]' : 'border-border hover:border-border-soft hover:shadow-sm'
      }`}
      style={{
        background: isSystem ? undefined : (theme.tokens.panel ?? 'var(--panel)'),
      }}
    >
      {/* Preview area */}
      <div
        className="relative h-[90px] overflow-hidden"
        style={{
          background: isSystem ? undefined : (theme.tokens.bg ?? 'var(--bg)'),
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
      <div className="flex gap-[3px] px-3 py-2" aria-hidden="true">
        {swatches.map((color, i) => (
          <div key={i} className="h-3 flex-1 rounded-full border border-white/10" style={{ background: color }} />
        ))}
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between px-3 pt-0.5 pb-3">
        <div className="min-w-0">
          <div className="truncate font-[510] text-[12px]" style={{ color: theme.tokens.text ?? 'var(--text)' }}>
            {theme.name}
          </div>
          {theme.author && (
            <div className="truncate text-[10px]" style={{ color: theme.tokens.muted ?? 'var(--muted)' }}>
              {theme.author}
            </div>
          )}
        </div>
        <div
          className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[9px]"
          style={{
            background: theme.tokens['accent-surface'] ?? 'var(--accent-surface)',
            color: theme.tokens.accent ?? 'var(--accent)',
          }}
        >
          {theme.mode}
        </div>
      </div>
    </button>
  );
}

/* ─── Import error banner ─── */

function ImportErrorBanner({ errors, onDismiss }: { errors: string[]; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="font-[510] text-[12px] text-danger">Theme import failed</div>
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
        aria-label="Dismiss error"
        className="shrink-0 rounded p-0.5 text-muted hover:text-text"
        onClick={onDismiss}
      >
        <X size={13} />
      </button>
    </div>
  );
}

/* ─── Main AppearancePanel ─── */

export function AppearancePanel() {
  const themeId = useAppStore((s) => s.settings.themeId);
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
        const result = validateTheme(raw);
        if (!result.ok) {
          setImportErrors(result.errors);
          return;
        }
        const incoming = raw as ThemeDefinition;
        if (BUILTIN_THEMES.some((t) => t.id === incoming.id)) {
          setImportErrors([
            `Theme id "${incoming.id}" conflicts with a built-in theme. Change the id in the JSON and re-import.`,
          ]);
          return;
        }
        addCustomTheme({ ...incoming, schemaVersion: THEME_SCHEMA_VERSION });
        setImportSuccess(incoming.name);
      } catch {
        setImportErrors(['Invalid JSON file. Please check the file and try again.']);
      }
    },
    [addCustomTheme],
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
      {/* ── Header actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-[12px] text-text transition-colors hover:bg-panel-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-border"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Import theme JSON"
        >
          <Upload size={13} />
          Import Theme
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
          aria-label="Download base theme file for customisation"
        >
          <Download size={13} />
          Download Base File
        </button>

        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-panel-3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-border"
          onClick={handleExportActive}
          aria-label="Export current theme"
        >
          <ExternalLink size={13} />
          Export Current
        </button>
      </div>

      {/* ── Error / success banners ── */}
      {importErrors && <ImportErrorBanner errors={importErrors} onDismiss={() => setImportErrors(null)} />}
      {importSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/8 px-3 py-2 text-[12px] text-ok">
          <Check size={13} />
          <span>
            Theme <strong>{importSuccess}</strong> imported successfully.
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            className="ml-auto rounded p-0.5 text-ok/70 hover:text-ok"
            onClick={() => setImportSuccess(null)}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Built-in themes gallery ── */}
      <section aria-label="Built-in themes">
        <h3 className="mb-3 font-[590] text-[13px] text-muted uppercase tracking-wider">Built-in</h3>
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          }}
          role="radiogroup"
          aria-label="Select built-in theme"
        >
          {BUILTIN_THEMES.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} isSelected={themeId === theme.id} onSelect={() => handleSelect(theme.id)} />
          ))}
        </div>
      </section>

      {/* ── Custom themes gallery ── */}
      {customThemes.length > 0 && (
        <section aria-label="Custom themes">
          <h3 className="mb-3 font-[590] text-[13px] text-muted uppercase tracking-wider">Custom</h3>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            }}
            role="radiogroup"
            aria-label="Select custom theme"
          >
            {customThemes.map((theme) => (
              <div key={theme.id} className="group relative">
                <ThemeCard theme={theme} isSelected={themeId === theme.id} onSelect={() => handleSelect(theme.id)} />
                <button
                  type="button"
                  aria-label={`Remove ${theme.name} theme`}
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
