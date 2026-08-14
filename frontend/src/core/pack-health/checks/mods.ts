// Core-mod presence check (s53 gate): ModCanvas's editors write to FTB Quests
// (the quest book) and KubeJS (recipes). Without those mods the pack's own
// content is invisible in-game — the wedge promise breaks ("launch and your
// pack works" while the book doesn't exist). Blocking findings, PROVABLE: the
// signal is the actual scanned mods/ jar names from the ingest, not DB rows
// and not guesses. Trust Rule: when the mods dir doesn't exist (null), nothing
// was scanned — the check stays silent rather than claiming absence.

import type { HealthItem } from '../types'

/** The curated core picks the app's own features depend on (curated.rs). */
export const CORE_MOD_PATTERNS: Array<{ id: string; pattern: RegExp; name: string; copy: string }> = [
  {
    id: 'mods.core-missing.ftb-quests',
    pattern: /ftb[-_ ]?quests/i,
    name: 'FTB Quests',
    copy: "FTB Quests — the mod that renders your quest book in-game. Without it, the quests you write here never appear in Minecraft.",
  },
  {
    id: 'mods.core-missing.kubejs',
    pattern: /kubejs/i,
    name: 'KubeJS',
    copy: "KubeJS — the mod that applies ModCanvas's recipe scripts in-game. Without it, edited recipes never take effect.",
  },
]

/**
 * Blocking findings for missing core mods. `installedMods` is the scanned
 * mods/ jar-name list (null = no mods dir = unknown, silent).
 */
export function checkCoreMods(installedMods: string[] | null): HealthItem[] {
  if (installedMods === null) return []
  const names = installedMods.map((n) => n.toLowerCase())
  const items: HealthItem[] = []
  for (const core of CORE_MOD_PATTERNS) {
    if (!names.some((n) => core.pattern.test(n))) {
      items.push({
        id: core.id,
        severity: 'blocking',
        message: `${core.name} isn't installed — your quest book won't appear in-game.`,
        detail: core.copy + ' Install it from Prism (the curated mods step lists it).',
        copyText: `Pack Health: ${core.copy}`,
        target: { section: 'mods' },
      })
    }
  }
  return items
}
