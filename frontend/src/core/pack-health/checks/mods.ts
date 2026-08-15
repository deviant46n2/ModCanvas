// Core-mod presence check (s53 gate): ModCanvas's editors write to FTB Quests
// (the quest book) and KubeJS (recipes). Without those mods the pack's own
// content is invisible in-game — the wedge promise breaks ("launch and your
// pack works" while the book doesn't exist). Blocking findings, PROVABLE: the
// signal is the actual scanned mods/ jar names from the ingest, not DB rows
// and not guesses. Trust Rule: when the mods dir doesn't exist (null), nothing
// was scanned — the check stays silent rather than claiming absence.
//
// Rhino is in the gate because KubeJS REQUIRES it (s56, live-verified): the
// jar's neoforge.mods.toml declares rhino as a required dep, and NeoForge
// refuses to boot without it — "kubejs requires rhino" is a first-launch
// failure, not a missing feature. A core mod's load-bearing dep is core.

import type { HealthItem } from '../types'
import type { CompatibilityIssue } from '../../../services/types'

/** The curated core picks the app's own features depend on (curated.rs).
 *  `fix` is the beginner-facing install instruction — CF picks install in
 *  Prism (ModCanvas can't download CurseForge keylessly, and Prism parses the
 *  CF deps the app cannot see); Modrinth picks can install in-app too.
 *  `message` is the per-mod blocking copy: failure semantics differ per mod
 *  (FTB Quests → quest book invisible; KubeJS → recipes never apply; Rhino →
 *  KubeJS cannot even start).
 *  `modrinthSlug` (s56): the auto-install path. The wizard installs every
 *  gate mod with a slug that the scan doesn't show — the gate list is the
 *  single source of truth for required mods, so a future required mod is one
 *  row with a slug, no wizard edits. Mods without a slug (FTB Quests — CF
 *  wall) install manually via the Prism guide step. */
export const CORE_MOD_PATTERNS: Array<{ id: string; pattern: RegExp; name: string; message: string; copy: string; fix: string; modrinthSlug?: string }> = [
  {
    id: 'mods.core-missing.ftb-quests',
    pattern: /ftb[-_ ]?quests/i,
    name: 'FTB Quests',
    message: "FTB Quests isn't installed — your quest book won't appear in-game.",
    copy: "FTB Quests — the mod that renders your quest book in-game. Without it, the quests you write here never appear in Minecraft.",
    fix: "Install it from Prism: open this pack in Prism → Mods → Download Mods → search \"FTB Quests\" → Install. When Prism asks about FTB Library, FTB Teams, and Architectury — install those too; all three are required and ModCanvas can't add them for you.",
  },
  {
    id: 'mods.core-missing.kubejs',
    pattern: /kubejs/i,
    name: 'KubeJS',
    message: "KubeJS isn't installed — your recipe edits never take effect in-game.",
    copy: "KubeJS — the mod that applies ModCanvas's recipe scripts in-game. Without it, edited recipes never take effect.",
    fix: "Install it in one click from the wizard's curated mods step, or from Prism: Mods → Download Mods → search \"KubeJS\" → Install.",
    modrinthSlug: 'kubejs',
  },
  {
    id: 'mods.core-missing.rhino',
    pattern: /rhino/i,
    name: 'Rhino',
    message: "Rhino isn't installed — KubeJS can't start without it, so your recipe edits never apply. Install it from the Mods tab's compatibility panel (one click).",
    copy: "Rhino — the scripting engine KubeJS runs on. ModCanvas's recipe edits need KubeJS, and KubeJS needs Rhino.",
    fix: "Install it in one click from the Mods tab's compatibility panel (the \"KubeJS requires Rhino\" row), or from Prism: Mods → Download Mods → search \"Rhino\" → Install.",
    modrinthSlug: 'rhino',
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
        message: core.message,
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
 * warning for deps OF USER-CHOSEN mods (s55 ruling: the user may not want to
 * install a mod right now, and that's their call). Carve-out (s56 ruling):
 * required deps of CORE mods are NOT this lane — the core gate owns them and
 * they gate (Rhino is the canonical case: KubeJS cannot boot without it).
 * `installedMods` conditions the dedup: when the mods dir was never scanned
 * the core gate stays silent (Trust Rule), so the dep warning must survive
 * rather than vanish. The signal is the compat check's cached result
 * (network-degrading to no-claim per the compat check's own rule); the
 * install affordance lives in the Mods tab's compatibility panel.
 */
export function checkMissingDeps(depIssues: CompatibilityIssue[], installedMods: string[] | null = null): HealthItem[] {
  // The core mods this scan proves missing — their dep issues are duplicates
  // of the blocking gate findings, so they drop out of this (warning) lane.
  const names = installedMods?.map((n) => n.toLowerCase())
  const missingCorePatterns = CORE_MOD_PATTERNS.filter((c) =>
    names ? !names.some((n) => c.pattern.test(n)) : false,
  )
  return depIssues
    .filter((issue) => issue.message && issue.affected_mod_names.length > 0)
    .filter((issue) => {
      if (!issue.install) return true // unresolvable dep — the warning is still honest
      return !missingCorePatterns.some((c) => c.pattern.test(issue.install!.mod_id))
    })
    .map((issue) => ({
      id: `mods.dep-missing.${issue.affected_mod_names.join('+').toLowerCase().replace(/[^a-z0-9+]/g, '-')}`,
      severity: 'recommended' as const,
      message: issue.message,
      detail: "Install it from the Mods tab's compatibility panel — one click, whenever you want. This won't block launching.",
      copyText: `Pack Health: ${issue.message}`,
      target: { section: 'mods' },
    }))
}
