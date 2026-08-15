# Session Handoff — s61 (2026-08-15)

## Status: friend-trial release + doc-sync debt + FIDELITY/PARITY ARC COMPLETE + one new booked parity item

## Commits pushed this session
| Commit | What |
|---|---|
| `21eb8aa` | gitignore `*.flatpak` + manifest bundle-export step documented |
| `7d0265d` | pack-health.md companion-authoritative registry trust rewrite + judge 3 doc-sync candidates |
| `df80d31` | **fix(companion): render BuiltInModel items via the game's BEWLR path — completes the item-icon parity arc** |
| `f071e3b` | engine-renders.md custom-renderer section rewritten to the BEWLR reality (same-pass doc sync) |
| `3847182` | integrity gate extended to cover the companion (stale-binary scope + doc-sync code path) |

Tag: v0.1.0. Tree clean, pushed, 0 integrity violations, 91/91 tooling tests.

## The fidelity/parity arc — DONE and verified
- 63 blank composite icons (banner/bed/shulker/chest/head/skull/conduit/shield/trident/pot = 63/1346 engine renders) were all **BuiltInModel**: empty `getQuads` → raw-quads draw skipped them → blank. `BuiltInModel.isCustomRenderer()==true`.
- **Fix (`df80d31`):** `ItemIconDrawer.drawItemDirect` branches on `model.isCustomRenderer()`; the `BuiltInModel` branch ports the game's own BEWLR dispatch — `IClientItemExtensions.of(stack).getCustomRenderer().renderByItem(...)` into a flushed `MultiBufferSource` (immediate + ByteBufferBuilder), mirroring the GUI texture state (lightmap unit2 + overlay unit1, per the s21 solid-black bug). Baked path untouched.
- **Verified live** (Monster, flatpak drain 16:12): 63/63 composites `renderByItem` flushed, 0 failed 0 skipped; potion control unchanged. **Pixel-proof**: decoded cache shows banner 439 non-transparent px/11 colors, shulker 1010/22, bed 253/14, chest 822/31 — all real (was ~23-byte solid fill).
- **Modded covered:** mods hook the same `IClientItemExtensions`, so "open any pack, complete pickers" is the outcome.

## What we built and why (one line)
The item-pickers now show a real icon for every item the game can render — composites (banner/shulker/bed/chest/head) included — because the companion's icon capture stopped guessing from `getQuads` and now delegates to the game's own renderer, exactly as your s60 forever-fix ruling required.

## Newly booked (NOT built) — FTB background render rule
Editor renders the loaded FTB background wrong (zoomed/cropped vs the game): uses CSS `cover` (canvas-shell.css:113), a window-fit rule; the game uses MAP-SPACE — background `ChapterImage` draws at `bs*width × bs*height`, `bs = zoom×1.5`, default zoom 16 → **24px/unit**. Fix = render backdrop in map-space with that rule, not `cover`. Clean-room pinned in `code:decision FTB-BACKGROUND-MAP-SPACE-S61`. Tuning: editor default viewport → 1 quest-unit = 24px. `grid_scale` only affects grid dots (clean negative, not the cause).

## GOTCHAS (resolve to real entries)
- GOTCHAS: DEPLOYER-CLOBBERS-PROBE-S61 (flatpak auto-deploys bundled jar at game launch; cp into instance always loses; probe/fix must be the BUNDLE)
- GOTCHAS: BACKFILL-RACE-REGISTRY-S59, REGISTRY-DUMP-TIMING-S59 (carried)

## DECISIONS
- DECISIONS: INTEGRITY-COMPANION-COVERAGE-S61
- DECISIONS: FTB-BACKGROUND-MAP-SPACE-S61
- DECISIONS: COMPANION-REGISTRY-S59, ICON-PICKER-LISTS-REGISTRY-S59, PARITY-IS-MVP-S60 (carried)

## Open threads
1. **Friend-trial bundle re-export** — `.flatpak` build-bundle from cache resolves to original commit `ad3809fa` not the fix `6d29d624`; local app is on the fix via `flatpak update`; the bundle FILE is not trusted to carry the parity fix. Fresh eyes needed (flatpak ref resolution).
2. **FTB background map-space render** — booked, spec pinned above (needs a build-mode session).
3. **potion_contents component-variant pickers** — booked separately (render parity done; UI is the gap).
4. Re-reviews 08-18: version-boundary, offline-first, two-source-divergence (promotion candidate), doc-sync triage (probe), atomic writes, comment preservation.
5. spine: P2 row 5 complete both halves; next index item pending.
