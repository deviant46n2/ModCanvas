// Hotswap freeze (see todo.md Phase 3).
//
// The in-game hot-reload path (`RELOAD_QUESTS`, `RELOAD_KUBEJS_SCRIPTS`,
// `SyncPipeline.broadcastReload`) is FROZEN: saves still export to disk and
// persist, but no reload command is pushed to a running game. The WS server,
// engine-render capture, and runtime texture extraction stay live.
//
// The send-sites keep their code (dormant, importable) so the path can be
// re-enabled later; set this flag to `false` to un-freeze.
export const HOTSWAP_FROZEN = true
