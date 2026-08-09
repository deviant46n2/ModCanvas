# Tooling Arc — Batch 3: The Tutor's Own Reliability

Implementation contract for the batch-3 tools: the reliability gates built in
batch 2 (docs/tooling.md §5) killed the *observation* failure classes; this
batch kills the *tutor-side structural* ones — context loss, self-drift,
pattern-matching, completion-over-understanding, model ceiling.

**Status:** T1–T5 SHIPPED (2026-08-09); T6 model decision RECORDED (keep
deepseek-v4-flash until a better model matches its price — not to be
relitigated); S1 (default agent → tutor) still open. Backlog worked top-down;
each item landed with tests + doc sync; the suite obeys its own rules
(gate exit 0, all tests green, diff-check clean).

---

## How to use this file

- Work the backlog top-down. Each item is independently tackle-able and ends
  with its own tests + doc sync.
- "Current state" lists what is ALREADY BUILT (batch 1–2) — do not redo.
- The failure-class evidence column names the session(s) where the weakness
  bit us; the tool must attack that class, not a symptom.

---

## Current state (already built — do NOT redo)

- Integrity gate (`scripts/integrity-check.mjs` + the `integrity-*.mjs`
  modules): 8 sections, rules-as-data, `--seed`, allowlist-as-
  written-reason, all tests green.
- Verifier (`/verify`), workaround register (`docs/workarounds.md` +
  `/workaround`), observation gate (`tutor-observation` skill, `/debug` step 0),
  instrumentation gate (`tutor-instrument` skill), verification harness
  (`/verify-build`), state backup (`scripts/backup-state.mjs`, `pnpm backup`).
- Docs: `docs/tooling.md` (what exists + failure-class table), `docs/workarounds.md`.

---

# BACKLOG

## T1 — `/handoff`: session state snapshot command

**Why (weakness 1):** my context window fills mid-session; compaction can kill
the thread if state wasn't written. Memories bank at boundaries, but the
session thread (in-flight, unverified, owed) has no snapshot. The command must
make writing that snapshot fast enough to actually happen at every boundary.

- `.opencode/command/handoff.md` — instructs the tutor to emit, at any
  boundary (session start/end, arc pivot, before compaction is likely):
  - DONE (this session, committed/uncommitted)
  - IN-FLIGHT (what is being worked, what step is next)
  - PENDING (explain-backs, re-asks, parked items — the /owed view)
  - **WHAT WE BUILT — the tutor's own one-sentence line: "what we built today
    and why." The tutor writes it; the student may correct or ignore it.
    Unconfirmed lines stay in the ledger as data (the s21 lesson: unowned
    accumulation is the cost of carrying; visible > hidden). This is the
    tutor's job, NOT a student toll — no ceremony, no forcing.**
  - UNVERIFIED CLAIMS (claims made this session that lack evidence — feed
    `/verify` on each next session)
  - DECISIONS (ADR-lite: what + why + rejected — the `code:decision` shape)
- The snapshot is written to memory (`code:session`) AND to a session file
  (`backups/handoffs/<date>.md` is NOT needed — memory + .tutor/profile.md
  mirror suffice; keep it one write).
- **Acceptance:** `/handoff` produces a snapshot in ≤1 tool call that a fresh
  session can resume from without re-reading the chat.

## T2 — `/owed`: the owed-items LEDGER (not a gate)

**Why (weakness 1, 4):** declined explain-backs are recorded in the profile
but nothing surfaces them. REVISED 2026-08-09 after student veto: the original
design ("fails the session open until owed items are acknowledged") was wrong —
it forced the toll at the worst moments (tired, in flow, wanting progress).
The student's lived experience is ground truth: **no forced explain-backs,
ever.**

- `.opencode/command/owed.md` — at session start (and on request), LIST every
  owed item from the profile: pending explain-backs, unconfirmed "what we
  built" lines from past /handoff snapshots, past-due re-review dates.
- **Informational only.** Nothing blocks, nothing forces. Each item is
  schedule (student picks when — fresh, arc close) or carry (moves forward,
  stays visible). Tired + in flow = carry, with no friction.
- The student's veto is absolute: an explain-back happens only at their
  invitation ("explain that to me") or their scheduled time.
