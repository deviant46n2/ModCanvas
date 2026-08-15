# Session Handoff — 2026-08-14 (s56: the Rhino gate + required-mod auto-install + companion direct-API reload)

Branch `master`. **Work NOT committed** — the s56 diff (8 files + the companion
bridge) sits uncommitted on top of `36bfdf8`. Commit before pushing.

## WHAT WE BUILT (one line)

The required-mod gate became the single source of truth: Rhino joined the
blocking core-mod check (a live first-boot failure proved KubeJS can't start
without it), the wizard auto-installs every required mod that has a Modrinth
slug, and the companion stopped typing permission-gated commands — it now
reloads FTB Quests through the mod's own API directly.

## DONE

- **Rhino in the core gate (student ruling, live-verified failure)**:
  `CORE_MOD_PATTERNS` (`frontend/src/core/pack-health/checks/mods.ts`) grew a
  third entry — `mods.core-missing.rhino` — because the deployed KubeJS jar's
  `neoforge.mods.toml` declares `rhino` as a required dep and NeoForge refuses
  to boot without it (`kubejs requires rhino`, live 17:56 flatpak boot log).
  The blocking message template became per-entry (each core mod carries its own
  failure copy — this also fixed a latent lie: KubeJS's message said "quest
  book won't appear" when it's about recipes). **Carve-out of the s55 ruling,
  stated in code + docs: discretionary deps warn (never gate); required deps of
  core mods gate.** Docs: mods-tab.md, roadmap §0 row 7.
- **Dedup, scan-conditioned**: `checkMissingDeps` drops dep issues whose
  `install.mod_id` matches a missing core pattern — but ONLY when the scan
  proved the core mod missing (`installedMods` passed into the check). No scan
  → gate silent (Trust Rule) → the dep warning survives. Verified the edge:
  the compat check runs off DB rows (`compat.rs`), so dep issues can exist
  without a scan.
- **Required-mod auto-install (student ruling: "all required mods auto
  installed")**: the gate list is the install source of truth — each entry
  carries `modrinthSlug` (kubejs, rhino) or none (FTB Quests = CF wall,
  verified live: NOT on Modrinth — only third-party addons; the guide step
  stays for it). `CuratedModsStep.handleContinue` installs gate mods missing
  from the scan after the ticked picks; `pickIds` exclusion prevents KubeJS
  double-install (it's both a pick and a gate entry); an UNTICKED required mod
  still installs (that's what "required" means). `WizardStepper` passes
  `installedMods` down. Future required mod = one row with a slug, no wizard
  edits.
- **Companion direct-API quest reload** (`FtbQuestsReloadBridge.java`, new):
  live reload FAILED with "Incorrect argument for command" — root-caused by
  bytecode decompile: FTB Quests **2101.1.31** changed
  `PermissionsHelper.hasEditorPermission(CommandSourceStack)` to require
  `source.isPlayer()`; the s43 console-dispatch fix no longer passes, the
  fallback permission provider returns false for everyone, so **no non-op
  player can reload via the command on 2101.1.31**. The bridge calls
  `ServerQuestFile.INSTANCE.load(true,true)` + `SyncQuestsMessage` broadcast
  reflectively (mirrors FTB's `doReload` steps 1-2), on the server thread,
  guarded by `ModList.isLoaded("ftbquests")`. **NO FTB compile deps** — student
  correctly rejected vendoring (FTB jars are All Rights Reserved; committing
  them distributes FTB's code; also no reachable maven serves them). Same
  reflective pattern as `isQuestBookOpen`. `mods.toml` declares ftbquests
  `mandatory=false`. Multiplayer keeps the command fallback.
- **Companion rebuilt + deployed + bundled**: jar (162943 bytes) verified in
  the monster instance AND the flatpak bundle (md5 match — the app re-deploys
  the companion at launch, so the bundled copy must be current or it clobbers
  the instance one: the s14 trap in reverse). Flatpak rebuilt with the fresh
  binary + dist (`index-g7CAP-QZ.js` verified inside).

## TESTS / STATE

- 734 FE (84 files) tests green (3 new gate tests); lint clean; `pnpm
  integrity` **0 violations** (release binary rebuilt via `cargo tauri build
  --no-bundle`).
- **THE FLATPAK PAIR'S LAST UNVERIFIED LINK NOW WORKS**: a real game launch
  through the flatpak pair connected the companion over 127.0.0.1:9876
  (`[Workbench Companion] Connected to ModCanvas at 127.0.0.1:9876`,
  19:38:26.929 game log). s55 NEXT item #1 resolved.
- Companion bridge compile-verified; reflection surface verified public via
  decompile on BOTH 2101.1.23 and 2101.1.31 (API stable across the boundary).
  **The live reload test has NOT completed** — interrupted by the texture issue.

## NEXT

- **Missing textures (OPEN, student-reported):** a fresh wizard pack + game
  connected (companion verified on 9876) still shows "tons of missing
  textures". NOT diagnosed — the student stopped the session before we looked.
  Starting point: the texture caches seen are ~2MB files dated 16:59 (BEFORE
  the fresh pack — likely stale/foreign); the fresh pack's index shape is
  unverified (my earlier key-count read used wrong keys — do not trust it).
  Read `instance_textures/index.rs` for the actual cache shape first.
- **Commit the uncommitted s56 diff** (gate + auto-install + bridge + mods.toml
  + docs) and push (push IS backup).
- Finish the live reload verification: fresh app + fresh game, edit → save →
  expect `[FtbQuestsReloadBridge] Direct quest reload dispatched` + FTB's
  `Loading quests from` → green PASS.
- AppImage still PARKED (linuxdeploy strip 2.35 vs RELR libs — the s54 AppImage
  in ~/Downloads still works); flatpak loop now uses `cargo tauri build
  --no-bundle` as step 1.
- Re-reviews 08-19 / 08-20 / 08-21; spine P2 row 5 (atomic writes) on the
  student's call.

## GOTCHAS

- `code:gotcha` linuxdeploy strip 2.35 chokes on .relr.dyn in host libs → AppImage bundle step fails; use `--no-bundle` — mem_1786750857636
- `code:gotcha` FTB Quests 2101.1.31 hasEditorPermission requires isPlayer → console dispatch dead; direct API is the only non-op path (see DECISIONS) — mem_1786754528393 (session)
- `code:gotcha` stale-process trap (hit twice today): a running flatpak app/game never picks up a new binary — check process start time, not the disk artifact — mem_1786754528393

## DECISIONS

- `code:decision` AppImage PARKED — flatpak is the test/distribution env; linuxdeploy strip 2.35 vs RELR libs; `cargo tauri build --no-bundle` for the flatpak loop — mem_1786750855639
- `code:session` s56 session log — mem_1786754525322
- Roadmap §0 row 7 REFINED (student ruling): **discretionary deps warn; required deps of core mods gate** (Rhino is load-bearing for KubeJS — not a choice). Shipped.
- Roadmap §0 row 7 EXTENDED (student ruling): **all required mods auto-install** — the gate list carries `modrinthSlug`; the wizard installs gate mods missing from the scan. Shipped.
- Companion reload (student ruling): **soft dep on FTB Quests via reflection, no vendored jars** (legal boundary: All Rights Reserved) — stopgap until ModCanvas designs its own quest system.
