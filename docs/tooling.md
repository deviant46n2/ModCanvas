# Tooling Suite — state-truth tools for the ModCanvas maintainer

The tutor–student tooling arc (booked s21 cont.4, built 2026-08-09). These
tools exist so the maintainer can verify AI claims against the repo instead of
trusting them. The meta-rule (s13): the tooling is itself a maintainership
artifact — it obeys the repo's own rules (doc-sync, 300-line, tracked, tested).

## 1. Integrity gate — `scripts/integrity-check.mjs`

The P2 invariant catalog (AGENTS.md rules) as executable checks. Engine is
generic; rules are data in `scripts/integrity-rules.json` — that split is the
lift-out seam if a second project ever wants the tool.

```bash
node scripts/integrity-check.mjs            # all sections; exit 1 on violations
node scripts/integrity-check.mjs --seed     # snapshot current tree into rules as parked debt
node scripts/integrity-check.mjs <section>  # one section
node --test scripts/integrity-check.test.mjs # engine tests (12)
`pnpm integrity` / `pnpm test:tools`   # same, via the root package.json
`pnpm backup`                          # state backup + expiry audit
```
The backup is also automated: a systemd user timer. Source of truth is
`scripts/systemd/modcanvas-backup.{service,timer}`; the installed units in
`~/.config/systemd/user/` are symlinks to the repo copies (install/reinstall:
`ln -sf …/scripts/systemd/modcanvas-backup.{service,timer} …/user/` +
`systemctl --user daemon-reload`). Daily, `Persistent=true` — missed runs catch
up at next login. The script checkpoints WAL-mode SQLite shards before tarring,
so an archive taken mid-write is still one consistent state (s30). `pnpm
backup` remains for boundary runs.

Sections:

| Section | Invariant | What it catches |
|---|---|---|
| `line-limit` | no file > 300 lines (AGENTS.md) | new over-limit files in `src-tauri/src`, `frontend/src`, companion `src` |
| `asset-bundle` | no game-derived image bytes in the bundle (AGENTS.md rule 6) | new raster images in `frontend/public|src/assets`; images in `tauri.conf.json` `bundle.resources` |
| `stale-binary` | binary embeds src + frontend; stale binary serves old behavior | per-binary scoping: dev binary vs `src-tauri/src` only (frontend hot-reloads in `pnpm dev` — F4 fix); release binary vs backend + frontend. Either may be parked with a written reason |
| `diff-hygiene` | whitespace lies about structure | `git diff --check` (working tree + staged) |
| `adapter-matrix` | new version/loader = new file, never an edit (AGENTS.md) | modified existing adapters in the diff vs HEAD (added files are fine) |
| `doc-sync` | docs are code (AGENTS.md) | commits in the last 10 that touched code but no doc — **candidates**, maintainer judges (refactors/reverts are legitimately doc-less); never a gate. Judged commits (`docSync.judgments` in the rules, written reason) are info, not candidates. A candidate that **ages out unjudged** does not vanish — the health report transitions it to visible P2 work via `.doc-sync-state.json` (s30: the 65c1fe8 failure — an unjudged candidate sat invisible for 5 sessions) |
| `doc-anchors` | docs and code must agree on specific facts | content-level: CACHE_VERSION, companion jar version — any doc mention ≠ code value is a violation (stale doc text) |
| `suite-self` | the tooling is a maintainership artifact (s13 meta-rule) | the suite checks itself: command frontmatter (agent/description), skill references resolve, `pnpm` scripts in docs exist in package.json, test files exist |

The git-aware checks live in `scripts/integrity-git.mjs`; the content-level
doc anchors in `scripts/integrity-doc.mjs` (split from the main engine when
it tripped its own 300-line rule — the tripwire working on the tool itself).
Engine: 258 lines; git module: 84; doc module: 40.

**The allowlist is the "written reason" (P4).** A file appears as `parked` with
its reason attached — the debt is visible, never silently forgotten. `--seed`
parks everything that predates the tool; the gate then reports only NEW
violations, which the maintainer triages: pay now, or park with a reason.

