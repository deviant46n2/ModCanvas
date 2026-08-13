# Session Handoff — walkthrough findings → four fixes, onboarding reshape, canvas UX (2026-08-12, s49)

**Branch:** `master` only (solo-mainline convention, AGENTS.md). 6 commits this
session, all pushed — `master` is **in sync with `origin/master`** at close
(`0e45603..8c54a07`). 453 Rust + 718 frontend green, tsc clean, integrity **0
violations**, release binary rebuilt (embeds all six commits). The stale
`target/debug/modcanvas` (pre-`8c54a07` — the `open_assets_folder` command is
not registered in a running dev app) is **not** the release artifact; restart
`pnpm dev` before trusting the new command in dev.

## WHAT WE BUILT (one line)
The fresh-eyes walkthrough finally ran and paid out: it killed first-boot
detection (unreachable for Prism users), replaced it with a user-choice
StartChooser + auto-create wizard, found and fixed a repo-wide Modrinth
download break (raw-JSON query strings), added a CDN fallback for an upstream
endpoint removal, and fixed four canvas UX gaps (spawn position, multi-add,
overlay collision, multi-select wiring).

## DONE (commits, newest first)

| Commit | What |
|---|---|
| `8c54a07` | feat(decorations): Open folder button — opens `kubejs/assets` for user assets (s49) |
| `9ea4888` | feat(canvas): spawn-at-cursor multi-add with count ticker + wire multi-select (s49) |
| `d357987` | fix(modrinth): CDN fallback when the counted-download endpoint fails (s49) |
| `c040aae` | fix(modrinth): percent-encode version-filter JSON — raw brackets 404'd every fetch (s49) |
| `d5f5b3f` | feat(wizard): drop the where-picker — every start auto-creates a Prism instance (s49) |
| `8524598` | feat(onboarding): four-card StartChooser replaces first-boot detection (s49) |

## WHAT THE WALKTHROUGH FOUND (and the fixes)

1. **First-boot routing was unreachable by design** — `sync_prism_instances`
   (prism.rs:16) populates the project list before the frontend sees it, so
   `useFirstBootRouting`'s `projectCount > 0` skip always fired on Prism
   machines. **Fix (`8524598`):** killed the detection state machine entirely
   (hook + `first_boot_seen` + tests); the four-card StartChooser is a user
   choice at every project start, never a gate.
2. **Every Modrinth download 404'd** — version-list URLs hand-formatted raw
   JSON (`loaders=["neoforge"]`); the `url` crate encoded only the quotes,
   leaving raw brackets Modrinth rejects. Search encoded its facets; the
   version fetches didn't. **Fix (`c040aae`):** `version_url()` helper +
   regression test (encoded → 200, raw → curl won't even parse it).
3. **The counted-download endpoint is GONE upstream** — `/version/{id}/download`
   is absent from Modrinth's OpenAPI spec and 404s for every id (real, old,
   made-up — verified live). The s48 attribution fix made it the *only*
   download path. **Fix (`d357987`):** CDN fallback via `files[].url`;
   attribution is best-effort, never fatal; order locked by test.
4. **Wizard stale-state across opens** — the reshape dropped the reset
   effect; the mounted-but-hidden wizard reopened at a previous session's
   step/project ("immediately step 3", "project not found" from a stale id).
   **Fix (in `d357987`):** reset-on-open effect + regression test.
5. **Canvas UX (`9ea4888`)** — every "+ Add Quest" spawned at grid (0,0) and
   stacked; the add buttons covered ReactFlow's Controls; multi-select was
   half-built (state + tools existed, the two ReactFlow props that enable it
   never did). **Fix:** spawn-at-cursor + count ticker (1–10) with cascade
   (`cascadePosition`), overlay moved top-left, `selectionOnDrag` +
   `multiSelectionKeyCode` wired. Note: on empty space, left-drag now
   box-selects instead of panning (ReactFlow 12 standard; middle-drag pans).
6. **Decorations library (`8c54a07`)** — "Open folder" button opens
   `<instance>/kubejs/assets` (created if missing) via `open_assets_folder`
   (shell plugin, Rust-side call — scope bypass).

## IN-FLIGHT / OPEN (parked with reasons + tripwires)

- **Texture re-scan auto-trigger — PARKED (s49, written reason).** The Open
  folder button works, but a freshly-dropped PNG only appears in the library
  after the texture index re-scans (on pack load). A "re-scan" trigger on the
  decorations panel was scoped and deliberately parked: the button's core
  value (knowing where assets go) is already delivered, the scan plumbing is
  shared with the texture-index invalidation (INDEX_MEMO rules in AGENTS.md),
  and the student chose "auto trigger later". **Tripwire:** the walkthrough's
  next library session — if the reload gap actually bites, build the trigger.
