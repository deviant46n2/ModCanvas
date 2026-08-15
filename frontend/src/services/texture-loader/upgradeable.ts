// Engine-upgradeable key tracking (s58). Item ids in this set resolve FLAT
// offline (they materialize normally) but their model chain reaches 3D block
// geometry — in-game they render 3D. The companion's engine render should
// REPLACE the flat stand-in when connected.
//
// This is deliberately SEPARATE from the `baked` set: baked keys never
// materialize offline (they're the "run the instance" prompt), while
// upgradeable keys DO materialize flat as a fallback. The distinction keeps
// the EngineRenderPrompt honest — upgradeable items are enhancements, not
// requirements.

const upgradeableKeys = new Set<string>()
const upgradeableSubscribers = new Set<() => void>()

function bumpUpgradeableKeys(): void {
  for (const fn of [...upgradeableSubscribers]) fn()
}

/** Subscribe to changes in the engine-upgradeable key set. */
export function subscribeUpgradeableKeys(fn: () => void): () => void {
  upgradeableSubscribers.add(fn)
  return () => {
    upgradeableSubscribers.delete(fn)
  }
}

/** Item ids the engine should render 3D when the companion is connected. */
export function getUpgradeableTextureKeys(): string[] {
  return [...upgradeableKeys]
}

/** Test-only: clear tracking state. */
export function __resetUpgradeableKeys(): void {
  if (upgradeableKeys.size > 0) {
    upgradeableKeys.clear()
    bumpUpgradeableKeys()
  }
}

export function registerUpgradeableKeys(keys: Iterable<string>): void {
  let changed = false
  for (const k of keys) {
    if (!upgradeableKeys.has(k)) {
      upgradeableKeys.add(k)
      changed = true
    }
  }
  if (changed) bumpUpgradeableKeys()
}
