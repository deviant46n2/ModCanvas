# Workaround Register — lived-experience facts that never made it into code

The s21 cont.4 lesson: the maintainer withheld "restart the app to refresh
textures" for weeks — a real, working workaround that died in one person's
head. This register exists so every such fact is surfaced at diagnostic
start, never hoarded. The `/workaround` command (and `/verify` step 6) enforces
consulting it.

| # | Workaround | When it applies | Why it works | Discovered |
|---|---|---|---|---|
| 1 | Restart the app to refresh stale icons/textures after engine or companion changes | Editor shows old icons after a backend/companion change | The app binary embeds the frontend AND backend; a stale process keeps serving the old cache (AGENTS.md rebuild rule) | s21 cont.4 (withheld for weeks — the lesson) |
| 2 | Read `debug.log`, not `latest.log`, for companion probes | Looking for probe output after a run | `latest.log` ROTATES AT MIDNIGHT — reading it alone faked a "no probes" read | s21 close |
| 3 | Verify a deployed jar actually RAN, not that it exists | After any companion rebuild/deploy | File existence ≠ new code: check md5 differs AND the new symbol is present (`javap -p -verbose`); `strings` won't show float constants | s14 |
| 4 | Kill a lingering game process before relaunch | Launch "fails" or the game doesn't come up | A stale game process holds the old jar in memory — mods load once at startup; the wrapper may be dead while the game lives | s21 cont.3 |
| 5 | Bump `engine_renders.rs` CACHE_VERSION in the SAME pass as a renderer-semantics change, then restart the app | Any companion change to shading/sampler/format semantics | The disk cache validates on version mismatch; an old binary keeps serving the stale cache | s14 / s21 |
| 6 | Purge the engine-render cache after a frontend-side render-guard fix — it will NOT self-heal | After changing which items the frontend queues to the engine (e.g. the s26 flat-icon guard: flats now never re-render) | The cache only regenerates items the frontend queues; unqueued items keep their stale renders forever, and bright materialized URLs never get persisted to the engine cache — the stale value re-flashes at every boot until the purge | 2026-08-09 (s27 → debt arc) |
| 7 | Prism "Could not download metadata for NeoForge X" — either **restart Prism** (real fix) or **switch the instance to a different NeoForge version** (quick fix) | A long-running Prism process (days) fails a loader launch with checksum mismatches even though the meta server is self-consistent | Prism's meta chain is hash-pinned: version file ← uid index ← root index, and the root index (root of trust) never re-downloads once loaded — the in-memory chain FREEZES at process start. Server regeneration after that → frozen expected hashes ≠ served content → permanent failure until the process dies. Restart re-fetches the now-consistent chain. Switching versions works only for versions whose files were NOT regenerated since process start. NOT the metacache (s37 diagnosis was wrong; deleting it changed nothing). | 2026-08-10 (s38, fully root-caused via PrismLauncher source + direct server probes) |
| 8 | App Launch button does nothing (silent) — **kill the stale prismlauncher process** and launch again | Clicked Launch, no error, no game window, nothing | A long-running `prismlauncher` process with an un-reaped zombie game process (`[java] <defunct>` under it) is wedged: its single-instance IPC accepts `--launch X` (CLI exits 0 immediately) but never starts the game. The app's `spawn_launch` nulls Prism's stdout/stderr (launcher.rs:178), so the refusal is invisible by construction. Tell: `pgrep -af prismlauncher` shows a launch from days ago + a java zombie; no fresh java spawns on relaunch. Kill the stale Prism (instances live on disk; nothing is lost) → fresh Prism launches normally. | 2026-08-11 (s42, verified: CLI exited 0 with no process, then game booted after the kill) |

## Rules of the register

- Consult it at the start of every diagnostic; ask the student for their own
  lived-experience workarounds before proposing theories (they have some we
  don't — see #1).
- New workaround surfaced → add a row here with the date, in the same pass it
  is learned. Never let one die with a session.
- A workaround that gets fixed in code moves to "fixed" status with the commit
  hash — it stays as history, marked resolved.
