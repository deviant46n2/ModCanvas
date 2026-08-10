import { useMemo } from 'react'
import type { QuestChapter, QuestNodeData } from '../../services/quest-types'
import type { MoveChapterOption } from './QuestContextMenu'
import { stripMcFormatting } from '../../core/theme/font-formatter'

interface ChapterDisplayState {
  activeChapterName: string
  moveToChapters: MoveChapterOption[]
  activeChapterNodes: QuestNodeData[]
  activeChapterImages: QuestChapter['images']
}

/**
 * Chapter-derived display state for the canvas: the active chapter's name,
 * the chapters a quest can be moved to (everything except the active one,
 * titles stripped of MC formatting codes), and the active chapter's quests
 * and background images.
 */
export function useChapterDisplayState(
  chapters: QuestChapter[],
  activeChapter: string | null,
  nodes: QuestNodeData[],
): ChapterDisplayState {
  const activeChapterName = useMemo(() => {
    if (!activeChapter || !chapters) return ''
    const ch = chapters.find((c: QuestChapter) => c.id === activeChapter)
    return ch?.title || 'Untitled'
  }, [activeChapter, chapters])

  const moveToChapters = useMemo(() => {
    return chapters
      .filter((c: QuestChapter) => c.id !== activeChapter)
      .map((c: QuestChapter) => ({ id: c.id, title: stripMcFormatting(c.title) || 'Untitled' }))
  }, [chapters, activeChapter])

  const activeChapterNodes = useMemo(
    () => nodes.filter((n: QuestNodeData) => n.chapter_id === activeChapter),
    [nodes, activeChapter],
  )

  const activeChapterImages = useMemo(() => {
    if (!activeChapter) return []
    const ch = chapters.find((c: QuestChapter) => c.id === activeChapter)
    return ch?.images || []
  }, [activeChapter, chapters])

  return { activeChapterName, moveToChapters, activeChapterNodes, activeChapterImages }
}
