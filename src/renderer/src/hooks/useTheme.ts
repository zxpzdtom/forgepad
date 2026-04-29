import { useEffect } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import type { ThemePreference } from '@shared/types';

/** Resolved theme — never 'system' */
export type ResolvedTheme = 'dark' | 'light';

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Reads theme preference from the store, resolves 'system' to an actual
 * theme, and keeps `document.documentElement.dataset.theme` in sync.
 *
 * Mount once at the app root.
 */
export function useTheme(): ResolvedTheme {
  const preference = useAppStore((s) => s.settings.theme);
  const resolved = resolveTheme(preference);

  useEffect(() => {
    const apply = (theme: ResolvedTheme) => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    };

    apply(resolved);

    // If 'system', listen for OS theme changes
    if (preference === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        apply(e.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [preference, resolved]);

  return resolved;
}
