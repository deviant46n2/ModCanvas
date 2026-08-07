# Engine-Rendered Icons (Companion Mod)

When an item icon can't be shown as a flat texture — block items, hand-modeled
3D items, custom mod models, fluids — the icon comes out blank offline. The
companion mod closes that gap by rendering the item **in-game with the real
Minecraft item renderer** and sending the PNG back to ModCanvas, which caches
it on disk.

This is opt-in and offline-first: nothing is bundled, and everything is lazy —
icons are only produced for items the local pipeline actually flagged as
needing a render, and only while the game (with the companion) is running. The
app prompts the user to run the instance while any such icons remain (see
"Run-the-instance prompt" below).

## Protocol

Events over the WebSocket IPC hub (`src-tauri/src/ws_ipc.rs`, protocol types in
`src-tauri/src/ws_protocol.rs`):

| Event | Direction | Payload |
|---|---|---|
| `RENDER_ITEMS_REQUEST` | ModCanvas → game | `{ requestId, size, items: ["modid:item", …] }` |
| `RENDER_ITEMS_RESULT` | game → ModCanvas | `{ requestId, rendered: { "modid:item": "data:image/png;base64,…" } }` |
| `CONNECTION_STATUS` | server → app | `{ connected, clientCount, port }` |

The frontend joins the hub itself as a peer (`frontend/src/services/
companion-socket.ts`, `CLIENT_INFO` role `modcanvas-app`). The server
classifies peers by role and routes companion frames (results, identity,
ASSETS_READY) to the app peer over its socket. The Tauri event channel
(`ws-ipc:status`/`ws-ipc:event`) is still emitted alongside, but the frontend
no longer depends on it — it silently drops Rust→webview events on some
Linux/WebKitGTK stacks (evals from async commands never run).

Batches are capped (`engine-render.ts` sends ≤32 per request) and the game
renders **16 items per client tick** (`ItemRenderQueue.PER_TICK`) so a large
batch never freezes a frame; the result is sent as one reply when the queue
drains.

## Companion mod (1.21.1 NeoForge)

- `workbench-companion-neoforge-1.21/…/client/ItemIconRenderer.java` — the
  actual renderer. On the render thread it:
  1. Mirrors the game's GUI projection exactly (ortho over the target +
     model-view Z translate `10000 - getGuiFarPlane()`; the translate must land
     geometry in **negative** view-z — the near/far are distances in front of
     the camera, and positive z is behind it, where every draw clips silently).
  2. Binds a 64×64 `TextureTarget` (transparent clear), then for each item:
     collects the model's baked quads (**all 6 directions + null, seed 42** —
     cube quads are filed by direction, so a null-only query returns nothing
     for blocks), measures the **projected** bounds through the GUI display
     transform, and builds a pose that fits those bounds to ~90% of the tile
     (model spaces vary: 0..16 blocks to 0..1 custom items, and display
     transforms rotate — the fit must measure post-transform geometry).
  3. Draws the quads directly (Tesselator + `position_tex` + the block atlas,
     UVs at BLOCK-format ints 4-5) — the `GuiGraphics` flush path's deferred
     shader binds never apply in the offscreen tick context. Depth testing is
     left on so cube faces occlude correctly. The atlas's mipmapped filters
     are overridden to mip-0 `GL_LINEAR` before the batch (captures are pure
     magnification, so mip sampling can only upscale a downsampled sprite =
     blur) and restored in `finally` so the game world's sampling is untouched.
  4. Reads the framebuffer back with `NativeImage.downloadTexture` (already
     upright — **no row flip**; a flip inverts every icon), PNG-encodes
     (`asByteArray`) and base64-encodes it.
  5. Restores GL state (projection, model-view, main framebuffer).
- `ItemRenderQueue.java` — per-tick throttling (16/tick) + retry-on-failure:
  early renders hit un-baked models, so failed items re-queue up to
  `MAX_ATTEMPTS` (3) before being dropped; result accumulation.
- `WorkbenchEventHandler.java` — handles `RENDER_ITEMS_REQUEST` (works from the
  main menu too; only reload commands require a player).