Exit codes: `0` clean, `1` violations, `2` error (wrong cwd, git failure).
Run from the repo root.

Known debt parked at introduction (2026-08-09): 48 files over 300 lines
(including the giant CSS files: `App.css` 3225, `QuestCanvas.css` 2085,
`RecipeEditor.css` 2033), plus `hero.png`/`logo.png` recorded as *permitted*
self-authored branding. The parked list is visible on every run — pay it down
by splitting files and removing their allowlist entries.

## 2. Verifier — `/verify`

P3 claims-vs-repo as a discipline command. Given any claim (AI's, tutor's,
student's): restate it, read the code it points at, grade PASS / FAIL /
PARTIAL / UNVERIFIABLE, and emit the provenance header — claim → evidence
`file:line` → verdict → confidence. The code wins over any confident story.

## 3. Workaround register — `docs/workarounds.md` + `/workaround`

The s21 cont.4 lesson made executable: real workarounds ("restart the app to
refresh textures" — withheld for weeks) get written down, consulted at every
diagnostic start, and the student is always asked for their own. Seeded with
5 entries from the record (midnight log rotation, md5/javap jar verification,
lingering-game-process, CACHE_VERSION pairing).

## 4. Provenance

Folded into the verifier (the header: claim → evidence → verdict) and the
memory discipline (memory is a pointer, not proof; stale beats absent). No
separate tool — it's the output format of `/verify` and the storage rule of
`code:` memories.

## 5. The reliability gates (s22 batch 2 — improving the tutor's own quality)

The five failure classes observed across the arc, each with a tool:

| Failure class (evidence) | Tool | Form |
|---|---|---|
| Unverified observations as evidence (s6 truncated grep → wrong pack story; s8 fabricated `.env`; s20 grep error) | **Observation gate** — pin raw observation + source + timestamp, classify observed/derived/remembered, truncated ≠ evidence | `tutor-observation` skill, loaded by `/debug` step 0 |
| Instruments that silently don't fire (s20c dead probe; s21 NPE probe, midnight log rotation) | **Instrumentation gate** — prove applied / can fire / NPE-safe / right log, before any probe cycle | `tutor-instrument` skill |
| Verification loops skipped under pressure (s14: jar was old build, app never restarted) | **Verification harness** — rebuild → deploy → restart → observe, each step graded on EVIDENCE; claim only after | `/verify-build` command |
| Stale state (s13 goal contract rotted 2 sessions; B2: `.tutor` gitignored + 30-day auto-cleanup) | **State backup + audit** — tar the arc (`.tutor` + memory store + config), verify the archive, audit expiry risk; WAL checkpoint before tar; automated daily via a systemd user timer (s30, units tracked in `scripts/systemd/`), manual boundary runs still fine | `scripts/backup-state.mjs` via `pnpm backup` + `scripts/systemd/modcanvas-backup.timer` |
| Content-level doc drift (CACHE_VERSION, jar versions) | **Doc anchors** — doc mention ≠ code value = violation | `doc-anchors` integrity section |
| Process-skip at session close (s22: profile mirror written, `code:session` handoff write skipped — memory told a stale story, caught s23) | **State freshness** — newest `code:session` in the memory store must postdate the last commit; stale = the closing session never wrote its snapshot | `scripts/state-freshness.mjs` via `pnpm state-freshness`, run as `/audit` step 5 |
| Compression rot (s33: shrinking the handoff to pointers is only safe if the cited detail exists — forget the gotcha entry once or twice and the detail is gone with the 30-day clock) | **Handoff reference gate** — every `GOTCHAS:` / `DECISIONS:` line in a `code:session` must resolve to an existing `code:gotcha` / `code:decision` memory; unresolvable = the compression deleted the detail. Presence only — wrong/vague entries are the spaced re-review's job. Runs at the `/handoff` boundary (write entries → handoff → check) and passively with the daily backup | `scripts/memory-check.mjs` via `pnpm memory-check`, chained after backup in `scripts/systemd/modcanvas-backup.service` |

The meta-rule holds: every tool obeys the repo's own rules — documented,
tracked, tested (the suite's test count is verified by the gate itself — a
stale "N tests" claim in this doc is a violation).

## 7. Batch 3 — the tutor's own reliability (todo-tooling.md)

| Item | Tool | Status |
|---|---|---|
| T1 | `/handoff` — session snapshot: DONE / IN-FLIGHT / PENDING (owed) / WHAT WE BUILT (the tutor's one line) / UNVERIFIED CLAIMS / DECISIONS | shipped |
| T2 | `/owed` — the ledger, NOT a gate (2026-08-09 veto: no forced explain-backs, ever; schedule or carry, frictionless) | shipped |
| T3 | `/audit` — self-audit: command/skill references resolve, profile mirror ≈ memory, no stale contracts | shipped |
| T4 | falsification skill — "this is wrong if [observable]", then go look; untestable conclusions flagged | shipped |
| T5 | `suite-self` integrity section — the suite checks itself | shipped |
| T6 | model decision — RECORDED (keep deepseek-v4-flash until a better model matches its price); S1 (default agent) still open | decided |

Policy change recorded 2026-08-09: the understanding floor is about unowned
*accumulation*, not ceremony — explain-backs happen only at the student's
invitation or scheduled time; the one-line "what we built and why" is the
tutor's job in every /handoff, and unconfirmed lines stay visible in the
ledger as data (the s21 lesson).

## 6. Planned

- (open) — the student's next tool designs; the agreed s21 cont.4 scope is
  complete, and batch 2 (reliability gates) is complete.

## 8. Repo health report — `scripts/health-report.mjs` / `pnpm health`

The debt ledger's thermometer (built 2026-08-09, debt-clearing arc). Consumes
the integrity engine's `runAllSections` output — it never re-derives checks —
and applies a weighting table to produce a **manageable debt load** score:

```bash
pnpm health            # report + trend append (exit 0 always: report, never a gate)
node scripts/health-report.test.mjs
```

**Score = 100 − deductions** (the student's definition: NOT code quality —
that's the suite's job; this is the ledger's thermometer):

| Class | Weight (rules) | Meaning |
|---|---|---|
| violation | 10 | a broken invariant (the suite's exit-1 class) |
| candidate | 3 | surfaced, needs maintainer judgment (doc-sync) |
| parked | 0.5 | known debt WITH a written reason — near-zero so good parks aren't punished (s22) |
| ledger item | by priority P0 15 / P1 10 / P2 5 / P3 2 | explicit priority field, data not magic |

**Severity bands (s30 — the flat parked weight was undercounting real debt).**
A section may define `parkedWeights` in `health-rules.json`: the parked
entry's own metric (line-limit's `lines`) picks a band. Line-limit uses
`301–400: 0.5 / 401–600: 1 / 601–1000: 2 / 1001+: 3` — a 3226-line App.css
costs 6× a 301-line file. The score is honest *because* the monsters hurt:
splitting App.css is worth 3 points, not 0.5. A parked entry without the
metric (e.g. asset-bundle paths) falls back to the flat 0.5.

**Failure classes are data, not code.** The open-item ledger lives in
`scripts/health-rules.json` (split from `integrity-rules.json` when the seeded
ledger + `since` fields pushed it past its own 300-line limit — the s22
meta-rule applied to the tool itself). New failure class = new ledger row, no
script edit.

**Parked-tripwire semantics (git truth).** Parked entries carry a `since`
timestamp (when the park was written); a park whose reason says "revisit on
next touching change" fires as `parked-tripwire` ONLY when the file's last
commit postdates `since` (`git log -1 --format=%cI`). A park whose contract
hasn't fired is not work — the old reason-text matching flooded the list with
all 46 parks; the git check narrows it to the 3 actually touched.

**Trend:** appended to `.health-trend.json` (gitignored — the history is ours,
not git churn), one entry per local day, deduped, capped at 120. The score's
composition is printed with every run, so the number is always defensible:
"47/100" means "the ledger currently holds 53.5 points of managed/unmanaged
debt," nothing more.
