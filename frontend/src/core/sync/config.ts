// Hotswap gates (P2-HOTSWAP, roadmap §13). Per-type: a reload type is enabled
// only when its evidence shape has been probed in-game — the app must never
// claim (or silently fire) a reload it cannot verify.
//
// RELOAD_QUESTS is ENABLED (s42) behind the reload-evidence gate: the quest
// Save button pins the game log position, broadcasts the reload, and reports
// PASS only when FTB's own "Loading quests from" line lands after the pin
// (services/hotswap.ts + src-tauri commands/hotswap.rs). A reload without
// evidence is reported FAIL, never claimed. The companion no longer toasts
// unverifiable success, and (s43) dispatches through the integrated server's
// own command source so FTB's editor-permission gate is bypassed.
//
// RELOAD_KUBEJS_SCRIPTS / RELOAD_CONFIG / RELOAD_CRAFTTWEAKER are DISABLED —
// their log signatures have NOT been probed (each has its own evidence
// shape; do not assume it matches quests). The recipe save must not fire
// RELOAD_KUBEJS_SCRIPTS while unverified: that was silent divergence.
export const QUEST_HOTSWAP_ENABLED = true
export const KUBEJS_HOTSWAP_ENABLED = false

// sync-pipeline compat: the dormant quest-reload path follows the quest gate.
export const HOTSWAP_FROZEN = !QUEST_HOTSWAP_ENABLED
