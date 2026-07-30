import React, { useEffect, useState, useCallback } from 'react';
import { globalAssetCache } from './asset-cache';
import { ThemeContext } from './theme-context';
import type { ThemeContextValue } from './theme-context';
import type { ExtractedTheme } from './types';

export interface CanvasThemeProviderProps {
  children: React.ReactNode;
}

export function CanvasThemeProvider({ children }: CanvasThemeProviderProps) {
  const [theme, setTheme] = useState<ExtractedTheme | null>(null);

  useEffect(() => {
    const unsub = globalAssetCache.onThemeChange((t) => {
      setTheme(t);
    });
    return unsub;
  }, []);

  const applyQuestNodeBorder = useCallback((shape: string): Record<string, string | number> => {
    if (!theme) return {} as Record<string, string | number>;
    const border = theme.nodeBorders[shape] || theme.nodeBorders['square'];
    if (!border) return {} as Record<string, string | number>;
    return {
      borderImageSource: `url(${border.top})`,
      borderImageSlice: border.slice,
      borderImageRepeat: 'stretch',
      borderWidth: border.slice,
      borderStyle: 'solid',
      borderRadius: 0,
    };
  }, [theme]);

  const getItemIconStyle = useCallback((itemId: string): Record<string, string | number> => {
    if (!theme) return {} as Record<string, string | number>;
    const url = globalAssetCache.getIconDataUrl(itemId);
    if (!url) return {} as Record<string, string | number>;
    return {
      backgroundImage: `url(${url})`,
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      width: theme.questNodeWidth * 2,
      height: theme.questNodeHeight * 2,
    };
  }, [theme]);

  const value: ThemeContextValue = {
    theme,
    isLoaded: theme !== null,
    applyQuestNodeBorder,
    getItemIconStyle,
  };

  return (
    <ThemeContext.Provider value={value}>
      {theme ? (
        <div
          style={{
            '--mc-primary': theme.primaryColor,
            '--mc-secondary': theme.secondaryColor,
            '--mc-success': theme.successColor,
            '--mc-warning': theme.warningColor,
            '--mc-error': theme.errorColor,
            '--mc-font': theme.fontFamily,
          } as React.CSSProperties}
        >
          {children}
        </div>
      ) : children}
    </ThemeContext.Provider>
  );
}
