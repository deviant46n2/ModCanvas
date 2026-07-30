import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssetCacheManager } from './asset-cache';

describe('AssetCacheManager — Theme Extraction', () => {
  let cache: AssetCacheManager;

  beforeEach(() => {
    cache = new AssetCacheManager();
  });

  it('should start with no manifest loaded', () => {
    expect(cache.isLoaded).toBe(false);
    expect(cache.currentManifest).toBeNull();
  });

  it('should process ASSETS_READY payload and extract theme', async () => {
    const theme = await cache.processAssetsReady({
      cachePath: '.workbench/cache',
      mcVersion: '1.21.1',
      loader: 'neoforge',
      ui_chapter_background: 'data:image/png;base64,abc',
      icon_minecraft_diamond: 'data:image/png;base64,def',
    });

    expect(theme).not.toBeNull();
    expect(theme!.fontFamily).toBe('Minecraftia, monospace');
    expect(theme!.chapterBackground).not.toBeNull();
    expect(theme!.chapterBackground!.dataUrl).toBe('data:image/png;base64,abc');
    expect(cache.isLoaded).toBe(true);
  });

  it('should notify listeners on theme change', async () => {
    const listener = vi.fn();
    cache.onThemeChange(listener);

    await cache.processAssetsReady({
      cachePath: '.workbench/cache',
      mcVersion: '1.21.1',
      loader: 'neoforge',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      fontFamily: 'Minecraftia, monospace',
    }));
  });

  it('should extract node borders from UI assets', async () => {
    const theme = await cache.processAssetsReady({
      cachePath: '.workbench/cache',
      ui_border_circle: 'data:image/png;base64,circle',
      ui_border_square: 'data:image/png;base64,square',
    });

    expect(theme!.nodeBorders['circle']).toBeDefined();
    expect(theme!.nodeBorders['circle'].slice).toBe(8);
    expect(theme!.nodeBorders['square']).toBeDefined();
    expect(theme!.nodeBorders['hexagon']).toBeUndefined();
  });

  it('should look up icons by item ID', async () => {
    await cache.processAssetsReady({
      cachePath: '.workbench/cache',
      icon_minecraft_diamond: 'data:image/png;base64,diamond',
      icon_minecraft_iron_ingot: 'data:image/png;base64,iron',
    });

    expect(cache.getIconDataUrl('minecraft:diamond')).toBe('data:image/png;base64,diamond');
    expect(cache.getIconDataUrl('minecraft:iron_ingot')).toBe('data:image/png;base64,iron');
    expect(cache.getIconDataUrl('minecraft:netherite')).toBeNull();
  });

  it('should handle empty payload gracefully', async () => {
    const theme = await cache.processAssetsReady({});
    expect(theme).not.toBeNull();
    expect(theme!.nodeBorders).toEqual({});
    expect(theme!.chapterBackground).toBeNull();
  });

  it('should handle null payload gracefully', async () => {
    const theme = await cache.processAssetsReady(null);
    expect(theme).toBeNull();
    expect(cache.isLoaded).toBe(false);
  });

  it('should clear manifest on clear()', async () => {
    await cache.processAssetsReady({ cachePath: '.workbench/cache' });
    expect(cache.isLoaded).toBe(true);
    cache.clear();
    expect(cache.isLoaded).toBe(false);
    expect(cache.currentManifest).toBeNull();
  });

  it('should get UI assets by name', async () => {
    await cache.processAssetsReady({
      cachePath: '.workbench/cache',
      ui_chapter_background: 'data:image/png;base64,bg',
    });

    const asset = cache.getUiAsset('chapter_background');
    expect(asset).not.toBeNull();
    expect(asset!.dataUrl).toBe('data:image/png;base64,bg');
  });

  it('should return null for missing UI assets', () => {
    expect(cache.getUiAsset('nonexistent')).toBeNull();
  });

  it('should notify null on clear()', async () => {
    const listener = vi.fn();
    cache.onThemeChange(listener);
    await cache.processAssetsReady({ cachePath: '.workbench/cache' });
    expect(listener).toHaveBeenCalledTimes(1);

    cache.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(null);
  });
});
