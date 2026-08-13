# Critical Product Action Plan — 2026-08-13 (s52)

> Companion to `docs/CRITICAL_PRODUCT_AUDIT.md`. Ranks the audit's findings by
> user value / risk reduction / architectural simplification / confidence /
> implementation cost, then selects only the highest-value changes that can be
> safely implemented now. **Nothing here is a commitment** — each row's ruling
> is the maintainer's, and the audit's own anti-overcorrection rule binds:
> no feature added to appear more complete, no deletion without evidence, no
> rewrite for aesthetics.

## Ranking (all candidates)

| Rank | Change | User value | Risk red. | Arch. simp. | Confidence | Cost | Ruling |
|---|---|---|---|---|---|---|---|
| 1 | **Golden-artifact fixture suite** (one captured real pack → import → mutate → export → re-import) | High (correct artifacts are the product) | **High** (P1 trust gap) | Low | High (pattern proven: `parse.rs:47-49` loot-crate capture) | Medium (new tests, no product change) | **OPEN** |
| 2 | **Wire Pack Health `target` → jump-to-quest** (finding I2/8) | High (beginner: finding takes you to the fix) | Medium | Low | High (payload exists, one consumer to add) | Small | **OPEN** |
| 3 | **Prune `quest/analysis.rs` dead-end command** (D2) | None direct | Low | **High** (unexercised IPC surface removed) | High (grep-proven zero consumers) | Small | **OPEN** |
| 4 | **SyncPipeline/FileWatcher ruling** — remove or keep-with-reason (B1) | None direct | Low | High | High (never constructed) | Medium (tested code — must move tests or justify) | **OPEN** |
| 5 | **Remove stale npm `package-lock.json`** (D4) | None | Low | Medium | High | Trivial | **OPEN** |
| 6 | **Remove protocol dead items** PING/PONG, RELOAD_ALL, replay, ws-ipc:status (D3) | None | Low | Medium | High (never sent) | Small (wire-contract touch — companion restart) | **OPEN** |
| 7 | **`useBehaviorItemPicker` hardcode → resolveAdapter** (G1) | None | Low (latent) | Low | High | Trivial | **OPEN** |
| 8 | **Beginner Mode product decision** (I1/J1) | **Highest** (the wedge) | Medium | Medium | Medium (needs a product call, not a code call) | Medium–High | **STRIP SHIPPED (s53, partial)** — product call ruled (s52, REDESIGN): the mode becomes a coach. First iteration: the hint strip (`docs/beginner-mode.md`). Driver + preset forms parked with written reasons. |
| 9 | **companion-socket.ts + Java test investment** (H2) | Low direct | Medium | Low | Medium | Medium | **OPEN** |
| 10 | **Doc-sync semantic check** (M2) | None | Medium | Low | Low (semantic truth is hard to automate) | High | **OPEN — likely rejected** |

## Selected for now (safe, evidence-complete, no new judgment)

These are the fixes that are **mechanical and already ruled by evidence** —
the audit loop graded them, the intervention's Phase 10 bar is met, and no
product judgment is required:

1. ~~Loot row + Pack Health citation~~ — **DONE** (`c670f66`)
2. ~~Hot-swap stale sites + §3.4 roster + texture-loader citation~~ —
   **DONE** (`b539f5b`)
3. ~~reactflow removal~~ — **DONE** (`b539f5b`, 733 tests pass)

**Nothing further is selected without a ruling.** Rows 1–8 above are the
candidate queue; each is a ruling, not a task. The audit's own principle
applies: "If the correct conclusion is 'do not implement this yet', that is a
successful result." Rows 9–10 are likely deferred regardless of rulings.

## What the beginner wedge needs before anything else (Phase 2 finding)

The highest-leverage *product* work is the Beginner Mode decision (rank 8) —
but it is a product call, not an implementation task. Until it is ruled, the
two safest beginner-adjacent improvements are rank 2 (jump-to-quest — small,
high-confidence, uses existing payload) and the audit's I1 evidence itself
(which is now written down and defensible).

## Explicit non-goals (anti-overcorrection)

- No frontend rewrite, no Rust rewrite, no React Flow replacement, no state
  architecture change, no universal pack model, no plugin system, no AI
  features, no new MC versions, no companion rewrite, no test-suite rewrite,
  no full UI redesign.
- No deletion without evidence: every OPEN deletion row above is grep-proven.
- No roadmap rewrite beyond the stale-claim corrections already landed.

## How to proceed

1. Maintainer rules rows 1–8 (each is a one-line verdict; evidence attached in
   the audit doc).
2. Ruled-in rows become todo.md directed-maintenance items (M1/M2 rehearsal —
   the maintainer directs the AI through them).
3. Ruled-out rows get a written PARKED reason — never silence.
4. Re-review this plan when the 08-19 (3-layer) / 08-20 (round-trip) spine
   re-reviews fire.
