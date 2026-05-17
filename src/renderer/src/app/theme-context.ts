import { createContext, useContext } from 'react';
import type { ResolvedTheme } from './hooks/useTheme';

export const ThemeContext = createContext<ResolvedTheme>('dark');
export const useResolvedTheme = () => useContext(ThemeContext);
