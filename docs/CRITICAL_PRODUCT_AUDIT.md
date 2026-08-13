# Critical Product Audit — 2026-08-13 (s52)

> Method: the audit loop — every roadmap claim extracted into checkable clauses,
> each anchored to code actually read (file:line), graded VERIFIED / PARTIAL /
> STALE / PHANTOM, severity only on failure (truth ≠ harm). No doc claim was
> trusted; every cited anchor was verified against the tree. Rulings the
> maintainer has not yet made are marked **OPEN** — a ruling is a judgment, and
> no judgment was made for the student. Findings marked **FIXED** were corrected
> this pass (evidence in §13).

## Verdict

The product's **code is in better shape than its documentation claims**. The
roadmap's current-state sections (§3.2/§3.4) carry stale claims describing a
pre-s42 tree — the "editor not built" lie, the "hot-swap frozen" myth (six
sites), a 300-line roster of files that no longer exist, and a "real
functional bug" that was already fixed. The verification stamp ("re-verified
2026-08-13") covered §3.2/3.3/3.5 but **not §3.4** — the section that needed
it most. The test suite is unit-strong and integration-absent: 733 tests pass
with **no real-pack fixture and zero e2e specs** in the repo. The beginner
surface is the sharpest product gap: Beginner Mode gates 2 of 7 editors and
does not guide.

---

## A. What is genuinely strong

1. **Honest failure modes in the companion protocol.** Every reload failure is
   deliberate: zero-delivered peers short-circuit `{status:'no-companion'}`
   before any claim (`hotswap.ts:56-60`); log rotation mid-verify reports
   "inconclusive", never PASS/FAIL (`commands/hotswap.rs:107-113`); no success
   toasts by design. Evidence-gate discipline (s42–s44) is real code, not
   roadmap prose. Severity: none — this is the standard.
2. **Pack Health's pure-derivation contract.** No I/O, no IPC, no on-demand
   rescan (`pack-health/index.ts:1-3`, imports only `./checks/*`); go/no-go is
   one line (`:192`). Sub-ms, testable, honest. Severity: none.
3. **Atomic-write discipline** in the save paths that matter: history journal
   (`commands/history.rs:23-25`), CF export (`export.rs:83`), loot editor
   ("verbatim atomic save", §13 P3-LOOT). The repo's own rule, applied where
   corruption would hurt users.
4. **The maintainer tooling obeys its own rules.** The integrity suite is
   self-tested (9 test files), self-limited (`integrity-rules.mjs:3` — split
   when it tripped its own 300-line rule), and its 9 gates cover real failure
   classes this audit independently confirmed. Severity: none.
5. **Self-auditing documentation culture.** The roadmap discloses its audit
   basis (`MODCANVAS_ROADMAP.md:8-10`), §3.5 keeps a fixed-items ledger, and
   the docs audit habit is real. The failure is in *scope* of verification,
   not intent. Severity: none.

## B. What is unnecessarily complicated

1. **The `core/sync/*` layer carries a dead class.** `SyncPipeline` is exported
   (`core/sync/index.ts:2`) and never constructed anywhere in the app; its
   `getAdapter` call (`sync-pipeline.ts:92`) can never run. `FileWatcher` and
   `QUESTS_RELOADED_IN_GAME` have no production consumer. The roadmap calls it
   "the re-enable path, not dead weight" (§14.3) — but the reload path it was
   supposed to re-enable is already live via `services/hotswap.ts`. The layer
   is either dead weight or a duplicate path. Severity: **P2** (maintenance
   burden with zero runtime consumers). Ruling: **OPEN** — remove, or keep
   with a written reason that survives the freeze-myth.

## C. Systems existing primarily because they were technically interesting

1. **The render pipeline is justified, not overbuild.** ItemIconDrawer /
   BatchCapture (GL state, offscreen FBO) is the only offline path to 3D icons
   and is required. Not a finding.
2. **`AssetExporter.reset()`** (`AssetExporter.java:150-152`) — declared, zero
   callers, `ASSETS_READY` fires once per JVM by design. Minor dead surface.
   Severity: P3.
3. **CLIENT_INFO replay machinery** (`ws_ipc.rs:202-212`) — hub caches
   companion identity and replays to late app peers; no frontend consumer reads
   the replayed frame. Severity: P3. Ruling: **OPEN**.

## D. Systems creating maintenance burden without delivering user value

1. **`reactflow` ^11.11.4** — dead dependency, zero imports, superseded by
   `@xyflow/react` v12 (21 imports). **FIXED** — removed this pass, 733 tests
   pass. Severity was P3.
