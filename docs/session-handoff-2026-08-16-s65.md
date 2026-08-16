# Session Handoff — s65 (2026-08-16)

## Status: roadmap tripwire rulings + the FIRST CI verification matrix, fully green on both platforms

Tree clean, all pushed. 464 Rust + 751 FE + 101 tool tests green, integrity 0 violations, binaries rebuilt.

## What we built and why (one line)
We ruled the roadmap's three fired tripwires on evidence — scoping CI as a Linux+Windows verification matrix (the only way to test the platform the codebase *claims* to support but has never run), killing the materialize-step spec (its wizard home was removed in s49/s53), and resolving the journey test in-part (the friend trial delivered the fresh-eyes leg; no new testers until the app hardens internally) — then built the matrix, which promptly found and fixed 4 real Windows bugs plus 3 gate bugs in five CI runs.

## Commits (newest first)
| Commit | What |
|---|---|
| `8db9150` | fix(ci): gate cross-platform path/line-endings — allowlist compare + frontmatter CRLF + .gitattributes |
| `0687e3a` | fix(win): liveness root-strip separator-hardcoded — instances.rs |
| `5d75d75` | fix(win): second CI run findings — path-safety lexical .. guard, zip separators, vanilla jar discovery |
| `e824925` | fix(ci): first CI run findings — unix-gated symlink test + declare zustand (phantom dep) |
| `76dc7e9` | fix(ci): quote YAML step names containing ':' — unquoted colon-space broke parse, 0s run |
| `90e12f9` | feat(ci): verification matrix (ubuntu+windows) + integrity section selection |

## Tripwire rulings (landed in MODCANVAS_ROADMAP.md, s65)
1. **P0-DISTRIB → SCOPED.** CI = verification matrix (ubuntu + windows: cargo test --locked, pnpm test, pnpm lint, pnpm integrity). CD/release artifacts SEPARATED — distribution follows verification. Rationale: the codebase claims Windows support (AGENTS.md EBUSY pipeline, risk #5) with zero observations.
2. **P0-LAUNCH materialize-step → KILLED** (not parked): structural death — wizard has no post-launch step (s49), payoffs surfaced via empty-states + Beginner banner (s42/s53), verification half is the hotswap loop's job.
3. **P0-WIZARD journey test → RESOLVED-IN-PART.** Friend trial (s54) = the fresh-eyes launch/capture leg. Remainder booked: tutorial readability pass (student walks ide-tour in-app once, no tester). **No further external testers until internal testing matures** (student's call — "lots of testing first").

## The CI arc — 5 runs, 4+3 real findings (this is the payoff)
- **Run 1** (0s): YAML parse fail — unquoted `:` in step names. Fixed.
- **Run 2**: zustand **phantom dependency** (3 stores import it, package.json never declared it; local pnpm hoisting masked it — "works on my machine") + unix-only symlink test ungated. Fixed.
- **Run 3**: 14 Windows failures → triaged into 5 clusters, 4 real production bugs:
  - **CROWN JEWEL** — traversal guard was platform-dependent: Win32 resolves `\x\..\` lexically before the FS sees it, so an escaping root `.exists()`'d as valid on Windows and writes landed OUTSIDE the project root. Linux caught it by accident. Now rejected lexically (ParentDir components) before any OS call.
  - ZIP entry names built via to_string_lossy → `\` on Windows; ZIP spec requires `/` (sanitize + mrpack writer + curseforge exporter).
  - Vanilla-jar discovery matched `/{ver}-` against stringified path — never matches Windows `\`.
  - Liveness root-strip `strip_suffix("/minecraft")` — never matches `\minecraft`.
  - Plus: /proc liveness tests gated `#[cfg(unix)]` (WMI/NtQuery seam documented, not built); canonicalize-form tests fixed to compare like-for-like (`\\?\` prefix + 8.3 short names are Windows canonicalize behavior).
- **Run 4**: Windows Rust green; the GATE itself failed on Windows:
  - allowlist path compare: `relative()` emits `\` on Windows, allowlists store `/` — ACCEPTED entries never matched (hero.png/logo.png flagged).
  - frontmatter parser anchored to bare `\n`; CRLF checkouts broke every `.opencode/command/*.md` parse.
  - `.gitattributes` added to pin LF + binary.
- **Run 5: FULLY GREEN — both platforms.**

## GOTCHAS (memory store has the detail)
- WIN32-PATH-COLLAPSE-S65, WINDOWS-PLATFORM-TRAPS-S65 (zip sep, hardcoded '/', CRLF, allowlist compare, YAML colon, OAuth workflow scope), ZUSTAND-PHANTOM-DEP-S65, TAURI-CMD-REGISTRATION (carried).

## Open threads / next
1. 08-18 re-reviews: version-boundary, offline-first, two-source-divergence (promotion candidate), doc-sync triage, atomic writes, comment preservation.
2. Spine: comment preservation (P2 row 5 second half).
3. Booked: tutorial readability pass (journey-test remainder — student's own ide-tour walk).
4. Friend-bundle `.flatpak` re-export (s61 loose end).
5. Owed explain-backs (invitation-only): s64 fidelity; s65 CI fixes.
6. Watch the matrix on the next few pushes — it's now the standing second witness.
