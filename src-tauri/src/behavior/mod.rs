//! Behavior system IR (P2-BEHAVIOR, roadmap §11).
//!
//! A behavior is a constrained Trigger → Conditions → Actions rule, the
//! "when X, if Y, do Z" model the roadmap mandates (§11.1 — deliberately NOT
//! a generic visual programming language). The IR is a plain typed model,
//! versioned, private to the app: the compiled output is always real KubeJS /
//! datapack artifacts, never a lock-in.
//!
//! Vocabulary status (s46): the §11.1 MVP lists are implemented — 10
//! triggers, 6 conditions, 8 actions, each variant mapped to an API VERIFIED
//! against the shipped KubeJS jar (2101.7.2-build.368) before being emitted
//! (the §21 risk #3 discipline: golden tests lock the STRING, jar bytecode
//! locks the API, the in-game smoke test locks the runtime). Anything outside
//! the vocabulary is the `run_command` escape hatch, visibly labeled in the
//! editor — the roadmap's "veteran's release valve, not the beginner's trap".
//!
//! Deliberately out of scope here: persistence (`.modcanvas/behaviors.json`
//! — `store.rs`), the Tauri commands (`commands/behavior.rs`), the datapack
//! backend compiler (`compile_datapack`), Pack Index wiring, and in-game
//! verification (later node; golden tests lock the string, a real KubeJS run
//! proves the API — the roadmap's own risk framing).

pub mod compile;
pub mod compile_actions;
pub mod compile_conditions;
pub mod compile_datapack;
pub mod emit;
pub mod store;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_datapack;

pub use compile::{CompileError, CompileOutput, CompileWarning};

use serde::{Deserialize, Serialize};

/// A user-authored behavior: when the trigger fires, if all conditions hold,
/// run the actions in order.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Behavior {
    /// Stable id, `ns:name` (e.g. `starter:kit`).
    pub id: String,
    /// Human-readable name for editors and generated-script comments.
    pub name: String,
    /// The compiler that emits this behavior. Defaults to kubejs so behaviors
    /// authored before the datapack backend (s46) keep loading unchanged.
    #[serde(default, skip_serializing_if = "is_kubejs")]
    pub backend: Backend,
    pub trigger: Trigger,
    /// All conditions must hold for the actions to run. Empty = unconditional.
    pub conditions: Vec<Condition>,
    /// Executed in order when the trigger fires and conditions pass.
    pub actions: Vec<Action>,
}

/// Which compiler emits this behavior. One backend per behavior — the game
/// can only run the artifact once; emitting both would double-fire every
/// rule. The KubeJS backend is the full vocabulary; the datapack backend is
/// the faithful vanilla subset (see `compile_datapack.rs`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Backend {
    /// KubeJS server script — every trigger/condition/action compiles.
    #[default]
    Kubejs,
    /// Vanilla datapack advancement + reward function — faithful subset only.
    Datapack,
}

fn is_kubejs(b: &Backend) -> bool {
    matches!(b, Backend::Kubejs)
}

/// What starts the rule. §11.1 MVP list, implemented variant-by-variant as
/// each compile path lands. Optional target fields map to KubeJS targeted
/// event handlers: `None` = the event fires for ANY subject (the base
/// listener container, verified in `EventHandlerContainer`), `Some` = the
/// event only fires for that registry id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Trigger {
    /// `PlayerEvents.loggedIn` — fires once when a player joins the server.
    PlayerJoinsGame,
    /// `PlayerEvents.loggedOut` — fires when a player leaves the server.
    PlayerLeavesGame,
    /// `EntityEvents.afterHurt('minecraft:player', …)` — a player took damage.
    PlayerTakesDamage,
    /// `EntityEvents.death(<entity>, …)` — an entity died AND the killer was
    /// a player (`event.source.player`, the DamageSourceMixin accessor).
    /// `entity: None` = any entity death by a player.
    PlayerKillsEntity {
        /// Dying entity's registry id (e.g. `minecraft:zombie`). None = any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        entity: Option<String>,
    },
    /// `ItemEvents.crafted(<item>, …)` — a player crafted an item.
    ItemCrafted {
        /// Crafted item's registry id. None = any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        item: Option<String>,
    },
    /// `ItemEvents.pickedUp(<item>, …)` — a player picked an item up.
    ItemPickedUp {
        /// Picked item's registry id. None = any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        item: Option<String>,
    },
    /// `BlockEvents.placed(<block>, …)` — a block was placed (by anyone;
    /// the compiler guards the placer to be a player).
    BlockPlaced {
        /// Placed block's registry id. None = any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        block: Option<String>,
    },
    /// `BlockEvents.broken(<block>, …)` — a block was broken by a player.
    BlockBroken {
        /// Broken block's registry id. None = any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        block: Option<String>,
    },
    /// `PlayerEvents.advancement(<id>, …)` — a player completed an advancement.
    AdvancementCompleted {
        /// The advancement's full id (e.g. `minecraft:story/root`).
        advancement: String,
    },
    /// `ServerEvents.loaded` + `scheduleRepeatingInTicks` — every N ticks,
    /// the actions run for EVERY online player. The only server-context
    /// trigger; the subject is a loop variable, not a single event player.
    TimedEvery {
        /// Interval in ticks (20 = 1 second).
        ticks: u32,
    },
}