Known limits: items whose models never bake (e.g. broken wall-model JSONs in
some packs) fail permanently and are dropped after the retry cap; models with
no baked quads at all (custom-renderer blocks) render blank. Rendered icons
magnify a 16px sprite to ~58px with mip-0 bilinear sampling — fidelity is
close to the game's GUI but not pixel-identical; supersampling (render at 2x,
downscale) is a pending sharpness fix beyond bilinear magnification.

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
- `queueEngineRenders` — deduped queue (O(1) membership via a Set mirror — the
  queue can hold full instance registries, so array scans are never allowed);
  sends `RENDER_ITEMS_REQUEST` when the companion is connected, batches of 32,
  ≤2 attempts per item. An id that exhausts its attempts is marked **failed
  for the session** — both when the companion stays silent (30s timeout) and
  when a batch comes back without it (the companion skips unrenderable ids,
  so a partial result is still a failed attempt for the missing ids). Without
  a terminal state, the effects re-offer missing ids on every state change
  and the pipeline churns unrenderable items forever. A dropped companion
  (broadcast failure) is *not* terminal — a reconnect may legitimately retry.
- `getEngineRenderCache` / `persistEngineRenders` — Rust-backed load/save.
- `initEngineRenderListener` — subscribes to the companion socket for
  `RENDER_ITEMS_RESULT` (was: Tauri `ws-ipc:event` listener).

`QuestBookEditor.tsx` wires it:

- On mount loads the cached renders into `textureIndex` (quest tiles) and the
  item registry (JEI view).
- When the companion connects, queues **all software-baked (`bake:`) item ids**
  plus registry items with **no texture entry at all** (the JEI "?" slots) and
  any texture keys that exhausted materialization retries (`subscribeNotFound`
  in `texture-loader.ts`). Keys are normalized to canonical item ids via
  `normalizeItemId`. Baked items **in the current view** are queued with
  `queueEngineRendersPriority` so the visible page upgrades first. The "no
  entry at all" test is checked against the live texture index — items with a
  `jar:`/`kubejs:` descriptor materialize offline and are never sent to the
  engine, and `bake:` entries are covered by the baked-keys queue.
- On each result, injects data URLs into `textureIndex` + `items`, persists, and
  **unmarks the keys as baked** (`unmarkBakedKeys`) so they render pixelated
  (in-game look) instead of smooth-scaled.

### Merge discipline & once-per-instance offering

`useQuestAssetPipeline.ts` guards the live texture index against churn. The
index holds two kinds of values — compact descriptors (`jar:`/`kubejs:`/`bake:`)
from scans/ingests and displayable data URLs (offline materializer + engine
renders) — and all merges are directional:

- Scan/ingest merges are **no-downgrade**: an existing entry is never
  overwritten, so a rendered data URL can't be flipped back to a descriptor
  (which would blink the icon to a placeholder and re-queue it).
- Offline-materializer injects are **upgrade-only**: a data URL is written only
  where the current value isn't already displayable, so a render that landed
  between plan-build and apply wins.
- Baked (`bake:`) keys are offered to the engine **once per instance
  registration** (`queuedBakedRef`); retries after that belong to the
  engine-render failed-set (`MAX_ATTEMPTS`), not to index-churn re-offers.
- The "registry item with no texture entry" queue is gated until the texture
  index lands, so boot can't dump the whole registry into the engine queue.
- `withItemTextures` is reference-stable: it returns the previous `items` array
  when nothing changed, so identity-based consumers don't re-run per batch.

### Hide until engine-rendered (no offline placeholder)

`bake:` descriptors (3D block/hand-modeled items) are never materialized
offline — `resolve_texture_urls` skips them and `questIconUrl` returns no URL,
so the tile renders blank until a real engine render lands. Once the companion
renders an item, the data URL replaces the descriptor in the live index and
persists to disk, so it survives restarts. `isTexturePending` explicitly
excludes `bake:` keys so these tiles don't shimmer forever.

### Run-the-instance prompt

