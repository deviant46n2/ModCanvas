import type { IMinecraftVersionAdapter, LoaderType } from './types';
import { Minecraft121ForgeAdapter } from './v1_20_1/forge';
import { Minecraft121NeoForgeAdapter } from './v1_20_1/neoforge';
import { Minecraft121FabricAdapter } from './v1_20_1/fabric';
import { Minecraft1211NeoForgeAdapter } from './v1_21_1/neoforge';
import { Minecraft1211ForgeAdapter } from './v1_21_1/forge';
import { Minecraft1211FabricAdapter } from './v1_21_1/fabric';
import { Minecraft1211QuiltAdapter } from './v1_21_1/quilt';

type VersionKey = `${string}-${LoaderType}`;

export interface AdapterEntry {
  adapter: IMinecraftVersionAdapter;
  exact: boolean;
}

const registry = new Map<VersionKey, IMinecraftVersionAdapter>();

function register(adapter: IMinecraftVersionAdapter): void {
  const key = `${adapter.mcVersion}-${adapter.loader}` as VersionKey;
  registry.set(key, adapter);
}

register(new Minecraft121ForgeAdapter());
register(new Minecraft121NeoForgeAdapter());
register(new Minecraft121FabricAdapter());
register(new Minecraft1211NeoForgeAdapter());
register(new Minecraft1211ForgeAdapter());
register(new Minecraft1211FabricAdapter());
register(new Minecraft1211QuiltAdapter());

function resolveExact(mcVersion: string, loader: LoaderType): IMinecraftVersionAdapter | undefined {
  const key = `${mcVersion}-${loader}` as VersionKey;
  return registry.get(key);
}

function resolveByVersion(mcVersion: string): IMinecraftVersionAdapter | undefined {
  for (const adapter of registry.values()) {
    if (adapter.mcVersion === mcVersion) {
      return adapter;
    }
  }
  return undefined;
}

export function getAdapter(mcVersion: string, loader: LoaderType): IMinecraftVersionAdapter {
  const exact = resolveExact(mcVersion, loader);
  if (exact) return exact;

  const fallback = resolveByVersion(mcVersion);
  if (fallback) {
    console.warn(
      `[Adapter] No exact adapter for ${mcVersion}/${loader}, ` +
      `falling back to ${fallback.mcVersion}/${fallback.loader}`
    );
    return fallback;
  }

  console.warn(
    `[Adapter] No adapter found for ${mcVersion}/${loader}, ` +
    `falling back to 1.21.1/neoforge`
  );
  const defaultAdapter = resolveExact('1.21.1', 'neoforge');
  if (!defaultAdapter) {
    throw new Error(`No adapter found for ${mcVersion}/${loader} and no default available`);
  }
  return defaultAdapter;
}

export function getAdapterEntry(mcVersion: string, loader: LoaderType): AdapterEntry {
  const key = `${mcVersion}-${loader}` as VersionKey;
  const exact = registry.get(key);
  if (exact) return { adapter: exact, exact: true };

  const fallback = resolveByVersion(mcVersion);
  if (fallback) return { adapter: fallback, exact: false };

  const defaultAdapter = resolveExact('1.21.1', 'neoforge');
  if (!defaultAdapter) {
    throw new Error(`No adapter found for ${mcVersion}/${loader} and no default available`);
  }
  return { adapter: defaultAdapter, exact: false };
}

export function registeredAdapters(): IMinecraftVersionAdapter[] {
  return Array.from(registry.values());
}

export function registeredKeys(): VersionKey[] {
  return Array.from(registry.keys());
}