/// Guard clauses on the trigger. §11.1 MVP list; each variant's compile path
/// emits a `return` guard inside the event handler. The subject is the same
/// expression the actions use (see `compile.rs` subject binding).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Condition {
    /// `player.mainHandItem.id == item` — the trigger subject is holding it.
    ItemHeld {
        /// Item registry id.
        item: String,
    },
    /// `player.inventory.count(item) >= min_count`.
    ItemInInventory {
        /// Item registry id.
        item: String,
        /// Minimum count for the condition to pass.
        #[serde(default = "one_u32")]
        min_count: u32,
    },
    /// `event.entity.type == entity` — only meaningful on entity-scoped
    /// triggers (kills, damage); a CompileError on triggers with no entity.
    EntityType {
        /// Entity registry id (e.g. `minecraft:zombie`).
        entity: String,
    },
    /// `player.level.dimension == dimension` — the subject's dimension.
    Dimension {
        /// Dimension id (e.g. `minecraft:overworld`).
        dimension: String,
    },
    /// `Math.random() < chance` — probability gate.
    RandomChance {
        /// 0.0..1.0 — the fraction of fires that pass.
        chance: f64,
    },
    /// `player.health < health` — the subject is hurt below this amount.
    HealthBelow {
        /// Half-hearts threshold.
        health: f32,
    },
}

/// What the rule does. §11.1 MVP list; each variant's compile path emits the
/// verified KubeJS call. `run_command` is the escape hatch — anything outside
/// the vocabulary, visibly labeled in the editor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    /// Give an item stack to the trigger subject.
    GiveItem {
        /// Item registry id, `ns:path` (e.g. `minecraft:diamond`).
        item: String,
        /// Stack size. 1 when omitted at the call site.
        #[serde(default = "one_u32")]
        count: u32,
    },
    /// Remove ALL of an item from the subject's inventory
    /// (`player.inventory.clear(id)`).
    RemoveItem {
        /// Item registry id.
        item: String,
    },
    /// Run a raw command on the server (`event.server.runCommandSilent`).
    /// The veteran's escape hatch — everything outside the vocabulary.
    RunCommand {
        /// Full command string WITHOUT the leading `/`.
        command: String,
    },
    /// Send the subject a chat message (`player.tell`).
    Message {
        /// The message text.
        text: String,
    },
    /// Heal the subject by the given half-hearts (`player.heal(amount)`).
    Heal {
        /// Half-hearts to restore.
        #[serde(default = "four_f32")]
        amount: f32,
    },
    /// Teleport the subject (`player.setPositionAndRotation`).
    Teleport {
        x: f64,
        y: f64,
        z: f64,
        /// Facing yaw. 0 when omitted.
        #[serde(default)]
        yaw: f32,
        /// Facing pitch. 0 when omitted.
        #[serde(default)]
        pitch: f32,
    },
    /// Spawn an entity at the subject's position (`player.level.spawnEntity`).
    SpawnEntity {
        /// Entity registry id (e.g. `minecraft:creeper`).
        entity: String,
    },
    /// Add a KubeJS stage to the subject (`player.stages.add(stage)`).
    SetStage {
        /// Stage name (plain string, e.g. `starter_complete`).
        stage: String,
    },
}

fn one_u32() -> u32 {
    1
}

fn four_f32() -> f32 {
    4.0
}
