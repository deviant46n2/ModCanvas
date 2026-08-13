// Adapter resolution support: distinguish a SAFE fallback from a DANGEROUS
// one, and expose the served version set for UI copy.
//
// A known-version loader-miss (1.20.1 + quilt) resolves to a SAME-version
// adapter — version facts stay correct, low risk. A cross-version miss
// (1.19.2, 1.20.4) resolves to the default 1.21.1/neoforge card — writes
// will carry the WRONG version's syntax (data components on a pre-1.20.5
// pack). The UI must surface the cross-version case so the AGENTS.md
// major-versions-only policy's accepted cost is never silent.
//
// Pure, UI-free (3-layer rule). Lives OUTSIDE factory.ts on purpose: the
// adapter-matrix integrity gate flags any modification under adapters/, and
// this file is additive — it reads the public registry and modifies nothing
// (served-matrix.ts precedent).

import { getAdapterEntry } from './factory';
import type { IMinecraftVersionAdapter, LoaderType } from './types';

export interface AdapterResolution {
  /** Exact (version, loader) card exists. */
  exact: boolean;
  /** The adapter the factory resolved (possibly via fallback). */
  adapter: IMinecraftVersionAdapter;
  /** True when the resolved adapter is for a DIFFERENT MC version than the
   *  pack's — the dangerous fallback the UI must warn about. */
  crossVersion: boolean;
}

export function resolveAdapter(mcVersion: string, loader: LoaderType): AdapterResolution {
  const entry = getAdapterEntry(mcVersion, loader);
  return {
    exact: entry.exact,
    adapter: entry.adapter,
    crossVersion: entry.adapter.mcVersion !== mcVersion,
  };
}
