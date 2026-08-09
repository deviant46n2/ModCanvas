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
pnpm integrity / pnpm test:integrity        # same, via the root package.json
```

Sections:

| Section | Invariant | What it catches |
|---|---|---|
| `line-limit` | no file > 300 lines (AGENTS.md) | new over-limit files in `src-tauri/src`, `frontend/src`, companion `src` |
| `asset-bundle` | no game-derived image bytes in the bundle (AGENTS.md rule 6) | new raster images in `frontend/public|src/assets`; images in `tauri.conf.json` `bundle.resources` |
| `stale-binary` | binary embeds src + frontend; stale binary serves old behavior | `target/debug/modcanvas` older than the newest source edit |
| `diff-hygiene` | whitespace lies about structure | `git diff --check` (working tree + staged) |

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

## 2. Planned (suite roadmap)

- **Verifier** (P3): grade claims against repo state — read the code a claim
  points at before believing it.
- **Workaround-register** (s21 cont.4 lesson): tracked register of lived-
  experience workarounds ("restart app to refresh textures") so they are
  surfaced at diagnostic start, not withheld.
- **Provenance** (memory discipline): every recorded fact carries where it
  came from; stale beats absent.
