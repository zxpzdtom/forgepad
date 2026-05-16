import type { CSSProperties } from 'react';

const TREE_THEME_SHARED = {
  '--trees-font-family-override': 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  '--trees-font-size-override': '13px',
  '--trees-padding-inline-override': '10px',
  '--trees-border-radius-override': '6px',
};

export const TREE_THEMES: Record<'dark' | 'light', CSSProperties> = {
  dark: {
    colorScheme: 'dark',
    '--trees-bg-override': 'oklch(20.5% 0 0)',
    '--trees-fg-override': 'oklch(98.5% 0 0)',
    '--trees-fg-muted-override': 'oklch(75% 0 0)',
    '--trees-bg-muted-override': 'oklch(26.9% 0 0)',
    '--trees-search-fg-override': 'oklch(85% 0 0)',
    '--trees-search-bg-override': 'oklch(20% 0 0)',
    '--trees-border-color-override': 'oklch(100% 0 0 / 0.12)',
    '--trees-selected-fg-override': 'oklch(97% 0.04 250)',
    '--trees-selected-bg-override': 'oklch(35% 0.08 250)',
    '--trees-selected-border-color-override': 'oklch(65% 0.2 250)',
    '--trees-selected-focused-border-color-override': 'oklch(75% 0.2 250)',
    '--trees-focus-ring-color-override': 'oklch(70% 0.15 250)',
    ...TREE_THEME_SHARED,
  } as CSSProperties,
  light: {
    colorScheme: 'light',
    '--trees-bg-override': 'oklch(97% 0 0)',
    '--trees-fg-override': 'oklch(15% 0 0)',
    '--trees-fg-muted-override': 'oklch(45% 0 0)',
    '--trees-bg-muted-override': 'oklch(93% 0 0)',
    '--trees-search-fg-override': 'oklch(20% 0 0)',
    '--trees-search-bg-override': 'oklch(97% 0 0)',
    '--trees-border-color-override': 'oklch(0% 0 0 / 0.10)',
    '--trees-selected-fg-override': 'oklch(15% 0.04 250)',
    '--trees-selected-bg-override': 'oklch(90% 0.04 250)',
    '--trees-selected-border-color-override': 'oklch(60% 0.15 250)',
    '--trees-selected-focused-border-color-override': 'oklch(55% 0.2 250)',
    '--trees-focus-ring-color-override': 'oklch(55% 0.15 250)',
    ...TREE_THEME_SHARED,
  } as CSSProperties,
};
