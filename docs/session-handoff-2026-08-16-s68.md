# Session Handoff — s68 (2026-08-16)

## Status: P1-PACKINDEX FULLY CLOSED (both consumers shipped + the student caught and fixed a truthfulness bug in the first consumer's successor). 3 commits pushed, tree clean, integrity 0, release binary rebuilt.

## Commits pushed this session
| Commit | What |
|---|---|
| `06806d9` | feat(agents): add advisor agent — read-only architectural steward, evidence-graded output (FACT/INFERENCE/RECOMMENDATION + confidence + falsification handle), `edit: deny` in frontmatter, bash allowlist is read-only investigation. Runs on kimi-k3 (model diversity from deepseek-v4-flash). The s67 loose end, committed on student's call |
| `906ec9d` | feat(recipe-editor): pack-index "where is this used" footer on palette hover — the completion criterion's recipe-editor half. Pure `usageSummaryText` helper (first TESTED instance of the pattern), ItemBrowser gains optional `usageByItem` prop (only the palette passes it; other 4 consumers untouched), freshness via `usageRefreshKey` bumped on save/disable/reload (the 3 disk mutations; import deliberately does NOT bump — recipes reach disk only on Save) |
| `8a98921` | fix(pack-index): usage footer counts DISTINCT sources, not references — **STUDENT-CAUGHT truthfulness bug**: a shaped recipe with the item in two slots emitted two references (same source_id, `invert.rs:8-23` keeps duplicates by design) and the footer said "Used in 2 recipes". Fixed: `itemUsageByItem` dedups by (source_kind, source_id) per item; the icon picker's INLINE count loop was refactored onto the shared helper so both consumers share one count path. Tests re-locked (duplicate-slot → 1 recipe, distinct → 2, tags/quests dedup too) |

Tree clean at `8a98921`, pushed, integrity 0, release binary rebuilt + mtime-verified (stale-binary gate caught the unbuilt binary mid-arc, twice today). AppImage bundling still fails on missing `linuxdeploy` (pre-existing env gap, unrelated; the binary is what the gate checks).

## What we built and why (one line)
Finished P1-PACKINDEX's completion criterion — "where is this used" now resolves in BOTH the item picker (s67) and the recipe editor (s68) — and then the student caught that the new footer counted references, not recipes, prescribing the fix ("dedupe in the shared helper so the icon picker and recipe palette agree") with file:line receipts for all three claims, which is the strongest promotion evidence yet for the two-source-divergence concept.

## The arc in detail

### 1. Advisor agent committed (`06806d9`)
- The s67 loose end: `.opencode/agent/advisor.md` + `docs/advisor-agent.md` + `docs/tutor-agent.md` (loop: propose → advisor review → implement → tutor explain-back). Read-only by construction (`edit: deny`; bash allowlist = git log/show/diff/blame, rg/grep/cat, `pnpm integrity`). Evidence hierarchy: current implementation > tests > git state > history > explicit decisions > docs > roadmap > memory > inference. Deliberately on kimi-k3 — different model, different blind spots from the deepseek-v4-flash tutor/generalist. Student's call to commit it now, separate from feature work — done cleanly.
- One architectural principle baked in: "a roadmap item is not authorization to implement it" (advisor flags requirements-vs-speculation against bible + roadmap).

### 2. Recipe-editor consumer (`906ec9d`) — P1-PACKINDEX completion criterion met
- **The seam:** the recipe editor already had a recipe-only "⇄ recipes using this" filter (`RecipeEditor.tsx:140` → explorer query `>item`/`#tag`) — editor-native, pack-index-free, kept. What was missing: the pack-index usage-count footer (recipe/quest/tag counts) on recipe-editor item surfaces.
- **Surface chosen (student ruled A):** palette `ItemBrowser` hover tooltip — the icon-picker mirror. `ItemBrowser` gained an OPTIONAL `usageByItem` prop; only the palette passes it, so the other 4 consumers (pickers, loot, behavior) are structurally untouched.
- **Pure-first:** `usageSummaryText` added to `core/pack-index/item-usage.ts` (3 tests) — the icon-picker footer copy extracted. This consumer is the first TESTED instance of the pattern (the icon picker still inlined its counting — until 8a98921).
- **Freshness with honest boundaries:** `usageRefreshKey` bumps only on save/disable/reload — the three mutations that change the pack on DISK. Import deliberately does not bump (imported recipes reach the pack only on Save). The save bump awaits the async write (`await saveRecipes`) so it never reads the pre-save index. Disable bump is a superset (only kubejs/ct disable writes to disk immediately; authored/vanilla toggle store-only until Save — one rebuild per deliberate action is cheap).
- **Degrade contract:** fetch failure → no footer, never blocks (the icon-picker pattern).
- **Tripwire ruling (student):** `RecipeEditor.tsx` line-limit PARKED entry re-parked at 327 lines (was 305) with the trigger moved to **400** — the first NUMERIC line-trigger ruling. The entry carries the coordinator/cohesion rationale + the exact seams to extract (script-preview-pref + usage-refresh hooks).