Since 3D icons require the game, a pack loaded with any still-baked item shows
an `EngineRenderPrompt` banner (`frontend/src/components/quest/EngineRenderPrompt.tsx`):

- **Game not connected:** "Some item icons can't be resolved offline (N need the
  game's renderer). Run the instance to capture real textures." with a **Run
  Instance** button (reuses the header Test/launch action — the game boots, the
  companion connects, and the baked icons are queued, rendered and cached) and a
  dismiss control (session-scoped).
- **Game connected:** the banner switches to "Capturing item textures from the
  game… (N remaining)" and hides itself once every software bake has been
  replaced by a real engine icon.

The banner is driven by reactive baked-key tracking in `texture-loader.ts`
(`subscribeBakedKeys` / `getBakedTextureCount`): keys are marked baked when a
`bake:` descriptor enters the index and unmarked as engine renders replace
them, so the count — and the banner — clear automatically.

### One-time load + cache invalidation

The Rust engine-render cache is keyed per instance and **stamped with the
instance's jar signature** (name/size/mtime of `mods/*.jar` + vanilla jars).
On load, a signature mismatch discards the cache, so icons are re-rendered only
after a real pack change; otherwise every subsequent load is instant from disk.

## Runtime texture extraction (non-item gaps)

Item icons are handled by engine-render above. **Non-item** textures — quest
backgrounds, chapter images, GUI/theme assets, custom image components — can
also only exist at runtime (generated by mod code, not present as files the
offline index can find). The companion closes that gap with a second,
request-driven channel that enumerates the in-game `ResourceManager`:

| Event | Direction | Payload |
|---|---|---|
| `EXTRACT_TEXTURES_REQUEST` | ModCanvas → game | `{ requestId, namespaces: ["ftbquests", …], maxTextures? }` |
| `EXTRACT_TEXTURES_RESULT` | game → ModCanvas | `{ requestId, textures: { "ns:textures/…/name.png": "data:…" } }` |

**Strategy: enumerate-then-merge, scoped.** The frontend derives the
quest-referenced namespaces from the graph's non-item asset keys
(`chapter.background_image`, `chapter.images[].image`, book/chapter/node icons
that look like texture paths rather than item ids) plus `ftbquests` for the
GUI/theme, and sends one request per pack. The companion enumerates every PNG
the ResourceManager can resolve for those namespaces (capped at
`AssetExporter.DEFAULT_MAX_TEXTURES = 2000`), base64-encodes each, and streams
the map back keyed by full resource location.

- Companion: `AssetExporter.extract(WorkbenchEvent)` (generalized from the old
  one-shot `export()`; the narrow `ASSETS_READY` theme path is kept as-is).
  Handled in `WorkbenchEventHandler` before the player check — ResourceManager
  lookup works from the main menu.
- Frontend: `frontend/src/services/runtime-textures.ts` — `requestRuntimeTextures`,
  `subscribeRuntimeTextures` / `initRuntimeTextureListener`, and pure helpers
  `questRuntimeNamespaces`, `runtimeTextureKeyForms`, `mergeRuntimeTextures`,
  `isTextureReference`.
- Persistence: `src-tauri/src/runtime_textures.rs` — a disk cache mirroring
  `engine_renders` (`runtime_textures_<hash>.json`, versioned + jar-signature
  validated, atomic writes). Commands `get_runtime_textures_cmd` /
  `save_runtime_textures_cmd`.

On `EXTRACT_TEXTURES_RESULT` (and on open, from the cache), the textures are
merged into the live texture index under the same key forms the ingest scan
uses (`ns:path`, `ns:textures/path`, `ns:textures/path.png`) with **runtime
captures taking precedence** over the offline index — they are the real
in-game appearance.

## Cache hygiene

- `prune_caches_cmd(instancePaths, modsDirs)` (in `instance_textures.rs`, wrapping
  `instance_textures/cache.rs::prune_caches`; called automatically once on app
  start from `useAppState`) deletes every
  `instance_textures_*` / `items_*` / `engine_renders_*` / `runtime_textures_*` /
  `ingest_*` / `textures_*` cache file whose per-path hash no longer matches a
  known project.
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
