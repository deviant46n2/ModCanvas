---
description: Runs the repo integrity gate (scripts/integrity-check.mjs) — the P2 invariant catalog as executable checks. Triage any violation with the student (pay now vs. park with a written reason). Use when checking repo health or before trusting a diff.
agent: tutor
---

Run the integrity gate: $ARGUMENTS

1. Run `node scripts/integrity-check.mjs` from the repo root (or `node scripts/integrity-check.mjs <section>` for line-limit | asset-bundle | stale-binary | diff-hygiene | adapter-matrix | doc-sync | doc-anchors | build-smoke | suite-self).
2. **VIOLATION entries are new violations** — the gate is clean on the known debt (parked). For each violation, triage with the student like any debt:
   - pay now (split the file / remove the asset / rebuild / revert the adapter edit) — or
   - park with a written reason: add the path to the matching allowlist in `scripts/integrity-rules.json` with a reason that names the failure it would mask.
   The student decides; the tool only surfaces.
3. **parked entries are known debt** with written reasons — visible so it is never silently forgotten. If a parked file was since fixed, remove its allowlist entry.
4. **candidate entries (doc-sync) are drift signals, not verdicts** — a commit touching code without docs. Judge each: needs a doc update (add it) or is legitimately doc-less (refactor/revert — do nothing). Never treat a candidate as a gate failure.
5. Teach the *why* behind each check (AGENTS.md rule it encodes) so the student can judge, not just run: 300-line = size is a tripwire for extraction; asset-bundle = no game-derived image bytes in the bundle; stale-binary = the binary embeds src + frontend; diff-hygiene = whitespace lies about structure; adapter-matrix = editing an existing adapter breaks other versions silently; doc-sync = stale docs misdirect the next AI.
6. Verify the tool itself is honest: it must obey the repo's rules (docs synced in docs/tooling.md; run `node --test scripts/integrity-check.test.mjs` after any engine change).
