import { useEffect, useMemo } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import type { ThemeDefinition, ThemeTokens } from '@shared/types';
import { BUILTIN_THEMES } from '@shared/types';

/** Resolved theme — never 'system' */
export type ResolvedTheme = 'dark' | 'light';

function resolveMode(theme: ThemeDefinition): ResolvedTheme {
  if (theme.mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme.mode;
}

/** Apply ThemeDefinition tokens as CSS custom properties on <html> */
function applyThemeTokens(tokens: ThemeTokens): void {
  const el = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    if (value !== undefined) {
      el.style.setProperty(`--${key}`, value);
    }
  }
}

/** Remove any previously applied theme token overrides */
function clearThemeTokens(tokens: ThemeTokens): void {
  const el = document.documentElement;
  for (const key of Object.keys(tokens)) {
    el.style.removeProperty(`--${key}`);
  }
}

/**
 * Reads themeId from the store, resolves the active ThemeDefinition,
 * injects CSS variables, and keeps `document.documentElement.dataset.theme`
 * and `data-theme-id` in sync.
 *
 * Mount once at the app root.
 */
export function useTheme(): ResolvedTheme {
  const themeId = useAppStore((s) => s.settings.themeId);
  const customThemes = useAppStore((s) => s.settings.customThemes ?? []);
  const sketchyMode = useAppStore((s) => s.settings.sketchyMode);

  const activeTheme = useMemo(() => {
    const allThemes: ThemeDefinition[] = [...BUILTIN_THEMES, ...customThemes];
    return allThemes.find((t) => t.id === themeId) ?? BUILTIN_THEMES[1]; // fallback: Dark
  }, [themeId, customThemes]);

  const resolved = resolveMode(activeTheme);

  useEffect(() => {
    let prevTokenKeys: ThemeTokens = {};

    const apply = (theme: ThemeDefinition, resolvedMode: ResolvedTheme) => {
      clearThemeTokens(prevTokenKeys);
      prevTokenKeys = theme.tokens;
      applyThemeTokens(theme.tokens);

      document.documentElement.dataset.theme = resolvedMode;
      document.documentElement.dataset.themeId = theme.id;
      document.documentElement.style.colorScheme = resolvedMode;
    };

    apply(activeTheme, resolved);

    if (activeTheme.mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        apply(activeTheme, e.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', handler);
      return () => {
        mq.removeEventListener('change', handler);
        clearThemeTokens(activeTheme.tokens);
      };
    }

    return () => {
      clearThemeTokens(activeTheme.tokens);
    };
  }, [activeTheme, resolved]);

  // Sync sketchy mode overlay attribute
  useEffect(() => {
    if (sketchyMode) {
      document.documentElement.dataset.sketchy = '';
    } else {
      delete document.documentElement.dataset.sketchy;
    }
    return () => {
      delete document.documentElement.dataset.sketchy;
    };
  }, [sketchyMode]);

  return resolved;
}

/** Convenience: get the full active ThemeDefinition (for terminal/diff consumers) */
export function useActiveTheme(): ThemeDefinition {
  const themeId = useAppStore((s) => s.settings.themeId);
  const customThemes = useAppStore((s) => s.settings.customThemes ?? []);
  return useMemo(() => {
    const allThemes: ThemeDefinition[] = [...BUILTIN_THEMES, ...customThemes];
    return allThemes.find((t) => t.id === themeId) ?? BUILTIN_THEMES[1];
  }, [themeId, customThemes]);
}
