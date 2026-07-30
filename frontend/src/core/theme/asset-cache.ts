import type { AssetCacheManifest, AssetCacheEntry, ExtractedTheme, NodeBorderSpec } from './types';

const CACHE_VERSION_KEY = 'modcanvas_asset_cache_version';

export class AssetCacheManager {
  private manifest: AssetCacheManifest | null = null;
  private listeners: Array<(theme: ExtractedTheme | null) => void> = [];

  get isLoaded(): boolean {
    return this.manifest !== null;
  }

  get currentManifest(): AssetCacheManifest | null {
    return this.manifest;
  }

  onThemeChange(listener: (theme: ExtractedTheme | null) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(theme: ExtractedTheme | null): void {
    for (const listener of this.listeners) {
      listener(theme);
    }
  }

  async processAssetsReady(payload: unknown): Promise<ExtractedTheme | null> {
    const raw = this.parsePayload(payload);
    if (!raw) {
      console.warn('[AssetCache] invalid ASSETS_READY payload');
      return null;
    }

    const manifest = this.buildManifest(raw);
    this.manifest = manifest;
    this.persistManifest(manifest);

    const theme = this.extractTheme(manifest);
    this.notify(theme);
    return theme;
  }

  private parsePayload(payload: unknown): Record<string, string> | null {
    if (!payload || typeof payload !== 'object') return null;
    const obj = payload as Record<string, unknown>;

    const cachePath = typeof obj.cachePath === 'string'
      ? obj.cachePath
      : (typeof obj.path === 'string' ? obj.path : null);

    const reserved = new Set(['cachePath', 'path', 'mcVersion', 'loader', 'uiFiles', 'iconFiles']);

    const uiFiles = typeof obj.uiFiles === 'object' && obj.uiFiles !== null
      ? (obj.uiFiles as Record<string, string>)
      : {};

    const iconFiles = typeof obj.iconFiles === 'object' && obj.iconFiles !== null
      ? (obj.iconFiles as Record<string, string>)
      : {};

    const assetEntries: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!reserved.has(key) && typeof value === 'string') {
        assetEntries[key] = value;
      }
    }

    return {
      cachePath: cachePath || '.workbench/cache',
      sourceVersion: (obj.mcVersion as string) || '1.21.1',
      sourceLoader: (obj.loader as string) || 'neoforge',
      ...assetEntries,
      ...uiFiles,
      ...iconFiles,
    };
  }

  private buildManifest(raw: Record<string, string>): AssetCacheManifest {
    const ui: Record<string, AssetCacheEntry> = {};
    const icons: Record<string, AssetCacheEntry> = {};

    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('icon_') || key.startsWith('item_')) {
        icons[key] = this.makeEntry(value);
      } else if (key.startsWith('ui_') || key.endsWith('.png') || key.endsWith('.jpg')) {
        ui[key] = this.makeEntry(value);
      }
    }

    return {
      ui,
      icons,
      loadedAt: Date.now(),
      sourceVersion: raw.sourceVersion || '1.21.1',
      sourceLoader: raw.sourceLoader || 'neoforge',
    };
  }

  private makeEntry(dataUrl: string): AssetCacheEntry {
    const mimeType = dataUrl.startsWith('data:')
      ? dataUrl.split(';')[0].replace('data:', '')
      : 'image/png';
    return {
      dataUrl,
      mimeType,
      width: 64,
      height: 64,
    };
  }

  private extractTheme(manifest: AssetCacheManifest): ExtractedTheme {
    const chapterBg = manifest.ui['ui_chapter_background']
      || manifest.ui['chapter_background.png']
      || null;

    const nodeBorders: Record<string, NodeBorderSpec> = {};
    const borderShapes = ['circle', 'square', 'hexagon', 'diamond', 'rounded_square', 'gear', 'heart', 'octagon', 'pentagon'];
    for (const shape of borderShapes) {
      const key = `ui_border_${shape}`;
      const borderImg = manifest.ui[key] || manifest.ui[`border_${shape}.png`] || null;
      if (borderImg) {
        nodeBorders[shape] = {
          top: borderImg.dataUrl,
          right: borderImg.dataUrl,
          bottom: borderImg.dataUrl,
          left: borderImg.dataUrl,
          slice: 8,
        };
      }
    }

    return {
      chapterBackground: chapterBg,
      nodeBorders,
      fontFamily: 'Minecraftia, monospace',
      primaryColor: '#4FC3F7',
      secondaryColor: '#81C784',
      successColor: '#66BB6A',
      warningColor: '#FFA726',
      errorColor: '#EF5350',
      questNodeWidth: 24,
      questNodeHeight: 24,
    };
  }

  getIconDataUrl(itemId: string): string | null {
    if (!this.manifest) return null;
    for (const [key, entry] of Object.entries(this.manifest.icons)) {
      const stripPrefix = key.replace(/^(icon_|item_)/, '').replace(/\.png$/, '');
      const firstUnderscore = stripPrefix.indexOf('_');
      const normalizedKey = firstUnderscore > 0
        ? stripPrefix.slice(0, firstUnderscore) + ':' + stripPrefix.slice(firstUnderscore + 1)
        : stripPrefix;
      if (normalizedKey === itemId || key === `icon_${itemId}` || key === `item_${itemId}`) {
        return entry.dataUrl;
      }
    }
    return null;
  }

  getUiAsset(name: string): AssetCacheEntry | null {
    if (!this.manifest) return null;
    return this.manifest.ui[`ui_${name}`]
      || this.manifest.ui[`${name}.png`]
      || null;
  }

  clear(): void {
    this.manifest = null;
    try { localStorage.removeItem(CACHE_VERSION_KEY); } catch {}
    this.notify(null);
  }

  private persistManifest(manifest: AssetCacheManifest): void {
    try {
      localStorage.setItem(CACHE_VERSION_KEY, JSON.stringify({
        version: manifest.sourceVersion,
        loader: manifest.sourceLoader,
        loadedAt: manifest.loadedAt,
      }));
    } catch {
      // storage full or unavailable; non-critical
    }
  }
}

export const globalAssetCache = new AssetCacheManager();
