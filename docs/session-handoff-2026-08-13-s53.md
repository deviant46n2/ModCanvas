# Session Handoff — 2026-08-13 (s53: the scoping session)

Branch `master`. Tree is clean; all work committed and pushed (`9d6f97f..189243c`).

## WHAT WE BUILT (one line)

The beginner wedge was hardened end-to-end: Beginner Mode became a coach (hint
strip), the CF-auth "issue" was killed by a live retest (key works — the real
finding is CF search can't surface FTB Quests), mod execution was handed to
Prism (PRISM-LEAN: ModCanvas curates + diagnoses, Prism executes), the guided
first quest moved to the live surface, and the green check gained a core-mod
gate so "ready to test" can no longer bless a pack whose quest book doesn't
exist in-game.

## DONE

- `f454cae` — feat(beginner): Beginner Mode hint strip — the coach (directed
  queue #2 chunk). Product call ruled s52 (REDESIGN) → s53 rulings (coach →
  strip → 4 steps, guide-never-claims-done). `core/beginner/steps.ts` (pure
  derivation: report + connection signals + quest graph → steps; nothing-checked
  discriminator), `BeginnerHintStrip.tsx` (renders when `beginnerMode === true`,
  inside PackHealthProvider), `app-beginner.css`. Docs: `beginner-mode.md`
  rewritten as the coach, roadmap §0 row 2 / §9.4 / §9.5 amended, audit finding
  #11 → STRIP SHIPPED (partial). 720 FE tests.
- `dbc203d` — refactor(mods): PRISM-LEAN chunk 1. Ruling: ModCanvas curates +
  diagnoses; Prism executes (browse, versions, dependencies — Prism bundles its
  own CF key, so the keyring friction dies for installs). `open_prism_instance`
  (`prismlauncher --show <instanceId>`, instance ID = folder under `instances/`),
  wizard curated step → curated list + "Open Prism to install these" +
  manual-link fallback for non-instance packs, Mods tab "Add mods in Prism"
  button, `CuratedDepsList` deleted, CF-key box died. 630 lines removed. Chunk 2
  (search/install deletion) booked roadmap §0 row 6. Docs: `mods-tab.md`
  rewritten, roadmap §0 rows 5-6 / §3.3 / §9.3 step 4 / §13 / feature table.
- `eaa94f7` — fix(prism): `instance.cfg` name key `Name=` → `name=`. Prism
  ignores the capitalized key → fresh instances showed "Unnamed Instance"
  (observed live during the wizard test; real Prism instances use lowercase).
  Regression test locks the format.
- `189243c` — feat(wedge): guided quest to the live surface + core-mod launch
  gate.
  - Guided quest moved: the wizard's pre-launch step (empty item picker — no
    game data) is gone; the teaching moment is a per-session banner in the
    quest editor on first companion connect in Beginner Mode (picker is full,
    hotswap on display). ide-tour/blank/full-IDE never see it. External handoff
    (`showGuidedQuest`) removed as dead wiring with evidence.
  - Core-mod gate: `IngestResult.mods` (scanned jar names, null = no mods dir =
    no claim, Trust Rule) → `checkCoreMods` (`core/pack-health/checks/mods.ts`)
    — FTB Quests + KubeJS absent = blocking findings in the new Mods section;
    the wizard's green check disables Launch on blocking and renders the
    findings inline. "Ready to test" now means the quest book will exist.
  - 456 Rust (incl. 2 new), 727 FE (incl. 9 new), integrity clean, binary
    rebuilt.
- Live-verified findings behind the ruling: CF key returns HTTP 200 (s49's
  "account is the blocker" was stale observation — the retest discipline paid
  out); CF search `searchFilter=ftb` returns 50 irrelevant hits / zero FTB
  mods; FTB Quests 289412 file 2101.1.30 declares 3 required CF deps (404465
  FTB Library, 404468 FTB Teams, 419699 Architectury); `CurseForgeFileInfo`
  doesn't parse CF dependencies at all.

## DECISIONS (memory pointers)

- Beginner Mode becomes a coach — strip first, guide step never claims
  completion. [code:decision: s53 BEGINNER-COACH-STRIP]
- PRISM-LEAN: ModCanvas curates + diagnoses, Prism executes; the tiered-resolver
  build was cancelled as superseded. [code:decision: s53 PRISM-LEAN]
- Guided first quest lives at the live surface — first companion connect in
  Beginner Mode, per-session dismiss, no first-run tracking. [code:decision: s53
  GUIDED-QUEST-LIVE-SURFACE]

## GOTCHAS (memory pointers)

- "I'm having CF auth issues" + s49's "account is the blocker" were both killed
  by one live curl (HTTP 200). Stale observation outlives confident conclusions.
- CF search can't find FTB Quests by name (relevance quirk); the slug fallback
  can't rescue "ftb" (no mod has slug "ftb"). Curated picks are ID-keyed
  (289412) — that's why the wizard never hit it.
- Prism ignores the capitalized `Name=` key in instance.cfg — write what the
  tool writes (the s47 SNBT lesson, same class).

## NEXT

- **Chunk 2 deletion (roadmap §0 row 6)** — evidence pass COMPLETE, awaiting
  ruling: dies = `search_mods` + `install_mod_from_search` commands (+ lib.rs
  registrations), `search_merge.rs`, orphaned `download_mod` /
  `download_curseforge_mod_for_version` (imports use their own download paths),
  FE search services + ModsTab search section + SearchResultRow + compat-panel
  install buttons (`useCompatInstall`), App search-prop threading, 3 test
  files. Keeps (proven shared boundary): `search_modrinth` / `search_curseforge`
  + `find_best_match*` (imports), `batch_get_metadata` (curated + grid +
  compat), `check_compatibility_async` (diagnosis), `resolve_curseforge_api_key`
  + key storage (imports + metadata).
- **Pilots 1-3 (student's eyes)** — full-wedge run with Prism install; skip
  test (gate must block); veteran check (no banner in ide-tour). Results
  pending — the fresh-eyes evidence the tripwires keep asking for.
- **Sober ownership revisit** — explain-backs carried (strip, PRISM-LEAN,
  guided-quest move, core-mod gate), invitation-only.
- Strip visual check (shipped `f454cae`, unviewed).
- Spine: P2 row 5 atomic writes (parked). Re-reviews 08-19 (3-layer), 08-20
  (round-trip), 08-21 (delegation/PRISM-LEAN).
- CF dummy-key test 08-15: **OBSOLETE** — key live-verified working.

## Environment reminders

- Release binary is current (rebuilt after the gate; stale-binary clean).
- Integrity: 9/9, only the pre-existing PARKED RecipeEditor line-limit entry.
- The scratch dabble file was deleted at this boundary as promised.
