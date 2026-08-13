import { useMemo } from 'react'
import { resolveAdapter } from '../../adapters/support'
import { servedMatrix } from '../../adapters/served-matrix'
import { normalizeLoader } from '../../core/recipe/loader'
import { WarnIcon } from '../ui/icons'

interface UnsupportedVersionBannerProps {
  mcVersion: string
  modLoader: string
}

/**
 * Pack-level warning shown while the pack's Minecraft version has no adapter
 * card (e.g. a minor version like 1.20.4, or an unregistered major). The app
 * will write files using the fallback adapter's rules — silently wrong syntax
 * for pre-1.20.5 packs (the s45 failure class). The banner exists so the
 * ADAPTER-SCOPE-MAJOR-ONLY policy's accepted cost is never silent.
 *
 * Mounted at the workspace level (ProjectWorkspace), NOT per-editor, because
 * the same wrong adapter drives quest, recipe, and loot writers alike.
 */
export function UnsupportedVersionBanner({ mcVersion, modLoader }: UnsupportedVersionBannerProps) {
  const resolution = useMemo(
    () => resolveAdapter(mcVersion, normalizeLoader(modLoader)),
    [mcVersion, modLoader],
  )

  const supportedVersions = useMemo(() => {
    const matrix = servedMatrix()
    if (matrix.length === 0) return ''
    return matrix.map((v) => v.mcVersion).join(', ')
  }, [])

  if (!resolution.crossVersion) return null

  return (
    <div className="unsupported-version-banner" role="status">
      <WarnIcon />
      <div className="unsupported-version-banner-text">
        <strong>Unsupported Minecraft version ({mcVersion})</strong> — ModCanvas only
        writes for {supportedVersions || 'its supported major versions'}. Files for this
        pack will be written using the {resolution.adapter.mcVersion}/{resolution.adapter.loader}
        {' '}rules, which may be incompatible with {mcVersion} packs in-game.
      </div>
    </div>
  )
}
