import { createContext, useContext } from 'react';
import type { ExtractedTheme } from '../../core/theme/types';

export interface ThemeContextValue {
  theme: ExtractedTheme | null;
  isLoaded: boolean;
  applyQuestNodeBorder(shape: string): Record<string, string | number>;
  getItemIconStyle(itemId: string): Record<string, string | number>;
}

const defaultTheme: ThemeContextValue = {
  theme: null,
  isLoaded: false,
  applyQuestNodeBorder: () => ({}),
  getItemIconStyle: () => ({}),
};

export const ThemeContext = createContext<ThemeContextValue>(defaultTheme);

export function useMcTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
