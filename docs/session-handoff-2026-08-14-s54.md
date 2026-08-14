# Session Handoff — 2026-08-14 (s54: PRISM-LEAN chunk 2 + the first friend trial)

Branch `master`. Tree is clean; all work committed and pushed (`dc8e58d..26214ec`, 9 commits).

## WHAT WE BUILT (one line)

PRISM-LEAN chunk 2 shipped and then got stress-tested by the first real user —
the search surface was deleted, the one-click Modrinth installer survived in
narrowed form (wizard curated picks + compat panel), FTB Quests got an explicit
Prism guide, the wizard's curated step learned to close its own dependency
loop, and the friend trial surfaced three real bugs (an id-namespace mismatch
in the compat check, Flatpak-blind Prism handoff buttons, and an AppImage
white-screen) — all fixed, plus a distributable AppImage for the friend.

## DONE

- `0a44ce1` — refactor(mods): PRISM-LEAN chunk 2 — Rust side. `search_mods` +
  `search_merge.rs` + `install_mod_from_search` deleted; installer renamed
  `install_modrinth_mod` (`commands/modpack/install.rs`), **Modrinth-only** —
  CF branch + `download_curseforge_mod` / `resolve_curseforge_file` /
  `download_curseforge_mod_for_version` orphaned and deleted; `version_compatible`
  MOVED to `curated.rs` (its only surviving consumer — the s53 plan missed it);
  `install_payload_for` Modrinth-only, `CompatibilityInstall` dropped the
  constant `source` field; `filter_curated`'s `curseforge:` stripping branch
  removed (proven dead: CF picks never flow through the Modrinth batch).
- `34aa372` — refactor(mods): FE search removal. ModsTab search section + props,
  `SearchResultRow`, `CategorySelect`/`SourceToggles` deleted; `useModState`
  lost search state; `App.tsx` threading removed; `services/mods.ts` →
  `installModrinthMod` (no `source` arg). 4 test files deleted, 2 edited.
- `d61ab2a` — feat(wedge): wizard curated rows get **one-click Install for
  Modrinth picks** (keyless — the honest one-click); FTB Quests row renders the
  **"FTB Quests installs in Prism" guide** naming FTB Library / FTB Teams /
  Architectury (required, CF deps invisible to the app); `blocked_reason` now
  rendered; core-mod gate findings carry per-mod `fix` copy (the blocker says
  *how*, not just *what*).
- `09efcae` — docs: mods-tab.md + roadmap §0 row 6 / §9.3 step 4 / feature
  table rewritten for s54.
- `c5ab492` — feat(wedge): **s54-A — the curated step closes its own dep loop.**
  After a Modrinth one-click (and on load), the step runs the compat check and
  offers missing required deps with the same one-click, inline — the fix
  appears where the friction happened (student's live wall: "was already stuck,
  wasnt super clear where to go"). Unresolvable deps render message-only (no
  button that would lie). **B booked: dep-gating the green check = roadmap §0
  row 7** (design question flagged: the gate is offline, the compat check needs
  network metadata — do NOT build until ruled).
- `293ac49` — fix(mods): the live-fix that B needed to exist at all — the compat
  check compared two id systems (dep reference = numeric Modrinth project id vs
  installed row = jar-derived mod id) so an installed Rhino stayed flagged as
  missing. `dep_is_satisfied()` resolves the dep's metadata identity
  (slug/mod_id) against installed identities. 3 regression tests.
- `40a3bca` + `de9c850` — fix(prism): the Open-Prism buttons hardcoded
  `prismlauncher` on PATH and died on Flatpak-only systems (friend's Bazzite:
  "button does nothing"). Routed through the launcher driver's binary
  resolution (native on PATH else `flatpak run org.prismlauncher.PrismLauncher`)
  — shared `spawn_prism` plumbing extracted, `open_launcher()` +
  `show_instance()` added, flatpak-form args locked by test.
- `26214ec` — chore(build): AppImage bundle config (`bundle.targets =
  ["appimage"]` — the friend-ship artifact), integrity allowlists (ACCEPTED
  line-limit launcher.rs, 5 doc-sync judgments), mods-tab.md id-systems note.
