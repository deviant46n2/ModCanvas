import { useMemo } from 'react'
import type { QuestGraphData, QuestNodeData } from '../../services/api'
import type { ProgressState } from '../../core/quest/progress'
import { resolveIconKey, getIconUrl } from './questIcons'
import { chapterDefaultShapes } from './quest-canvas-model'
import { effectiveShape } from '../../core/quest/quest-shapes'
import { isLocked } from '../../core/quest/progress'

/** Chapter id → resolved icon URL ('' when none). Derived per graph+index. */
export function useChapterIconUrls(graph: QuestGraphData, textureIndex: Record<string, string>): Record<string, string | undefined> {
  return useMemo(() => {
    const map: Record<string, string | undefined> = {}
    for (const ch of graph.chapters) {
      const key = resolveIconKey(ch.icon)
      map[ch.id] = key ? getIconUrl(textureIndex, key) : undefined
    }
    return map
  }, [graph, textureIndex])
}

/** Chapter id → resolved texture key (for the pending check). */
export function useChapterIconKeys(graph: QuestGraphData): Record<string, string | undefined> {
  return useMemo(() => {
    const map: Record<string, string | undefined> = {}
    for (const ch of graph.chapters) {
      const key = resolveIconKey(ch.icon)
      if (key) map[ch.id] = key
    }
    return map
  }, [graph])
}

/** Quest count per chapter, for the chapter tree badges. */
export function useQuestCounts(graph: QuestGraphData): Record<string, number> {
  return useMemo(() => {
    const map: Record<string, number> = {}
    for (const ch of graph.chapters) {
      map[ch.id] = graph.nodes.filter(n => n.chapter_id === ch.id).length
    }
    return map
  }, [graph])
}

/**
 * Header-tile parity for the quest detail drawer: the quest's EFFECTIVE
 * shape (own shape else chapter default — quests without a shape inherit it
 * in-game) and its sim-locked state, computed with the same helpers the
 * canvas uses, so the detail header can never disagree with the canvas node.
 */
export function useDetailParity(
  selectedNode: QuestNodeData | null | undefined,
  graph: QuestGraphData,
  simProgress: ProgressState
): { shape: string; locked: boolean } {
  return useMemo(() => {
    if (!selectedNode) return { shape: '', locked: false }
    const defaults = chapterDefaultShapes(graph.chapters)
    const shape = effectiveShape(selectedNode.shape, defaults[selectedNode.chapter_id ?? ''])
    const locked = isLocked(selectedNode.id, graph.edges, simProgress)
    return { shape, locked }
  }, [selectedNode, graph, simProgress])
}
