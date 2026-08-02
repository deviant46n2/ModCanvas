interface TextureLoadingBarProps {
  remaining: number
}

/** Small overlay showing that textures are being materialized and cached. */
export function TextureLoadingBar({ remaining }: TextureLoadingBarProps) {
  return (
    <div className="quest-texture-loading" role="status" aria-live="polite">
      <div className="quest-texture-loading-track">
        <div className="quest-texture-loading-fill" />
      </div>
      <span className="quest-texture-loading-label">
        {remaining > 0 ? `Loading & caching textures… (${remaining} remaining)` : 'Caching textures…'}
      </span>
    </div>
  )
}
