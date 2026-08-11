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
// RELOAD_KUBEJS_SCRIPTS is ENABLED (s44) behind a two-line evidence gate.
// The KubeJS reload is a two-command sequence (kubejs reload server-scripts
// + vanilla /reload — verified against the shipped 2101.7.2 jar: bare
// `kubejs reload` has NO executor, and the script reload alone does not
// apply recipes). The evidence matcher requires BOTH lines after the pin:
// "KubeJS server scripts in" (script reload) and "Server resource reload
// complete!" (datapack apply). The recipe save broadcasts and reports
// PASS/FAIL like quests.
//
// RELOAD_CONFIG / RELOAD_CRAFTTWEAKER are DISABLED — their log signatures
// have NOT been probed (each has its own evidence shape; do not assume it
// matches quests or kubejs). Their save paths must not fire unverified
// reloads: that was silent divergence.
export const QUEST_HOTSWAP_ENABLED = true
export const KUBEJS_HOTSWAP_ENABLED = true

// sync-pipeline compat: the dormant quest-reload path follows the quest gate.
export const HOTSWAP_FROZEN = !QUEST_HOTSWAP_ENABLED
