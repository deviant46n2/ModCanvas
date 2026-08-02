import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { parseAnimationMeta, frameDurationMs } from '../../core/quest/animated-texture'
import { prepareAnimatedSheet } from '../../services/sprite-sheet'
import type { AnimatedSheet } from '../../services/sprite-sheet'
import { useAnimationMap, animationMetaForKey } from './animation-context'

interface AnimatedSpriteProps {
  /** Displayable texture URL (data URL or remote). */
  url: string
  /** Texture key used to look up `.mcmeta` animation metadata in the
   *  animation context. Omit for textures that are never animated. */
  textureKey?: string | null
  width: number
  height: number
  alt?: string
  className?: string
  style?: CSSProperties
  /** Render as a covering background box (decorations) instead of an `<img>`. */
  asBackground?: boolean
  imageRendering?: 'pixelated' | 'auto'
  /** Fired when the underlying image fails to load. */
  onError?: () => void
  /** Forwarded to the rendered element. */
  title?: string
  onClick?: () => void
}

/**
 * Texture display that plays Minecraft `.mcmeta` animations in place of the
 * flat frame-strip image. Falls back to a plain `<img>` (or background box)
 * when the texture has no animation metadata, exactly matching the previous
 * behavior. Sequential frame order is animated with pure CSS; reordered or
 * interpolated sheets are rebuilt once on a canvas (see sprite-sheet.ts).
 */
export function AnimatedSprite({
  url,
  textureKey,
  width,
  height,
  alt,
  className,
  style,
  asBackground,
  imageRendering,
  onError,
  title,
  onClick,
}: AnimatedSpriteProps) {
  const animations = useAnimationMap()
  const rawMeta = useMemo(
    () => (textureKey ? animationMetaForKey(animations, textureKey) : undefined),
    [animations, textureKey]
  )
  const meta = useMemo(() => parseAnimationMeta(rawMeta), [rawMeta])
  const [sheet, setSheet] = useState<AnimatedSheet | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    if (!meta) {
      setSheet(null)
      setReady(true)
      return
    }
    prepareAnimatedSheet(url, meta)
      .then((s) => {
        if (cancelled) return
        setSheet(s)
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setSheet(null)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [url, meta])

  const animated = ready && sheet && sheet.count > 1 ? sheet : null
  const displayUrl = animated ? animated.url : url

  if (animated) {
    const durationMs = Math.max(1, (animated.count - 1) * frameDurationMs(meta, animated.interpolated))
    const animStyle: CSSProperties = {
      ...style,
      width,
      height,
      backgroundImage: `url(${animated.url})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `100% ${animated.count * 100}%`,
      imageRendering: imageRendering ?? 'pixelated',
      animationName: 'quest-frame-strip',
      animationTimingFunction: `steps(${animated.count - 1}, end)`,
      animationDuration: `${durationMs}ms`,
      animationIterationCount: 'infinite',
    }
    return (
      <div
        className={`quest-anim-sprite${className ? ` ${className}` : ''}`}
        role={alt ? 'img' : undefined}
        aria-label={alt}
        title={title}
        onClick={onClick}
        style={animStyle}
      />
    )
  }

  if (asBackground) {
    return (
      <div
        className={className}
        title={title}
        onClick={onClick}
        style={{ ...style, width, height, backgroundImage: `url(${displayUrl})` }}
      />
    )
  }
  return (
    <img
      src={displayUrl}
      alt={alt ?? ''}
      className={className}
      title={title}
      onClick={onClick}
      onError={onError}
      style={{ width, height, imageRendering: imageRendering ?? 'pixelated', ...style }}
    />
  )
}
