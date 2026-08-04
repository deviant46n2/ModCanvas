import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { smartFilterMembers, matchingSmartFilterItems } from '../../core/quest/smart-filter'
import { getIconUrl, resolveIconKey } from './QuestTileTypes'
import { isTexturePending } from '../../services/texture-loader'
import { getTagItems, getTagVersion, isTagPending, subscribeTagChanges } from '../../services/smart-filter-tags'
import { getAllRegisteredItems, getItemMod, getModItems, getModVersion, isModPending, subscribeModChanges } from '../../services/smart-filter-mods'
import { QuestIcon } from './QuestIcon'
import { AnimatedSprite } from './AnimatedSprite'

// In-game, `IconAnimation.draw` picks `list.get((System.currentTimeMillis() /
// 1000L) % size)` — the quest icon rotates once per second. Match that beat so
// the editor doesn't appear to lag behind (or race past) the in-game quest.
const CYCLE_MS = 1000

// A `not(...)`-heavy filter (e.g. `not(item(x))`) matches almost the whole
// registry. In-game the icon really does cycle through every creative-tab hit,
// but materializing thousands of textures per quest tile is wasteful; cycling
// the first matches keeps the parity look without the cost.
const MAX_MATCHED_DISPLAY = 48

interface SmartFilterIconProps {
  dsl: string
  textureIndex: Record<string, string>
  fallback: ReactNode
  size: number
  imgSize?: number
  fallbackFontSize?: number
}

interface MemberState {
  url: string
  key: string
}

/** Resolve an item id to its display URL / pending state. */
function itemState(
  id: string,
  textureIndex: Record<string, string>,
): { url: string | null; key: string; pending: boolean } {
  const key = resolveIconKey(id)
  if (!key) return { url: null, key: '', pending: false }
  return {
    url: getIconUrl(textureIndex, key),
    key,
    pending: isTexturePending(textureIndex, key),
  }
}

function useMemberUrls(
  dsl: string,
  textureIndex: Record<string, string>,
): { members: MemberState[]; pending: boolean } {
  const tagVersion = useTagVersion()
  const modVersion = useModVersion()
  return useMemo(() => {
    const members: MemberState[] = []
    let pending = false
    const seen = new Set<string>()
    const pushItem = (id: string) => {
      const { url, key, pending: p } = itemState(id, textureIndex)
      if (url && !seen.has(key)) {
        seen.add(key)
        members.push({ url, key })
      } else if (p) {
        pending = true
      }
    }

    // Full-filter matching (parity with in-game): once the instance item
    // registry and every referenced tag/mod are loaded, the icon cycles through
    // the items that actually satisfy the DSL — root=AND, `not` narrows, etc.
    // Until then fall back to the flat leaf candidates below.
    const registry = getAllRegisteredItems()
    const membersList = smartFilterMembers(dsl)
    const registryReady = registry.length > 0
    const tagsReady = membersList.every(
      (m) => m.type !== 'tag' || getTagItems(m.tag) !== undefined,
    )
    const modsReady = membersList.every(
      (m) => m.type !== 'mod' || !isModPending(m.mod),
    )
    if (registryReady && tagsReady && modsReady) {
      const matched = matchingSmartFilterItems(
        dsl,
        registry,
        { tagItems: (t) => getTagItems(t), modOf: getItemMod },
      )
      for (const id of matched.slice(0, MAX_MATCHED_DISPLAY)) pushItem(id)
      // A filter that matches nothing falls back to the generic smart filter
      // item below (FTB shows the filter stack itself in that case).
      return { members, pending }
    }

    for (const member of membersList) {
      if (member.type === 'item') {
        pushItem(member.id)
      } else if (member.type === 'tag') {
        if (isTagPending(member.tag)) {
          pending = true
        }
        for (const item of getTagItems(member.tag) || []) {
          pushItem(item)
        }
      } else if (member.type === 'mod') {
        const items = getModItems(member.mod)
        if (!items || isModPending(member.mod)) {
          pending = true
          continue
        }
        for (const item of items) {
          pushItem(item)
        }
      }
    }
    return { members, pending }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsl, textureIndex, tagVersion, modVersion])
}

function useTagVersion(): number {
  const [version, setVersion] = useState(getTagVersion())
  useEffect(() => {
    const unsub = subscribeTagChanges(() => setVersion(getTagVersion()))
    return unsub
  }, [])
  return version
}

function useModVersion(): number {
  const [version, setVersion] = useState(getModVersion())
  useEffect(() => {
    const unsub = subscribeModChanges(() => setVersion(getModVersion()))
    return unsub
  }, [])
  return version
}

/** Cycles through a smart filter's member item textures, mirroring the in-game
 * alternating requirement icon. Falls back to the generic smart filter texture
 * when no member resolves. */
export function SmartFilterIcon({ dsl, textureIndex, fallback, size, imgSize, fallbackFontSize }: SmartFilterIconProps) {
  const { members, pending } = useMemberUrls(dsl, textureIndex)
  const [index, setIndex] = useState(0)
  const count = members.length

  useEffect(() => {
    if (count <= 1) return
    setIndex(0)
    const id = setInterval(() => setIndex(i => (i + 1) % count), CYCLE_MS)
    return () => clearInterval(id)
  }, [count])

  if (count > 0) {
    const member = members[index % count]
    return (
      <AnimatedSprite
        url={member.url}
        textureKey={member.key}
        width={imgSize ?? size}
        height={imgSize ?? size}
        alt=""
        imageRendering="pixelated"
      />
    )
  }

  // No member resolved yet — show the generic smart filter icon if present,
  // otherwise a skeleton while members/tags are pending, else the fallback.
  const genericKey = 'ftbfiltersystem:smart_filter'
  const genericUrl = getIconUrl(textureIndex, genericKey)
  const genericPending = isTexturePending(textureIndex, genericKey)
  return (
    <QuestIcon
      url={genericUrl}
      pending={(pending || genericPending) && !genericUrl}
      fallback={fallback}
      size={size}
      imgSize={imgSize}
      fallbackFontSize={fallbackFontSize}
      textureKey={genericKey}
    />
  )
}
