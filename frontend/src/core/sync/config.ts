// Hotswap freeze (see todo.md Phase 3).
//
// RELOAD_QUESTS is UN-FROZEN (s42) behind the reload-evidence gate
// (P2-HOTSWAP): the quest Save button now pins the game log position,
// broadcasts the reload, and reports PASS only when FTB's own "Loading
// quests from" line lands after the pin (services/hotswap.ts +
// src-tauri commands/hotswap.rs). A reload without evidence is reported
// FAIL, never claimed. The companion no longer toasts unverifiable success.
//
// RELOAD_KUBEJS_SCRIPTS / RELOAD_CONFIG / RELOAD_CRAFTTWEAKER stay frozen —
// their log signatures have NOT been probed (each has its own evidence
// shape; do not assume it matches quests).
export const HOTSWAP_FROZEN = false