- **CF API key saga — PARKED (external).** App side PROVEN end-to-end. Blocker
  is the student's CurseForge ACCOUNT. **Reminder 2026-08-15**: try a dummy
  CF account's key (200 = main account is the problem). CF-exclusive jars
  (FTB family) downloaded manually via the blocked-box link.
- **`controllable` curated pick** (`curated.rs:60`) — keyed as a Modrinth slug
  that 404s. Re-key to `curseforge:{id}` (verify once a working key exists)
  or drop. Every wizard load logs the 404.
- **Guided-tour driver** — PARKED (roadmap §9.5) with tripwire: fresh-eyes
  test showing quests-by-name aren't enough, or the dogfood item scheduled.
  *(s49 note: the tutorial-v2 walkthrough is STILL pending — the tour content
  is now the `ide-tour` template, which the StartChooser presets.)*
- **CI (P0-DISTRIB)** — roadmap tripwire FIRED (s44 hotswap). The thing that
  makes tags/nightly-builds mechanical.
- **Smoke-suite remainder** (SMOKE-6/9/10/14 + 11/12 chain) — tripwire: next
  instance launch.
- **f1b4cab + 7cc7263 doc-sync candidates** — unjudged (7cc7263 = the s48
  CurseForge fix, carried as candidate).
- **RecipeEditor.tsx line-limit PARK** — tripwire: next touching edit splits
  it (the script-preview-pref seam).
- **shell-plugin deprecation** — `tauri_plugin_shell`'s `open` is deprecated
  in favor of `tauri-plugin-opener` (s49 note, from the plugin source). The
  command works; switching is a dependency-change with no user-visible
  benefit yet. Park until the next shell-plugin touching change.

## PENDING (owed ledger — data, never a gate)

- PR-A dependency-test retake — declined by student, carried.
- Explain-back offers for the chunk-1/2 commits — unanswered, carried.
- CF dummy-account curl test — scheduled 08-15 reminder.

## UNVERIFIED CLAIMS

- The tutorial v2 / IDE-tour quest text has still not been walked end-to-end
  in the app by a user. The walkthrough exercised the StartChooser, wizard,
  curated step, and canvas — but the tour *quests themselves* (the 20-quest
  ide-tour + 6-quest intro templates) were never read in-app. Fidelity tests
  pass; human readability is untested.
- The CDN fallback was never observed producing an actual jar end-to-end
  (verified via curl that the CDN file serves 200; the app's fallback path is
  unit-tested only).
- The `open_assets_folder` command has never been clicked in a running app.

## DECISIONS

- `PARK-ASSET-RESCAN` — park the re-scan auto-trigger with written reason +
  tripwire (student's debt-triage call; the open-folder button already
  delivers the discoverability win).
- Kill first-boot detection entirely (choice over detection — the walkthrough
  proved detection unreachable for the app's own audience).
- Wizard = thin commit point: name → auto-create Prism instance → post-create
  steps. Where-picker, scratch mode, and instance listing all deleted
  (`WizardWhereStep.tsx`, `scratch-form.tsx`, `wizardCandidates`).
- Back button NOT built (s49) — the root-cause fixes (reset-on-open, CDN
  fallback) removed the stranding that motivated it. Tripwire: if changing
  the pack name after create ever feels clumsy, Cancel + reopen covers it.

## GOTCHAS (resolved memory entries — see the memory store for detail)

- `MODRINTH-RAW-JSON-QUERY-404` — hand-formatted JSON in version-list query
  strings 404s; the `url` crate encodes quotes but leaves brackets.
- `MODRINTH-COUNTED-ENDPOINT-REMOVED` — `/version/{id}/download` gone from the
  OpenAPI spec; CDN `files[].url` still serves; fallback is required.
- `WIZARD-STALE-STATE-ACROSS-OPENS` — mounted-but-hidden wizard retains state
  without a reset-on-open effect.
- `MULTI-SELECT-HALF-BUILT` — state/tools existed, the two ReactFlow props
  that enable multi-selection never did.

## Next

1. **Restart `pnpm dev`** before testing the new `open_assets_folder` command
   in dev (the debug binary predates it).
2. Walk the **intro template quests** in-app (the tutorial readability claim
   is the oldest open UNVERIFIED item; the canvas fixes are exactly what the
   "Add a Quest" tour quests exercise).
3. CF dummy-account test on 08-15 (reminder set).
4. Re-key or drop `controllable` (2 min; logs a 404 on every wizard load).
5. CI remains the roadmap's own next signal.
