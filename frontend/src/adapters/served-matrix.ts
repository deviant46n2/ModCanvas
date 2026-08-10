import { registeredAdapters } from './factory';
import type { LoaderType } from './types';

export interface ServedVersion {
  mcVersion: string;
  loaders: LoaderType[];
}

/**
 * The (mcVersion, loader) combinations the adapter matrix can serve exactly —
 * the single source of truth for UI pickers (e.g. the New Project modal).
 *
 * Lives OUTSIDE factory.ts on purpose: the adapter-matrix integrity rule says
 * a new version/loader = a NEW file, never an edit to an existing adapter, and
 * the gate flags any modification under adapters/. This file is additive —
 * it derives from the public `registeredAdapters()` and modifies nothing.
 *
 * Never hand-roll version/loader option lists next to this: drift is how the
 * "1.19.2 offered but no adapter exists" lie happened (s34).
 */
export function servedMatrix(): ServedVersion[] {
  const byVersion = new Map<string, LoaderType[]>();
  for (const adapter of registeredAdapters()) {
    const loaders = byVersion.get(adapter.mcVersion) ?? [];
    if (!loaders.includes(adapter.loader)) {
      loaders.push(adapter.loader);
    }
    byVersion.set(adapter.mcVersion, loaders);
  }
  return Array.from(byVersion.entries()).map(([mcVersion, loaders]) => ({
    mcVersion,
    loaders,
  }));
}