- **AppImage distribution (not in git, built artifact):**
  `src-tauri/target/release/bundle/appimage/ModCanvas_0.1.0_amd64.AppImage` —
  rebuilt + **DMABUF fix baked into AppRun** (`WEBKIT_DISABLE_DMABUF_RENDERER=1`;
  the bundled webkit's GBM compositing white-screens on some drivers — verified
  on the student's CachyOS, rendered fine with the env var). Glibc floor of the
  **bundled** libs is 2.43 (the AppImage carries the build machine's
  modernity — building on a rolling distro poisons broad compatibility; a
  container build on ubuntu:22.04 would give a 2.35 floor, only needed for
  old-distro targets).

## DECISIONS (memory pointers)

- Chunk-2 refinement on ruling: the s53 kill-list overreached — Modrinth
  installs stay in-app one-click (keyless = honest); CF installs go to Prism
  with explicit guide copy. [code:decision: s54 CHUNK-2-RULING / PRISM-LEAN-REFINED]
- s54-A: the wizard's curated step closes its own dep loop; B (dep-gate the
  green check) booked with the network-dependence question open.
  [code:decision: s54-A CURATED-STEP-DEP-LOOP]
- Distribution: AppImage now (friend's Bazzite works); Flatpak ModCanvas is a
  legitimate future path with named parity conditions (filesystem grant for
  instance roots + the driver's flatpak-run spawn + keyring → DB fallback),
  booked as a roadmap decision, not today. [see session]

## GOTCHAS (memory pointers)

- **Two id systems, one reality**: Modrinth dep references are numeric project
  ids; installed rows carry jar-derived mod ids — never compare them raw.
  [code:gotcha: MOD ID NAMESPACES NEVER MATCH]
- Flatpak Prism provides no `prismlauncher` command on PATH — spawns must go
  through the driver's binary resolution (native → `flatpak run`).
- AppImage on a rolling distro bundles the build machine's glibc-modern libs —
  the artifact's real floor can exceed the app binary's own requirement.
- The linuxdeploy AppImage's bundled `strip` predates `.relr.dyn` — build with
  `NO_STRIP=1 APPIMAGE_EXTRACT_AND_RUN=1`.
- First friend trial = the fresh-eyes test the tripwires kept asking for; it
  surfaced 3 real bugs the unit suite couldn't see (id-namespace, flatpak
  buttons, AppImage white screen).

## NEXT

- **Friend trial continuation** — the friend has the AppImage + the launcher
  fix; outstanding on their side: pick ONE Prism (AppImage Prism → PATH shim
  `~/.local/bin/prismlauncher`; or Flatpak Prism → instance must live in the
  flatpak root), then verify: wizard one-click → KubeJS → inline Rhino install
  → issue clears; FTB Quests Prism path; game launch with the companion
  (companion jar auto-deploys on import; game must launch with the app open for
  the WebSocket to connect).
- **Roadmap §0 row 7 (B, booked)** — dep-gate the green check; resolve the
  network-dependence question first (degrade-to-no-claim vs cached metadata).
- **Pilots 1-3 (student's eyes)** — still pending: full-wedge run, skip test
  (gate must block), veteran check (no banner in ide-tour). The friend trial
  partially covered pilot 1; the student's own full run remains.
- **Sober ownership revisit** — explain-backs carried (strip, PRISM-LEAN chunk
  1, guided-quest move, core-mod gate, chunk 2 build, s54-A, the live fixes),
  invitation-only.
- Strip visual check (shipped `f454cae`, unviewed).
- Spine: P2 row 5 atomic writes (parked). Re-reviews 08-19 (3-layer), 08-20
  (round-trip), 08-21 (delegation/PRISM-LEAN).
- Flatpak ModCanvas (Option 2) — booked as a future distribution decision, not
  in the directed queue yet; parity conditions named in the session.

## Environment reminders

- Release binary current (rebuilt with the launcher fix; stale-binary clean).
- Dev binary rebuilt (stale-binary clean).
- Integrity: 0 violations (PARKED RecipeEditor, ACCEPTED hero/logo + launcher.rs,
  5 doc-sync judgments).
- Tests: 450 Rust, 717 FE.
- The AppImage at `src-tauri/target/release/bundle/appimage/` carries the baked
  DMABUF fix — a plain `pnpm build` regenerates the AppImage WITHOUT the bake;
  re-bake via extract → inject AppRun → `appimagetool --no-appstream` (scripted
  this session in /tmp; the AppRun injection is the only non-repo step).
