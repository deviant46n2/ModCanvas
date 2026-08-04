// Pack-coverage checks: the "completes the pack story" category (Project Bible
// §9.1 Recommended tier). Never blocks — a missing cover image or empty pack
// info field cannot break the game, and the panel must stay truthful.

import type { QuestGraphData } from '../../../services/quest-types'
import type { HealthItem } from '../types'

export interface PackCoverageMeta {
  name: string
  description: string
  author: string
  packVersion: string
}

export interface PackCoverageInput {
  meta: PackCoverageMeta
  hasCoverImage: boolean
  packLoaded: boolean
  questGraph: QuestGraphData | null
}

function checkPackInfo(meta: PackCoverageMeta): HealthItem[] {
  const items: HealthItem[] = []
  if (!meta.name.trim()) {
    items.push({
      id: 'pack.info.name',
      severity: 'recommended',
      message: 'The pack has no name.',
      detail: 'A pack name shows up in the launcher and in share links.',
      copyText: 'Pack health: the pack has no name.',
      target: { section: 'pack' },
    })
  }
  if (!meta.description.trim()) {
    items.push({
      id: 'pack.info.description',
      severity: 'recommended',
      message: 'The pack has no description.',
      detail: 'Describes what the pack is about for players and reviewers.',
      copyText: 'Pack health: the pack has no description.',
      target: { section: 'pack' },
    })
  }
  if (!meta.author.trim()) {
    items.push({
      id: 'pack.info.author',
      severity: 'recommended',
      message: 'The pack has no author.',
      detail: 'Shown in the launcher and on distribution pages.',
      copyText: 'Pack health: the pack has no author.',
      target: { section: 'pack' },
    })
  }
  return items
}

function checkCoverImage(hasCoverImage: boolean): HealthItem[] {
  if (hasCoverImage) return []
  return [
    {
      id: 'pack.cover-image',
      severity: 'recommended',
      message: 'No pack cover image is set.',
      detail: 'A cover image makes the pack shareable; it never blocks launching.',
      copyText: 'Pack health: no pack cover image is set.',
      target: { section: 'pack' },
    },
  ]
}

function checkZeroChapters(input: PackCoverageInput): HealthItem[] {
  if (!input.packLoaded || !input.questGraph || input.questGraph.chapters.length > 0) return []
  return [
    {
      id: 'pack.zero-chapters',
      severity: 'recommended',
      message: 'The quest book has no chapters.',
      detail: 'An empty book makes for a confusing first run; add at least one starter chapter.',
      copyText: 'Pack health: the quest book has no chapters.',
      target: { section: 'pack' },
    },
  ]
}

/** Run all pack-coverage checks. */
export function checkPack(input: PackCoverageInput): HealthItem[] {
  if (!input.packLoaded) return []
  return [
    ...checkPackInfo(input.meta),
    ...checkCoverImage(input.hasCoverImage),
    ...checkZeroChapters(input),
  ]
}
