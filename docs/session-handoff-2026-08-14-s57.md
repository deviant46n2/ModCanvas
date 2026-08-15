# Session Handoff — 2026-08-14 (s57: quest-book ghost chapters + template icons + missing-textures root cause)

Branch `master`. **s56 work committed + pushed** (`c75c5d8`, `dd2d377`).
**This session's texture-index fix is UNCOMMITTED** — 5 files, see below.

## WHAT WE BUILT (one line)

Two quest-book bugs fixed, committed, and verified live in-game (fresh app →
save → ghost chapter pruned → fresh game → one tab + hotswap working); then
the missing-textures mystery was root-caused to a broken duplicate of
vanilla-jar discovery, and the fix is mid-flight: the texture index now
delegates to the indexer's OS-agnostic jar finder, with regression tests.

## COMMITTED + PUSHED (verified live)

- **`c75c5d8` fix(quests): compound template icons + prune ghost flat chapter files**
  - Template icons were bare strings (`icon = "minecraft:chest"`) — the game
    parses but renders no icon. All 27 icons across `intro` + `ide-tour` now
    compound (`icon = { id = ... }`), locked by
    `template_icon_fields_are_never_bare_strings` (s45 item-lock sibling).
  - Flat export never pruned stale flat chapter files (only subdirs folders) →
    orphaned `chapters/*.snbt` loaded by the game as a duplicate unnamed tab.
    New `cleanup_flat_layout` in `export/chapter.rs` prunes flat files whose
    parseable id ∉ graph; locked by
    `export_removes_stale_flat_chapter_files_not_in_graph`. `export/mod.rs`
    refactored back under the 300-line cap.
  - Docs: templates.md icon rule, workarounds.md rows 12 + 13.
- **`dd2d377` feat(companion+wizard): Rhino gate auto-install + direct-API
  quest reload bridge (s56)** — the previously-uncommitted s56 arc, committed
  as its own changeset now that the hotswap was verified live.
- **Verified end-to-end**: installed commit == repo commit (content markers in
  the packed binary — see GOTCHAS), game loaded `1 chapters, 7 quests` after
  fix, hotswap worked. All tests green at that point: 455 rust + 734 frontend.

## MISSING-TEXTURES ROOT CAUSE (proven) — fix IN PROGRESS

**Symptom**: item picker / editor show empty textures for vanilla items even
with companion connected.

**Root cause**: `instance_textures/layers.rs::vanilla_jars` was a SECOND,
broken copy of vanilla-jar discovery. It only knew `versions/` +
`~/.ftba/bin/versions/` — NOT the Prism layout
`{launcher_root}/libraries/net/minecraft/client/`. The monster cache
(sandbox path, see GOTCHAS) showed **layer 0 (vanilla) = 0 files**; all 654
"minecraft:" keys came from JourneyMap's jar (re-bundled entity icons), zero
`minecraft:item/*` textures. The indexer already had the correct
OS-agnostic ancestor walk (`indexer/vanilla.rs::find_vanilla_jars`) — that's
why the item REGISTRY worked while textures didn't.

**Fix (uncommitted, 5 files)**:
1. `layers.rs::vanilla_jars` → delegates to `crate::indexer::find_vanilla_jars`
   (single source of truth; ancestor walk is same relative layout on
   Linux/Windows/macOS).
2. Removed vestigial `~/.ftba` check (no `LauncherDriver` implements FTB App,
   zero tests/docs, broke test hermicity on hosts with FTB App installed —
   reason documented in code).
3. Shared function now checks BOTH `versions/` conventions (`instance_path/versions`
   and `parent()/versions`) — the two copies had diverged on this.
4. New test `prism_libraries_layout_vanilla_jars_are_indexed` (fake Prism tree)
   — **PASSING**.
5. `item_parent_block_model` made hermetic (was relying on host `~/.ftba` jar
   for vanilla cube_all) — **PASSING**.

