/**
 * Lightweight I18nProvider for the popout browser window.
 * Reads locale from window.forgepadBrowser.init.locale (no Zustand dependency).
 * Uses the same I18nContext as the main i18n module so that shared components
 * (BrowserConsolePanel, Tooltip, etc.) work transparently with useTranslation().
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import type { Locale } from '@shared/types';
import { I18nContext, translate, type TranslationKeys } from '../../i18n';

export function PopoutI18nProvider({ children }: { children: ReactNode }) {
  const locale = (window.forgepadBrowser?.init?.locale || 'en') as Locale;

  const t = useCallback(
    (key: TranslationKeys, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, t, setLocale: () => {} }), [locale, t]);

  return <I18nContext value={value}>{children}</I18nContext>;
}
