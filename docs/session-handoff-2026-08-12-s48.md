# Session Handoff — P0 gate close, repo cleanup, beginner arc, CF saga (2026-08-12, s48)

**Branch:** `master` only — the solo-mainline convention (AGENTS.md, `efab293`):
all work lands on master, known-good states get tags, push at boundaries.
7 commits this session. 450 Rust + 719 frontend, tsc clean, integrity **0
violations**, release binary rebuilt (embeds the tutorial v2 template + the
CF fixes). Remote: pushed through `aea7bd8`; `master` is **7 commits ahead of
`origin/master` at close** (0c5133c..7cc7263 — push pending).

## WHAT WE BUILT (one line)
First-boot routing and a 20-quest tutorial covering every shipped feature landed;
the repo was collapsed to a solo mainline and backed up for the first time in a
week; and the CurseForge download path became attribution-honest and
beginner-legible (real UA, counted endpoints, actionable 403, manual-download
link).

## DONE (commits, newest first)

| Commit | What |
|---|---|
| `7cc7263` | fix(curseforge): beginner-actionable key-rejected message + manual-download link, honest keyring labels (s48) |
| `d76230a` | fix(downloads): author attribution — counted endpoints + real UA, placeholder UA removed (s48) |
| `efab293` | docs(AGENTS): collapse to solo mainline — tags, no stable/nightly until CI or users (s48) |
| `923e34c` | docs(AGENTS): branch convention — master mainline, nightly tracks master, stable release line (s48) *(superseded by efab293)* |
| `7f6b4bb` | docs(roadmap): park the guided-tour driver with written reason + tripwire (s48) |
| `7b2a514` | feat(templates): tutorial v2 — behaviors, loot, beginner mode, config-tweak quests (s48) |
| `0c5133c` | feat(onboarding): first-boot routing — fresh install auto-opens the First-Pack wizard (s48) |
| `aea7bd8` | docs(roadmap): P0 bookkeeping sweep — stamp shipped items, prune stale park (s48) |
| `78c2bb0` | feat(beginner-mode): P0-BEGINNER — hide raw/code surfaces, prominent toggle (s47) |

Also: repo cleanup (18 local branches → 1, 3 stale remote branches deleted,
the Aug-5→Aug-12 single-copy window closed by the first push), and the s47
in-flight handoff closed (see its CLOSED block).

## IN-FLIGHT / OPEN (parked with reasons + tripwires)

- **CF API key saga — PARKED (external)**. App side PROVEN end-to-end
  (keyutils store → read → correct `x-api-key` header; curl mirrors the app).
  Blocker is the student's CurseForge ACCOUNT: no create-key path, regenerate
  claims success but serves the identical value, every key 403s (both auth
  mechanisms, VPN on/off). **Reminder 2026-08-15**: try a dummy CF account's
  key (200 = main account is the problem; a throwaway key works in the app).
  Until then: CF-exclusive jars (FTB family) are downloaded manually from the
  website — now app-supported via the blocked-box link.
- **`controllable` curated pick** (`curated.rs:60`) — keyed as a Modrinth slug
  that 404s (verified via Modrinth API). Re-key to `curseforge:{id}` (verify
  the id once a working key exists) or drop. Every wizard load logs the 404.
- **Guided-tour driver** — PARKED (roadmap §9.5) with tripwire: fresh-eyes
  test showing quests-by-name aren't enough, or the dogfood item getting
  scheduled.
- **CI (P0-DISTRIB)** — roadmap tripwire FIRED (s44 hotswap landed). The
  thing that makes tags/nightly-builds mechanical.
- **Smoke-suite remainder** (SMOKE-6/9/10/14 + 11/12 chain) — tripwire: next
  instance launch.
- **f1b4cab doc-sync candidate** — unjudged (behaviors.md 169/195 cover
  warnings; judgment row or one-line doc payment).
- **RecipeEditor.tsx line-limit PARK** — tripwire: next touching edit splits
  it (the script-preview-pref seam).

## PENDING (owed ledger — data, never a gate)

- PR-A dependency-test retake — declined by student, carried.
- Explain-back offers for the chunk-1/2 commits — unanswered, carried.
- CF dummy-account curl test — scheduled 08-15 reminder.

## UNVERIFIED CLAIMS

- The tutorial v2 quest text has not been walked end-to-end in the app by a
  user (the walkthrough got blocked at the curated-mods step by the CF key
  saga). The 20-quest tour imports + round-trips (fidelity tests) but its
  in-app readability is untested.
- First-boot routing (0c5133c) was never observed firing in a live app run —
  it's unit-tested only; the walkthrough didn't reach a fresh-install state.
- The counted-endpoint download was never observed producing an actual jar
  end-to-end (the CF path is key-blocked; the Modrinth path was refactored
  but no real install ran this session).

## DECISIONS

- `PARK-RECIPEEDITOR-LINELIMIT` — park-with-tripwire over split-now (student's
  debt-triage call, the 300-line rule's written-reason branch).
- Solo-mainline collapse — three-branch shape tried and collapsed same session
  (ceremony without a consumer); tags for known-good states.
- Manual-download workflow for CF-exclusive jars while the key saga is parked
  (escape hatch, not the norm — Modrinth installs stay app-side).

## GOTCHAS (resolved memory entries — see the memory store for detail)

- `KEYUTILS-VS-SECRET-SERVICE` — the CF key lives in the kernel keyring;
  `secret-tool`/sqlite probes read the wrong store (cost ~30 min s48).
- `GH-CREDENTIAL-HELPER-WEDGES-NON-TTY` — pushes hang intermittently in
  non-TTY shells; retry or hand to the student's terminal; curl/API unaffected.
- `CONTROLLABLE-NOT-ON-MODRINTH` — registry 404; re-key or drop.

## Next

1. Push master (7 commits) — the close-boundary push per the convention.
2. Re-key or drop the `controllable` pick (2 min; the last open walkthrough
   finding).
3. Student: FTB jars by hand → continue the fresh-eyes walkthrough (the
   tutorial v2 + first-boot routing still need a real user run).
4. CF dummy-account test on 08-15 (reminder set).
5. CI remains the roadmap's own next signal (tripwire fired).