**IN FLIGHT — 1 test failing**: `vanilla_jar_textures_are_indexed`
(still asserts `minecraft:stone` starts with `bake:`). Root cause found:
`resolve_item` resolves `textures.all` via `ITEM_FALLBACK` as a FLAT texture
BEFORE the parent chain's 3D-elements check → flat, not bake. Real vanilla
`item/stone.json` is `{"parent":"block/cube_all","textures":{"all":"block/stone"}}`
which would ALSO resolve flat — so the test's bake expectation may predate a
behavior change. DECIDE: fix the test expectation (likely correct) or the
resolver. Do NOT force it blindly — check against the actual resolver logic
(`models.rs:112-166`).

## UNCOMMITTED FILES (this session)

```
 M src-tauri/src/indexer/vanilla.rs                (delegate + versions/ union + .ftba removal)
 M src-tauri/src/instance_textures/layers.rs       (vanilla_jars → delegate)
 M src-tauri/src/instance_textures/models.rs       (PROBE eprintln — MUST REMOVE)
 M src-tauri/src/instance_textures/models/tests/resolve.rs (hermetic cube models)
 M src-tauri/src/instance_textures/tests.rs        (write_jar_multi + new test + hermetic)
```

**IMMEDIATE NEXT (before commit)**:
1. Remove the `[PROBE]` eprintln in `models.rs::resolve_bare_keys` (added for
   diagnosis).
2. Decide + fix `vanilla_jar_textures_are_indexed` expectation.
3. `cargo test` full green, `pnpm integrity` (expect only stale-binary
   violations pre-rebuild).
4. Rebuild: `cargo tauri build --no-bundle` → flatpak-builder wrap into
   `.flatpak-builder/cache` (NOT /tmp/opencode — app-origin points at the
   project repo). Verify by CONTENT MARKERS in packed binary (flatpak strips
   debuginfo — md5 will never match the release binary).
5. Live verify: open monster in fresh app → Save → cache regenerates → check
   `minecraft:item/paper` resolves (the disproof observable). Expect layer 0
   populated with the real client jar.
6. Commit + push (push IS backup).

## VERIFICATION NOTES

- The 21:20 ghost file reappearing after the fix is the GAME's own save pass
  (FTB lowercases filenames + zero-pads ids: `0100000000000003` == same long
  as `100000000000003`). Bounded ping-pong with the app prune; FTB dedupes by
  parsed long, so no visible duplicate tab. Not blocking.
- Acacia quest id changed to `00666C42F20F2B98` and is NOT in the on-disk
  export (21:14 export predates the edit) — the game loaded 6 quests at
  21:17:53, consistent with the export on disk then.

## GOTCHAS (new this session)

- `code:gotcha` flatpak-builder strips debuginfo → packed binary NEVER
  hash-matches raw release binary; verify flatpak installs by commit hash
  (`flatpak info --show-commit` vs `ostree rev-parse`) + content markers
  (`strings` for new literals), not md5. — mem_1786760610776
- The flatpak app's cache lives at `~/.var/app/com.modcanvas.app/cache/`
  (sandbox XDG_CACHE_HOME), NOT `~/.cache/modcanvas/`. All earlier
  "no cache / wrong keys" reads were looking at the wrong dir.
- Zip append corrupts archives: writing models into an existing test jar via
  `OpenOptions::append` produces a zip the reader can't see the appended
  entries in — write all entries in ONE pass (`write_jar_multi`).
- Rust raw strings: `br#"..."#` breaks on `"#` content (e.g. `"#all"`) — use
  `br##"..."##`.
- Stale-process trap still live: the 17:00 app sandbox held the Prism launch
  chain (bwrap → flatpak-spawn → prismrun) — killed bottom-up; the game java
  was detached (PPID 1) and survived, holding the old book in memory.

## NEXT SESSION HOOKS

- Finish the texture-index fix (above). Then re-check the item picker / editor
  icons — expect them to resolve once the vanilla layer populates.
- Re-reviews due: 3-layer 08-19, round-trip 08-20, delegation 08-21.
- Spine P2 row 5 (atomic writes) still parked on the student's call.
- The ghost-chapter game-save ping-pong (game rewrites lowercase+padded copy)
  is a candidate for a follow-up decision: leave (bounded) or teach the export
  to write FTB's canonical padded form.

## OWED / EXPLAIN-BACKS

- None explicitly declined this session; the fix-verification chain was walked
  live. If the student wants the flatpak-verification-by-content-markers
  method re-explained, offer it — it's the same discipline as workaround #3.