- **Acceptance:** `/owed` lists items with zero blocking; the student can
  carry everything and the command still exits 0. The ledger is data for
  conversation, never a gate.

## T3 — `/audit`: self-audit of the tutor's own config

**Why (weakness 2):** the s13 stale-contract failure happened twice. Nothing
checks `.opencode/**` against the repo.

- `.opencode/command/audit.md` — instructs the tutor to verify:
  - every `.opencode/command/*.md` and `.opencode/skills/*/SKILL.md` file's
    frontmatter `description` matches its content (stale-contract scan);
  - every file/section/row a command or skill references EXISTS (sections in
    integrity-check, rows in docs/workarounds.md, anchors in the rules file,
    paths in package.json scripts);
  - `.tutor/profile.md` mirror ≈ memory profile (stale-mirror check);
  - AGENTS.md contract vs tutor config in sync (the s13 sync rule).
- Findings classified blocking / should / nit, same as the review rubric.
- **Acceptance:** `/audit` on the current tree finds the known-good state (0
  blocking) and would have caught the s13 stale goal contract.

## T4 — falsification skill

**Why (weakness 3):** pattern-matching beats verification when there's no
habit of naming the counter-evidence.

- `.opencode/skills/tutor-falsification/SKILL.md` — for every important
  conclusion (root cause, design choice, "this is fixed"): write one
  sentence — *"this is wrong if [observable]"* — then go look for that
  observable BEFORE acting. If the disproof-observable can't be named, the
  conclusion isn't testable and is flagged as such.
- Cross-refs the observation gate (raw observation first) and `/verify-build`
  (the harness grades evidence).
- **Acceptance:** a /debug run that loads the skill ends with the falsification
  line for its root-cause conclusion; the skill is loadable and referenced by
  `/debug`.

## T5 — integrity `suite-self` section

**Why (weakness 2, repo side):** the tooling suite itself drifts — scripts
renamed, package.json scripts changed, commands referencing dead sections.

- New section in `scripts/integrity-check.mjs` (data-driven, like the others):
  - every `.opencode/command/*.md` frontmatter has `agent: tutor` and a
    description;
  - every package.json script referenced in docs/tooling.md exists;
  - every skill referenced by a command exists;
  - the suite's own test files exist and the npm test:tools script lists them.
- **Acceptance:** fixture tests for each check; the section is clean on the
  current tree.

## T6 — config decision (NOT a tool): tutor model + default agent

**Why (weakness 5):** s13 findings S1 (default_agent is the generalist, not
the tutor) and S3 (flash-tier model caps judgment-heavy tutoring) were never
actioned. No tool fixes the model; this is a config + process decision.

- **DECIDED 2026-08-09 (student):** keep the current model (deepseek-v4-flash).
  Rationale on the record: the student values coding all day on the current
  subscription; will not change until a better model matches its price.
  Cost wins over ceiling, knowingly. Not to be relitigated.
- **STILL OPEN:** S1 — default_agent is the generalist, not the tutor; the
  tutor is only reachable via commands/agent pinning. Free fix, no model
  change — decide when convenient.
- **Acceptance:** the model decision is recorded (done above); S1 decision is
  recorded when made.

---

## VERIFY — Tests, docs, rebuild

- New tests per item (fixture style, `node --test` for script checks).
- Docs: `docs/tooling.md` gains a §7 "Batch 3" row for each shipped item; this
  file's Status flips per item.
- `pnpm integrity`, `pnpm test:tools`, `pnpm backup` all green; `git diff
  --check` clean.
- The suite obeys its own rules: no tool file exceeds 300 lines; every tool is
  doc-synced in the same pass.

---

## Definitions

- **Owed item** = a pending explain-back, an unconfirmed "what we built" line,
  a past-due re-review. **Never forced, never dropped:** schedule (student
  picks when) or carry (stays visible in the ledger). The student's veto on
  forced explain-backs is absolute (2026-08-09).
- **Falsification line** = "this is wrong if [observable]" for a conclusion;
  a conclusion without one is untestable and flagged.

## Out of scope (do not build without asking)

- Automating `/handoff` (auto-trigger on compaction detection) — the trigger
  is the tutor's judgment for now.
- Cross-project tool portability (the lift-out seam exists; no second project
  in view — rule of two).
- Anything that replaces the student's veto or the graded gates.