2. **`quest/analysis.rs` dead-end command** — `analyze_quest_graph` registered
   (`lib.rs:191`), wrapped in a service (`services/quest.ts:13`), called by
   **no frontend consumer**, zero tests. Stronger than the roadmap's
   "duplicate of frontend health" — it's an unexercised IPC surface. Severity:
   **P2**. Ruling: **OPEN** — wire a consumer or prune the command.
3. **Protocol dead items** — PING/PONG (defined `ws_protocol.rs:18-19`, never
   sent by any peer), RELOAD_ALL (exists only in the Java switch
   `WorkbenchEventHandler.java:256-264`, not in the protocol consts),
   `ws-ipc:status` Tauri event (emitted `ws_ipc.rs:195`, explicitly "no longer
   the source of truth", no listener). Severity: P3. Ruling: **OPEN**.
4. **`frontend/package-lock.json` (npm) is stale** and disagrees with
   `pnpm-lock.yaml` in a pnpm-workflow project — competing lockfile
   generations. Severity: P3. Ruling: **OPEN**.

## E. Transitional architecture

1. **`core/sync/` is a transitional layer that never transitioned.** Built as
   the hot-swap re-enable path; hot-swap came live via a different route
   (`hotswap.ts`). The layer's documentation still describes it as dormant
   while the freeze is gone. See B1. Severity: P2.

## F. Duplicated parts

1. **Lockfile generations** — npm `package-lock.json` + pnpm `pnpm-lock.yaml`
   both tracked. See D4.
2. **Rust `quest/analysis.rs` vs frontend `analyzePackHealth`** — structural
   quest analysis exists in both stacks; the Rust copy has no consumer. See D2.

## G. Over-abstracted parts

1. **No confirmed finding.** The adapter matrix (`getAdapter`/`getAdapterEntry`/
   `resolveAdapter` split) has a documented purpose: distinguishing safe
   loader-miss from dangerous cross-version fallback (`support.ts:1-14`). The
   one smell — `useBehaviorItemPicker.ts:27` hardcoding
   `getAdapter('1.21.1','neoforge')` — bypasses the matrix it should trust.
   Severity: P3 (resolves identically today — the kubejs namespace is a
   matrix-wide constant `defaults.ts:23-24`; latent leak if a future adapter
   differs). Ruling: **OPEN**.

## H. Under-tested parts

1. **No real-pack fixture exists.** The round-trip suite proves import→export
   of *authored* SNBT; it cannot catch "real FTB pack shape breaks our
   parser" — the exact class of bug the s42 export-layout fix was about. Zero
   e2e specs. Severity: **P1** (trust model: correct artifacts are the product).
   Ruling: **OPEN** — golden-artifact fixture suite (proposal in action plan).
2. **`companion-socket.ts` has no test file** — the bridge's entry surface
   (connect, reconnect backoff 2s→15s, frame parsing, status fan-out) is
   untested, and the Java companion has no JVM test tree. Severity: **P2**.
   Ruling: **OPEN**.
3. **Live-socket path untested** — ws_ipc routing is tested (16 fns, pure
   predicates) but broadcast-counting, connection lifecycle, and emit-status
   have no integration test. Severity: P3.

## I. Where a beginner could plausibly become confused

1. **Beginner Mode gates 2 of 7 editors.** The flag reaches RecipeEditor
   (`RecipeEditor.tsx:96,223` — hides script preview) and ConfigsTab
   (`:42,110,198` — forces structured). It never reaches QuestBookEditor —
   the surface a first-timer actually uses — nor Loot, Behaviors, or Mods.
   The roadmap's "gated per-surface, not per-mode" (roadmap:143) is generous:
   it's per-*two*-surfaces, the two code-shaped ones. **The mode hides code;
   it does not guide.** Severity: **P1/P2** (the intervention's risk #4,
   named). Ruling: **OPEN**.
2. **Pack Health findings don't take you to the fix.** Every quest finding
   carries `target: {section, nodeId}` (`types.ts:16-19`) populated by
   structure.ts/items.ts — and no consumer reads it (zero hits in
   PackHealthTab/PackHealthProvider). "Quest X is unreachable" shows the
   message but no jump-to-quest. The "what can I do" link is modeled and
   unwired. Severity: P3 (dead payload now; P2-class for the beginner journey).
   Ruling: **OPEN**.

## J. Where the product drifts from the stated mission

1. **The intervention's risk #4, evidenced:** a person with zero modpack
   experience doesn't get a guided journey from the mode — they get two
   editors with code hidden. The wizard (intro template) is the only real
   guidance and it's separate from the mode. See I1. Severity: P1/P2.

## K. Roadmap items to explicitly DEFER

Ruling: **OPEN** — draft below is the prompt's own default list checked
against this audit's evidence; each row is a candidate, confirmation is the
maintainer's.

| Item | Evidence | Candidate status |
|---|---|---|
| Additional FTB Quests parity work | Near-full parity tracked in §13 P1-PARITY | DEFER unless a parity gap breaks the wedge |
| Additional MC version support | Major-only policy already written (AGENTS.md); minor versions resolve to default + banner | DEFER (scope decision made s51) |
| Generalized behavior-system expansion | Behaviors tab exists; risk of scope creep | DEFER |
| Additional companion capabilities | Live protocol is lean and sufficient; dormant items are deferred already | DEFER |
| Sophisticated hot-swap expansion | Quest+kubejs live; config/CT disabled with reason | DEFER |
| AI features | Offline-first mandate; MCP-only | DEFER |
| Major rendering expansion | Render pipeline justified, not overbuild | DEFER |
| Additional maintainer tooling | 3,065 lines exists; gate already found its limit (see M2) | DEFER |
| Large architectural rewrites | Nothing this audit found requires one | DEFER |

## L. Existing features to freeze rather than expand

| Feature | Reason | Candidate status |
|---|---|---|
| Companion protocol surface | Minimum stable capability is small, lean, honest | FREEZE (only evidence-gated reloads ship) |
| Adapter matrix scope | Major-only is the written policy | FREEZE |
| Beginner Mode | Needs a product decision, not expansion | FREEZE until ruled (I1) |
| Pack Health check set | "Understandable diagnosis, not maximum checks" | FREEZE; add relationships, not checks |

## M. Problems blocking the product from becoming useful

1. **No real-pack end-to-end validation** (H1) — the trust model is
   unit-proven, integration-unproven. Severity: P1.
2. **The doc-sync gate measures anchors, not truth.** Every stale row found in
   this audit (Loot, hot-swap, §3.4, texture-loader citation) is
   semantically-wrong-but-anchor-correct — the gate verifies `file:line`
   resolves, not that the claim is true. The governance was watching the wrong
   layer, and the human audit (2026-08-13 docs audit) missed §3.4 entirely.
   Severity: **P2**. Ruling: **OPEN** (fix is the §3.4 rewrite — DONE — plus
   making current-state rows re-verifiable, not a new tool).
3. **Beginner Mode's narrow gating** (I1) — the product's own wedge for
   beginners doesn't reach the surfaces beginners use. Severity: P1/P2.

---

## Findings ledger (all findings, consolidated)

| # | Finding | Class | Severity | Ruling |
|---|---|---|---|---|
| 1 | Loot row "editor not built" (roadmap:129 vs :1294) | Doc drift | P2 | **FIXED** (c670f66) |
| 2 | Hot-swap freeze myth, 6 sites | Doc drift | P2 | **FIXED** (b539f5b) |
| 3 | §3.4 roster (4 stale items) | Doc drift | P2 | **FIXED** (b539f5b) |
| 4 | texture-loader.ts:164 dead citation | Doc drift | P3 | **FIXED** (b539f5b) |
| 5 | SyncPipeline dead class | Dead code | P2 | OPEN |
| 6 | reactflow dead dependency | Dead code | P3 | **FIXED** (b539f5b) |
| 7 | Protocol dead items (PING/PONG, RELOAD_ALL, replay, ws-ipc:status) | Dead code | P3 | OPEN |
| 8 | Pack Health target dead payload | Dead payload | P3 | OPEN |
| 9 | quest/analysis.rs dead-end command | Dead code | P2 | OPEN |
| 10 | npm lockfile stale + competing | Duplication | P3 | OPEN |
| 11 | Beginner Mode gates 2/7 | Product | P1/P2 | OPEN |
| 12 | No real-pack fixture, zero e2e | Testing | P1 | OPEN |
| 13 | companion-socket.ts + Java zero tests | Testing | P2 | OPEN |
| 14 | useBehaviorItemPicker hardcoded adapter | Over-abstraction smell | P3 | OPEN |
| 15 | Doc-sync gate verifies anchors not truth | Governance | P2 | OPEN |

## Problems discovered but NOT fixed (prompt done-definition #10)

All OPEN-ruled findings above (§5,7,8,9,10,11,12,13,14,15) plus: the stale npm
lockfile (10), the missing jump-to-quest (8), the untested bridge surface (13).
Each has evidence and a recommended action in its section; none was changed
because each requires a maintainer ruling — judgment was not made for the
student.

---

## What was fixed this pass

Commit `c670f66`: Pack Health citation (index.ts:77→128), Loot row aligned
with §13 P3-LOOT.
Commit `b539f5b`: all 6 hot-swap stale sites; §3.4 items 4/6/8/9/10 rewritten
to measured current state; §5.1/§14.3/risk-table/§13 class-line corrected;
`reactflow` ^11.11.4 removed (733 tests pass, build clean, integrity 0
violations). The repo is more truthful than it was this morning.
