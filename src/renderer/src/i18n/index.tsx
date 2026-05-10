import { createContext, useContext, useCallback, useMemo } from 'react';
import { useAppStore } from '@renderer/store/app-store';
import type { Locale } from '@shared/types';
import en, { type TranslationKeys } from './en';
import zhCN from './zh-CN';

/* ─── Translation maps ─── */

const messages: Record<Locale, Record<TranslationKeys, string>> = {
  en,
  'zh-CN': zhCN,
};

/* ─── Core translate function ─── */

/**
 * Translate a key with optional interpolation.
 * Supports `{variable}` placeholders: `t('hello', { name: 'World' })` → "Hello World"
 */
function translate(locale: Locale, key: TranslationKeys, params?: Record<string, string | number>): string {
  const msg = messages[locale]?.[key] ?? messages.en[key] ?? key;
  if (!params) return msg;
  return msg.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

/* ─── React Context ─── */

type I18nContextValue = {
  locale: Locale;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  t: (key) => messages.en[key] ?? key,
  setLocale: () => {},
});

/* ─── Hook ─── */

export function useTranslation() {
  return useContext(I18nContext);
}

/* ─── Provider (reads locale from Zustand) ─── */

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useAppStore((s) => s.settings.locale);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const setLocale = useCallback(
    (newLocale: Locale) => {
      updateSettings({ locale: newLocale });
    },
    [updateSettings],
  );

  const t = useCallback(
    (key: TranslationKeys, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(() => ({ locale, t, setLocale }), [locale, t, setLocale]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

/* ─── Standalone t() for non-React contexts (e.g. Zustand store) ─── */

/**
 * Get translation for the current locale outside of React components.
 * Reads locale directly from the Zustand store.
 */
export function getT() {
  const locale = useAppStore.getState().settings.locale;
  return (key: TranslationKeys, params?: Record<string, string | number>) => translate(locale, key, params);
}

export { I18nContext, translate };
export type { TranslationKeys };
