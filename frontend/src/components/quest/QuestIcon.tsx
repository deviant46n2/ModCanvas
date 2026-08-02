import type { ReactNode } from 'react'
import { AnimatedSprite } from './AnimatedSprite'

interface QuestIconProps {
  url?: string | null
  pending?: boolean
  fallback: ReactNode
  size: number
  imgSize?: number
  fallbackFontSize?: number
  /** Texture key used to look up `.mcmeta` animation metadata (optional). */
  textureKey?: string | null
}

/** Icon slot that renders the texture (animated when its `.mcmeta` declares
 *  an animation), a shimmer skeleton while the texture is being materialized,
 *  or an emoji/char fallback once it is known unresolvable. */
export function QuestIcon({ url, pending, fallback, size, imgSize, fallbackFontSize, textureKey }: QuestIconProps) {
  if (url) {
    return (
      <AnimatedSprite
        url={url}
        textureKey={textureKey}
        width={imgSize ?? size}
        height={imgSize ?? size}
        alt=""
        imageRendering="pixelated"
      />
    )
  }
  if (pending) {
    return (
      <span
        className="quest-skeleton-block quest-icon-skeleton"
        aria-hidden="true"
        style={{ width: imgSize ?? size, height: imgSize ?? size }}
      />
    )
  }
  return (
    <span style={{ fontSize: fallbackFontSize ?? Math.max(14, Math.round(size * 0.7)) }}>
      {fallback}
    </span>
  )
}
