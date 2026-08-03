// Loader normalization between the Project's stored `mod_loader` string
// (e.g. "NeoForge", "Forge", "Fabric", "Quilt") and the adapter's lower-case
// `LoaderType` ("neoforge" | "forge" | "fabric" | "quilt"). Pure, UI-free.

import type { LoaderType } from '../../adapters/types';

const LOADER_ALIASES: Record<string, LoaderType> = {
  neoforge: 'neoforge',
  'neo-forge': 'neoforge',
  neo_forge: 'neoforge',
  neoforge1: 'neoforge',
  forge: 'forge',
  fabric: 'fabric',
  quilt: 'quilt',
};

/** Map an arbitrary Project `mod_loader` string to an adapter `LoaderType`. */
export function normalizeLoader(raw: string | null | undefined): LoaderType {
  if (!raw) return 'neoforge';
  const key = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return LOADER_ALIASES[key] ?? 'neoforge';
}

/** Resolve the adapters' canonical loader label for `getAdapter`. */
export function loaderLabel(loader: LoaderType): string {
  return loader;
}