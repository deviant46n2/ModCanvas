# Engine-Rendered Icons (Companion Mod)

When ModCanvas's own software rasterizer cannot bake an item icon — custom mod
models, complex transforms, fluids, NBT-dependent item looks — the icon comes
out as a "?" (JEI view) or a blank/fallback tile (quest canvas). The companion
mod closes that gap by rendering the item **in-game with the real Minecraft
item renderer** and sending the PNG back to ModCanvas, which caches it on disk.

This is opt-in and offline-first: nothing is bundled, and everything is lazy —
icons are only produced for items the local pipeline actually failed to
resolve, and only while the game (with the companion) is running.

## Protocol

Two new events over the existing WebSocket IPC bridge (`src-tauri/src/ws_ipc.rs`,
`events` module):

| Event | Direction | Payload |
|---|---|---|
| `RENDER_ITEMS_REQUEST` | ModCanvas → game | `{ requestId, size, items: ["modid:item", …] }` |
| `RENDER_ITEMS_RESULT` | game → ModCanvas | `{ requestId, rendered: { "modid:item": "data:image/png;base64,…" } }` |

Batches are capped (`engine-render.ts` sends ≤32 per request) and the game
renders **4 items per client tick** (`ItemRenderQueue.PER_TICK`) so a large
batch never freezes a frame; the result is sent as one reply when the queue
drains.

## Companion mod (1.21.1 NeoForge)

- `workbench-companion-neoforge-1.21/…/client/ItemIconRenderer.java` — the
  actual renderer. On the render thread it:
  1. Mirrors the game's GUI projection exactly (ortho over the target +
     model-view Z translate `10000 - getGuiFarPlane()` — an identity model-view
     would clip every item out of the depth range).
  2. Binds a 64×64 `TextureTarget` (transparent clear), then renders each item
     via `GuiGraphics.renderItem(stack, -8, -8)` inside a pre-scaled pose (GUI
     glyph scaled to ~90% of the tile).
  3. Reads the framebuffer back with `NativeImage.downloadTexture`, flips rows
     (GL is bottom-up), PNG-encodes (`asByteArray`) and base64-encodes it.
  4. Restores all GL state (projection, model-view, main framebuffer).
- `ItemRenderQueue.java` — per-tick throttling + result accumulation.
- `WorkbenchEventHandler.java` — handles `RENDER_ITEMS_REQUEST` (works from the
  main menu too; only reload commands require a player).

Build: `cd workbench-companion-neoforge-1.21 && ./gradlew build` →
`build/libs/workbench-companion-1.0.0.jar`. The app deploys that jar to the
instance's `mods/` via the **Deploy Companion Mod** action
(`deploy_companion_mod_to_dir` in `src-tauri/src/minecraft.rs`).

## ModCanvas cache (Rust)

`src-tauri/src/engine_renders.rs` — a separate, versioned disk cache per
instance: `~/.cache/modcanvas/engine_renders_<hash>.json`. It is **not** part of
the compact texture index (which must never hold image bytes) and follows the
same per-instance hashing as the item indexer. Writes are atomic (`.tmp` +
rename). Commands:

- `get_engine_renders_cmd(instancePath)` → `{ itemId: dataUrl }`
- `save_engine_renders_cmd(instancePath, rendered)` → merge + persist

`CACHE_VERSION` is validated on load; bump it if the shape changes.

## Frontend

`frontend/src/services/engine-render.ts`:

- `subscribeEngineRenders` — result callback (injects into the live texture
  index + item registry).
- `queueEngineRenders` — deduped queue; sends `RENDER_ITEMS_REQUEST` when the
  companion is connected, batches of 32, ≤2 attempts per item.
- `getEngineRenderCache` / `persistEngineRenders` — Rust-backed load/save.
- `initEngineRenderListener` — listens for `RENDER_ITEMS_RESULT`.

`QuestBookEditor.tsx` wires it:

- On mount loads the cached renders into `textureIndex` (quest tiles) and the
  item registry (JEI view).
- When the companion connects, queues **all software-baked (`bake:`) item ids**
  plus registry items with no baked texture (the JEI "?" slots) and any texture
  keys that exhausted materialization retries (`subscribeNotFound` in
  `texture-loader.ts`). Keys are normalized to canonical item ids via
  `normalizeItemId`. Baked items **in the current view** are queued with
  `queueEngineRendersPriority` so the visible page upgrades first.
- On each result, injects data URLs into `textureIndex` + `items`, persists, and
  **unmarks the keys as baked** (`unmarkBakedKeys`) so they render pixelated
  (in-game look) instead of smooth-scaled.

### Hide-until-first-load (visual parity)

Software-baked (`bake:`) icons are isometric 3D renders that don't match the
in-game GUI item. `questIconUrl` (in `questIcons.ts`) therefore **hides them
while the companion engine path is active** — the tile shows as pending until a
real engine render lands, then it replaces the bake permanently. Offline (no
companion) keeps the software bake as a fallback.

### One-time load + cache invalidation

The Rust engine-render cache is keyed per instance and **stamped with the
instance's jar signature** (name/size/mtime of `mods/*.jar` + vanilla jars).
On load, a signature mismatch discards the cache, so icons are re-rendered only
after a real pack change; otherwise every subsequent load is instant from disk.

## Cache hygiene

- `prune_caches_cmd(instancePaths, modsDirs)` (in `instance_textures.rs`, wrapping
  `instance_textures/cache.rs::prune_caches`; called automatically once on app
  start from `useAppState`) deletes every
  `instance_textures_*` / `items_*` / `engine_renders_*` / `ingest_*` /
  `textures_*` cache file whose per-path hash no longer matches a known project.
  Stale scans (deleted instances, re-ingests, tests) otherwise accumulate junk —
  one user had 1,344 texture caches totaling ~4.9 GB for two real instances.
- The `mods` DB table is deduplicated at startup (a `UNIQUE(project_id, mod_id)`
  index + a one-time `DELETE ... MIN(id)` cleanup) and `add_mod` upserts. Earlier
  plain-`INSERT` scans appended a full copy every scan, inflating the mods count
  64× (20,355 "mods" for a 319-mod pack).

## Testing notes

- Rust cache round-trips / version-mismatch are covered in
  `src-tauri/src/engine_renders.rs` tests.
- The mod renderer can only be verified in-game: launch the pack with the
  companion deployed, confirm `workbench status` shows "Connected", then open
  ModCanvas and watch missing icons resolve (and persist across restarts).
