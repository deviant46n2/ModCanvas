// Core-mod presence check (s53 gate): ModCanvas's editors write to FTB Quests
// (the quest book) and KubeJS (recipes). Without those mods the pack's own
// content is invisible in-game — the wedge promise breaks ("launch and your
// pack works" while the book doesn't exist). Blocking findings, PROVABLE: the
// signal is the actual scanned mods/ jar names from the ingest, not DB rows
// and not guesses. Trust Rule: when the mods dir doesn't exist (null), nothing
// was scanned — the check stays silent rather than claiming absence.

import type { HealthItem } from '../types'
import type { CompatibilityIssue } from '../../../services/types'

/** The curated core picks the app's own features depend on (curated.rs).
 *  `fix` is the beginner-facing install instruction — CF picks install in
 *  Prism (ModCanvas can't download CurseForge keylessly, and Prism parses the
 *  CF deps the app cannot see); Modrinth picks can install in-app too. */
export const CORE_MOD_PATTERNS: Array<{ id: string; pattern: RegExp; name: string; copy: string; fix: string }> = [
  {
    id: 'mods.core-missing.ftb-quests',
    pattern: /ftb[-_ ]?quests/i,
    name: 'FTB Quests',
    copy: "FTB Quests — the mod that renders your quest book in-game. Without it, the quests you write here never appear in Minecraft.",
    fix: "Install it from Prism: open this pack in Prism → Mods → Download Mods → search \"FTB Quests\" → Install. When Prism asks about FTB Library, FTB Teams, and Architectury — install those too; all three are required and ModCanvas can't add them for you.",
  },
  {
    id: 'mods.core-missing.kubejs',
    pattern: /kubejs/i,
    name: 'KubeJS',
    copy: "KubeJS — the mod that applies ModCanvas's recipe scripts in-game. Without it, edited recipes never take effect.",
    fix: "Install it in one click from the wizard's curated mods step, or from Prism: Mods → Download Mods → search \"KubeJS\" → Install.",
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
        detail: core.fix,
        copyText: `Pack Health: ${core.copy}`,
        target: { section: 'mods' },
      })
    }
  }
  return items
}

/**
 * Missing required deps from the compat check — a PERSISTENT, non-blocking
 * warning (s55 ruling: the user may not want to install a mod right now, and
 * that's their call). Distinct from `checkCoreMods` (ModCanvas's OWN editors'
 * dependencies, blocking) — these are deps OF the installed mods (e.g. KubeJS
 * → Rhino). The signal is the compat check's cached result (network-degrading
 * to no-claim per the compat check's own rule); the install affordance lives
 * in the Mods tab's compatibility panel.
 */
export function checkMissingDeps(depIssues: CompatibilityIssue[]): HealthItem[] {
  return depIssues
    .filter((issue) => issue.message && issue.affected_mod_names.length > 0)
    .map((issue) => ({
      id: `mods.dep-missing.${issue.affected_mod_names.join('+').toLowerCase().replace(/[^a-z0-9+]/g, '-')}`,
      severity: 'recommended' as const,
      message: issue.message,
      detail: "Install it from the Mods tab's compatibility panel — one click, whenever you want. This won't block launching.",
      copyText: `Pack Health: ${issue.message}`,
      target: { section: 'mods' },
    }))
}
