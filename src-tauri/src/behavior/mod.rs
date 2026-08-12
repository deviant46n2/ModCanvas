//! Behavior system IR (P2-BEHAVIOR, roadmap §11).
//!
//! A behavior is a constrained Trigger → Conditions → Actions rule, the
//! "when X, if Y, do Z" model the roadmap mandates (§11.1 — deliberately NOT
//! a generic visual programming language). The IR is a plain typed model,
//! versioned, private to the app: the compiled output is always real KubeJS /
//! datapack artifacts, never a lock-in.
//!
//! Chunk 1 (s44 close → this): the IR shape with ONE trigger and ONE action
//! implemented end-to-end — `PlayerJoinsGame` → `GiveItem` (the starter-kit
//! behavior) — plus the golden-output compiler tests that lock the emitted
//! string. The remaining §11.1 vocabulary is added variant-by-variant as each
//! compile path lands; the enum shape below leaves room without modeling
//! everything up front.
//!
//! Deliberately out of scope here: persistence (`.modcanvas/behaviors.json`
//! — comes with the editor chunk), the Tauri command, UI cards, Pack Index
//! wiring, and in-game verification (later node; golden tests lock the string,
//! a real KubeJS run proves the API — the roadmap's own risk framing).

pub mod compile;
#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};

/// A user-authored behavior: when the trigger fires, if all conditions hold,
/// run the actions in order.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Behavior {
    /// Stable id, `ns:name` (e.g. `starter:kit`).
    pub id: String,
    /// Human-readable name for editors and generated-script comments.
    pub name: String,
    pub trigger: Trigger,
    /// All conditions must hold for the actions to run. Empty = unconditional.
    pub conditions: Vec<Condition>,
    /// Executed in order when the trigger fires and conditions pass.
    pub actions: Vec<Action>,
}

/// What starts the rule. §11.1 MVP list: player joins / leaves dimension,
/// player takes damage, player kills entity, item crafted / picked up, block
/// placed / broken, advancement completed, quest completed, timed, world
/// spawn. Added variant-by-variant as each compile path lands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Trigger {
    /// `PlayerEvents.loggedIn` — fires once when a player joins the server.
    PlayerJoinsGame,
}

/// Guard clauses on the trigger. §11.1 MVP list: item held / in inventory,
/// entity type, dimension, biome, quest state, progression stage, numeric
/// comparison, random chance. Empty for chunk 1; the enum is the reserved
/// shape, not a promise of implementation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Condition {}

/// What the rule does. §11.1 MVP list: give / remove items, spawn entity,
/// damage / heal, teleport, run command, play sound, set quest state, unlock
/// progression stage, toast/message. Added variant-by-variant.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    /// Give an item stack to the player who triggered the rule.
    GiveItem {
        /// Item registry id, `ns:path` (e.g. `minecraft:diamond`).
        item: String,
        /// Stack size. 1 when omitted at the call site.
        #[serde(default = "one")]
        count: u32,
    },
}

fn one() -> u32 {
    1
}