### 3. The student-caught truthfulness bug (`8a98921`) — the session's real event
- **The catch:** hovering an item in the palette said "Used in 2 recipes" when one shaped recipe listed the item in two slots. The student produced receipts for ALL THREE claims: the test I'd written locking reference-counting (`item-usage.test.ts:29`), the formatter presenting it as a recipe count (`item-usage.ts:52`), and the Rust index preserving duplicates by design (`invert.rs:8`).
- **The prescription (verbatim spirit):** "deduplicate by (source_kind, source_id) per item before producing display counts. Apply it to the shared helper so the icon picker and recipe palette agree. This is a user-facing truthfulness issue, not merely wording."
- **The fix:** `itemUsageByItem` dedups via a per-item seen-set of `kind:source_id` keys. The Rust index is UNTOUCHED (duplicates are correct there — forward-reference store, dead-reference audit wants every occurrence). The icon picker's inline loop was refactored onto the shared helper — one count path, one truth. Tests re-locked: duplicate-slot → 1 recipe; distinct recipes → 2; tags/quests dedup too. 760 FE green.
- **Why this matters for the arc:** this is the two-source-divergence rule stated correctly in a NEW context (display logic, not data stores) — "two code paths computing one fact must share one path" — unprompted, with evidence discipline. Recorded as the strongest promotion evidence yet; re-review probe at 08-18: "duplicate references in the index (fine) vs duplicated counting logic (drift)".

## Roadmap state after s68
- **P1-PACKINDEX: CLOSED.** Completion criterion met in BOTH consumers (item picker s67 + recipe editor s68). Dead-reference audit, determinism, tags, all-legs coverage all locked (s67).
- **P1-PARITY: CLOSED** (s67). **P1-HEALTH-2:** topology DONE (s44); the availability half is parked "pending PACKINDEX" — **dependency now fully satisfied, unblocked.**
- **P2-BEHAVIOR:** chunks 1-7 DONE; remaining = in-game verification of the new vocabulary (verify task, not build).
- **P0-DISTRIB:** CI landed s65; release-artifacts pipeline still absent (roadmap §3.3 line 196 still says "No CI" — STALE, fix at 08-18 triage).

## Owed explain-backs (invitation-only, never forced)
- s64 fidelity implementation (pending, carried)
- s65 CI fixes (pending, carried)
- s66 ws_ipc extraction (offered, not owed unless invited)
- s66 featureparity migration (offered, not owed unless invited)
- s67 phantom-recognition arc (offered, not owed unless invited)
- s68 palette consumer + the distinct-sources fix ("why dedup at the display layer, not in invert.rs" — the disk-vs-buffer and store-vs-display distinctions; NEW, offered, not owed unless invited)

## Re-review calendar
- **08-18:** version-boundary correctness; offline-first (s59 companion-authoritative ruling is re-examination material); **two-source divergence — PROMOTION CONFIRMATION: the phantom pattern (s67, 4x unprompted) generalized at s68 to a NEW context (display logic) with the student's own shared-helper prescription + full evidence chain — probe "index duplicates (fine) vs duplicated logic (drift)"**; **doc-sync triage (probe — candidates: 0687e3a, 5d75d75, 931d7a1 + roadmap §3.3 line 196 "No CI" — fix spec in memory: split the row, CI exists s65, release pipeline still absent); atomic writes; comment preservation.**
- 08-19: 3-layer rule; 08-20: round-trip + CI/verification matrix; 08-21: delegation; 08-24: staleness.
- Spine: comment preservation (P2 row 5, second half) — parked on student's call. No deliberate index work this session (build arc); doc-sync triage probe STILL owed from s67.

## Booked / parked
- Tutorial readability pass (journey-test remainder — student's own in-app walk, no tester needed).
- Friend-bundle `.flatpak` re-export (s61 loose end).
- **P1-HEALTH-2 availability half (UNBLOCKED — the parked reason was "needs PACKINDEX consumer plumbing", now shipped twice).** The hard part: quest→item→recipe availability via the index + full objective model.
- P2-BEHAVIOR in-game vocabulary verification.
- P1-HYGIENE remaining: 300-line splits; HOCON parser arm or drop the docs claim.
- P0-DISTRIB: release-artifacts pipeline (CI done).

## Next session start ritual
1. Read profile + tutor: memories; read this handoff.
2. **08-18 re-reviews are due** (six items; doc-sync triage has four candidates incl. the "No CI" row — all fix-specs recorded in memory; two-source divergence promotion to confirm).
3. If build work instead: **P1-HEALTH-2 availability (unblocked — the roadmap's own parked reason is now void)**, or P2-BEHAVIOR in-game verify.
4. Tree is clean — no loose ends. The AppImage/linuxdeploy bundling gap is pre-existing and parked (not this arc's).
