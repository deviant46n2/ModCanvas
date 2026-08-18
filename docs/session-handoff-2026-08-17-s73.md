# Session Handoff — 2026-08-17 (s73)

## What we built and why
B1 of the s72 Loot MVP re-scope is COMPLETE end-to-end: the Loot tab now
surfaces the vanilla game jar's tables for zero-mod packs and lets any
read-only jar table be copied into the pack's `data/` to become editable.
The backend shipped s72 (scan order + copy command + shared write tail);
this window wired the UI onto it and paid the debt the backend created.

## Commits this session (all pushed)
- `cded070` feat(loot): B1 frontend wiring — vanilla badge + copy-to-pack (s73)
- `6963e62` refactor(loot): extract create/pack_scan tests to sibling modules (s73)
- `c34a7ca` chore(integrity): judge 7eea231 doc-sync (B1, s73)

## What B1's UI wiring does (the s72 in-flight list, all four items)
1. `instancePath` prop — ProjectWorkspace passes `project.path` (IS the
   instance's `minecraft` dir for Prism projects, lifecycle.rs:90-98; same
   path the texture/engine pipeline already treats as the instance path,
   app-state-utils.ts:73). `find_vanilla_jars` degrades gracefully to
   nothing for non-instance paths (mrpack imports) — never wrong data.
2. Vanilla badge — `· vanilla` vs `· jar` on non-editable rows (LootTab).
3. Copy-to-pack button on the read-only detail pane → `copyLootTableToPack`
   → `refresh()` → select + open the copied editable row; errors surface
   (no-clobber refusal included).
4. B1 docs: docs/loot-editor.md "Vanilla surfacing + copy-to-pack (B1, s72)"
   section (scan order, dedupe rule, shared write tail). Empty-state copy
   fixed to mention the vanilla jar.

## Tests
- NEW `frontend/src/components/loot/LootTab.test.tsx` — loot's FIRST
  component tests (5): instance-path threading into the hook, vanilla-vs-jar
  badges, source note, copy flow (calls copy with the jar descriptor +
  adapter dir, refreshes, opens the copied row), failure surfacing. Mocked
  hooks + services, real adapter matrix (ModsTab precedent).
- Rust: B1's 5 scan/copy tests unchanged, now at
  `loot::create_tests::*` / `loot::pack_scan_tests::*` after the split.

## Student rulings (both this session, both decisive)
1. **Split the line-limit candidates NOW** — B1 grew create.rs 215→376 and
   pack_scan.rs 235→340 (mostly the new I/O-command tests). Chose to PAY the
   tripwire on a touching change rather than park: tests extracted to
   create_tests.rs / pack_scan_tests.rs, declared in loot/mod.rs (the indexer
   `tests.rs` precedent). Imports flipped from `use super::*` to
   `use crate::loot::{create, pack_scan}::*` because the module moved up a
   level (super became `loot`, not the source file). Production code now
   141/193 lines; 483 Rust tests unchanged.
2. **Judge 7eea231 doc-sync paid** — B1 shipped doc-less s72; the doc landed
   this window. Judgment entry in scripts/doc-sync-judgments.json (the DATA
   file — integrity-rules.mjs defaults are inert while the JSON exists, the
   s32 lesson). Candidate now reports as INFO.

## Verification state
- 483 Rust + 784 FE green (B1 arc +5 Rust from s72, +5 FE from this window).
- tsc --noEmit clean (caught a real mock type error: getTextureUrl returns
  string|null, not undefined). pnpm lint: pre-existing warnings only.
- git diff --check clean (EOF blank lines from the split surgery fixed).
- Integrity: **0 violations, 0 candidates** — both line-limit candidates
  resolved by the split; stale-binary green after rebuilding BOTH binaries
  after every src touch (dev + release, mtime-verified); 7eea231 judged.
- Release bundles: AppImage + deb built via `NO_STRIP=1 pnpm build` (the
  documented release invocation — plain `pnpm build` dies at linuxdeploy;
  now workarounds row 15).
- **NOT done: live observation.** No app launch this window. The Loot tab's
  behavior is test-proven, not pixel-proven: launch `pnpm dev`, open a pack
  with an instance, expect `minecraft:` tables badged `· vanilla`, copy one
  → it opens editable. Student task, next window.

## Parked / queued (written reasons in place)
- **A direction (curated mod pointers)** — roadmap queue row 9, NOT started;
  queued after B1. Content + small panel reusing the wizard's curated
  machinery (CuratedModsStep, curated.rs).
- P3-WORLDGEN editor (s72 ruling, what's-possible note in roadmap §13).
- Tauri `tauri::test` harness scoping — background-queue.md.
- Fresh-eyes completion pass — s65 ruling, stays open.
- NO_STRIP=1 → workarounds row 15, resolved-not-debt.

## Teaching notes
- **Tripwire paid, not parked:** the student chose split-over-park on a
  touching change — the exact behavior AGENTS.md's tripwire rule asks for.
  Debt-triage judgment evidence; support stays prompted→verify-only.
- **The doc-sync judgment mechanism** was learned the hard way this session
  (judgment in the wrong file first — the .mjs default is inert): judgments
  are DATA in scripts/doc-sync-judgments.json; integrity-rules.json overlays
  the .mjs defaults.
- **Module-resolution gotcha taught live:** a `mod` declared inside
  `create.rs` resolves to `loot/create/…`, not `loot/…` — the decl must live
  in mod.rs for a flat sibling file. And `use super::*` changes meaning when
  the test module moves up a level.
- **NO_STRIP=1 discovery** — the plain build's linuxdeploy failure is the
  documented invocation mismatch, not a regression.
- Re-reviews due next window (six items): version-boundary; offline-first;
  doc-sync triage (resolved s69); atomic writes; comment preservation;
  two-source divergence promotion confirm (s68b evidence strongest).
- Owed explain-backs carried: s64 fidelity, s65 CI, s66 ws_ipc, s66
  featureparity, s67 phantom arc, s68 palette+distinct-sources, s68b
  availability, **s72 B1 (dedupe-order + shared write-tail)** — offered at
  the boundary, invitation-only, still pending.