# Session Handoff — 2026-08-13 (s52: the critical product intervention)

Branch `master`. Tree is clean; all work committed and pushed (`9e09a5a..9d6f97f`).

## WHAT WE BUILT (one line)

The critical product/engineering intervention ran end-to-end — a 10-phase audit
found the roadmap's current-state sections describing a pre-s42 tree and the
beginner surface hiding code instead of guiding; 10 maintainer rulings then
removed ~4,400 lines of dead code, corrected every stale claim, and the
governing docs now declare the consolidation/validation posture.

## DONE

- `c670f66` — docs(roadmap): Loot row "editor not built" → Implemented (s47); Pack
  Health citation `index.ts:77` → `:128`. First stale-claim catch of the audit.
- `b539f5b` — docs(roadmap): all 6 hot-swap "frozen" sites corrected (quest+kubejs
  live s42–s44, evidence-gated); §3.4 items 4/6/8/9/10 rewritten to measured
  current state; `reactflow` ^11.11.4 removed (dead dep, 733→697 tests after the
  later prunes; build clean).
- `779156d` — docs(audit): `docs/CRITICAL_PRODUCT_AUDIT.md` (A–M structure, 15
  findings, file:line evidence) + `docs/CRITICAL_PRODUCT_ACTION_PLAN.md` (ranked
  queue, anti-overcorrection). Roadmap §3.5 cross-links them.
- `aff5c18` — refactor: maintainer rulings executed.
  - #5 SyncPipeline + FileWatcher + core/sync/types.ts removed (never constructed;
    reload live via `services/hotswap.ts`). `loop-guard.ts` trimmed to
    `formatSyncEvent` (sole live export). 3 dead test files dropped.
  - #7 protocol dead items removed: PING/PONG consts + fixture, `ws-ipc:status`
    Tauri emit, CLIENT_INFO replay machinery (field, cache, replay fn, threading).
    Live handshake forward kept. RELOAD_ALL (Java) staged for companion session.
  - #9 `quest/analysis.rs` pruned: dead-end command (registered, zero consumers,
    zero tests) + QuestAnalysis struct + wrapper + type.
  - #10 `frontend/package-lock.json` removed (stale npm lockfile, pnpm project).
  - #14 `useBehaviorItemPicker` adapter hardcode → real resolution (version/loader
    threaded from workspace through BehaviorTab/LootTab).
  - Verified: cargo test 453 pass, FE 697 pass (83 files), tsc+vite clean,
    integrity 0 violations (debug rebuilt).
- `b9f22b7` — docs(audit): rulings recorded in the audit's findings ledger; the
  5 OPEN-but-booked items named with written reasons.
- `9d6f97f` — docs(governance): post-intervention posture.
  - AGENTS.md: new "Development Posture" section (consolidation/validation,
    product-first criterion, evidence-backed deletion, no-meta-engineering,
    deferred list). Line-count rule → heuristic (soft 300 / hard 600, written
    appeal path).
  - ROADMAP: new §0 "Current Development Posture" — directed maintenance queue
    (Pack Health wire / Beginner Mode redesign / fixtures / companion tests) with
    rationales + deferred-expansion list. §1 bezier → dependency curves.
  - BIBLE: §5.6 "Consolidation is legitimate progress"; stale bezier reference.
  - README: Status corrected from "early dev / hot-swap focus" to the actual
    posture + queue.
  - integrity gate: `lineLimitHard` (600); 300–600 → candidates requiring a
    written reason; only >600 fails. Tests updated to new semantics.
  - Verified: 91 tool tests pass, integrity clean (suite-self passes its own
    gate), no source/dependency changes.

## DECISIONS (memory pointers)

- The 300-line rule is a heuristic, not a law — soft 300/hard 600, changed in
  both doc AND gate so they agree. [code:decision: s52 LINE-LIMIT-HEURISTIC]
- SyncPipeline/FileWatcher dead layer removed — "the re-enable path" claim was
  built on the freeze myth; reload is live via hotswap.ts. [code:decision: s52
  SYNC-LAYER-DEAD]
- Audit arc division of labor: tutor reads, student grades; student's code-reading
  veto is load-bearing. [code:decision: s52 AUDIT-ARC-DIVISION-OF-LABOR]

## GOTCHAS (memory pointers)

- A "re-verified 2026-08-13" stamp covered §3.2/3.3/3.5 but NOT §3.4 — the one
  section whose job is current-state truth; 4 stale items survived it.
  [code:gotcha: s52 stale-doc-survives-verification-stamp]
- Registered + wrapped ≠ live: analyze_quest_graph was registered, wrapped, and
  called by nobody. Trace consumers before believing a surface runs.
  [code:gotcha: s52 registered-command-is-not-a-live-command]
- Beginner Mode gates exactly 2 of 7 editors — it hides code, it does not guide;
  the quest editor never sees the flag. [code:gotcha: s52
  beginner-mode-is-code-hiding-not-guiding]

## NEXT

- Directed maintenance queue (roadmap §0, in priority order):
  1. Pack Health: wire the `target` jump-to-quest (finding #8 — payload exists,
     `types.ts:16-19`, never read; add the consumer + test). The student's first
     M1/M2 rehearsal item.
  2. Beginner Mode redesign (ruled REDESIGN — product call first).
  3. Real-pack fixture suite (deferred to next milestone — golden artifact).
  4. Companion/Java test investment (deferred with written reason).
- RELOAD_ALL Java removal staged — companion session (s14 loop: gradle build →
  deploy → md5 verify → full game restart).
- Spine: P2 row 5 atomic writes (next index item). Re-reviews 08-19 (3-layer),
  08-20 (round-trip). CF dummy-key test due 08-15.

## Environment reminders

- `pnpm integrity` shows only the expected release-binary staleness (clears on
  next `pnpm build`; debug binary is current).
- Full audit evidence + ruling ledger live in `.tutor/audit-arc.md` (private);
  the audit deliverables are `docs/CRITICAL_PRODUCT_AUDIT.md` + `_ACTION_PLAN.md`.
