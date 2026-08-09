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
pnpm integrity / pnpm test:tools        # same, via the root package.json
pnpm backup                             # state backup + expiry audit
```

Sections:

| Section | Invariant | What it catches |
|---|---|---|
| `line-limit` | no file > 300 lines (AGENTS.md) | new over-limit files in `src-tauri/src`, `frontend/src`, companion `src` |
| `asset-bundle` | no game-derived image bytes in the bundle (AGENTS.md rule 6) | new raster images in `frontend/public|src/assets`; images in `tauri.conf.json` `bundle.resources` |
| `stale-binary` | binary embeds src + frontend; stale binary serves old behavior | `target/debug/modcanvas` older than the newest source edit |
| `diff-hygiene` | whitespace lies about structure | `git diff --check` (working tree + staged) |
| `adapter-matrix` | new version/loader = new file, never an edit (AGENTS.md) | modified existing adapters in the diff vs HEAD (added files are fine) |
| `doc-sync` | docs are code (AGENTS.md) | commits in the last 10 that touched code but no doc — **candidates**, maintainer judges (refactors/reverts are legitimately doc-less); never a gate |
| `doc-anchors` | docs and code must agree on specific facts | content-level: CACHE_VERSION, companion jar version — any doc mention ≠ code value is a violation (stale doc text) |

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
| Stale state (s13 goal contract rotted 2 sessions; B2: `.tutor` gitignored + 30-day auto-cleanup) | **State backup + audit** — tar the arc (`.tutor` + memory store + config), verify the archive, audit expiry risk | `scripts/backup-state.mjs` + `/backup` via `pnpm backup` |
| Content-level doc drift (CACHE_VERSION, jar versions) | **Doc anchors** — doc mention ≠ code value = violation | `doc-anchors` integrity section |

The meta-rule holds: every tool obeys the repo's own rules — documented,
tracked, tested (24 tests total across the suite).

## 6. Planned

- (open) — the student's next tool designs; the agreed s21 cont.4 scope is
  complete, and batch 2 (reliability gates) is complete.
