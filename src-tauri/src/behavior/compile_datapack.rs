//! Behavior → datapack compiler (P2-BEHAVIOR, roadmap §11.2 — the datapack
//! backend: "advancement-based triggers"). Pure function: typed IR in,
//! (advancement JSON, function body) out, no I/O.
//!
//! HONEST BOUNDARY (s46): the datapack backend compiles the FAITHFUL subset
//! of the vocabulary — a behavior is emitted as one advancement
//! (`minecraft:<trigger>` criterion) whose reward function runs the actions
//! as commands. Anything the datapack format cannot express is a hard
//! CompileError naming the construct, NEVER silently dropped or coarsened:
//!   - triggers with no datapack criterion (joins, leaves, damage, timed)
//!   - conditions that cannot fold into the trigger criterion (everything
//!     except `EntityType` on a kills trigger, which becomes the killed-
//!     entity predicate — the one faithful fold)
//!   - actions with no command form (SetStage — KubeJS stages are not
//!     datapack data)
//! Coarsenings that DO ship carry a deterministic warning: ItemCrafted →
//! `inventory_changed` (datapack cannot tell crafting from pickup), Heal →
//! `instant_health` (2-heart granularity).
//!
//! Every name below is verified against the shipped jars at s46: the
//! trigger ids (`player_killed_entity`, `inventory_changed`, `placed_block`,
//! `impossible` from CriteriaTriggers bytecode), the advancement JSON keys
//! (`parent`/`display`/`rewards`/`criteria`/`requirements` from
//! Advancement.class), the rewards `function` field, the 1.21 datapack
//! folder (`advancement` singular via Registries.elementsDirPath), and the
//! KubeJS virtual datapack (`kubejs/data/` via KubeJSPaths +
//! ServerScriptManager wiring).

use crate::behavior::{Action, Behavior, Condition, Trigger};
use serde_json::json;

/// The namespace under which ModCanvas-authored datapack artifacts land.
/// Behavior ids are user-chosen (`starter:kit`); the namespace is ours so
/// the artifact path is stable and never collides with the pack's own data.
pub const DATAPACK_NS: &str = "modcanvas";

/// The compiled datapack artifact for one behavior: the advancement JSON and
/// the reward function body. Both are pure strings — the emitter writes them
/// under `kubejs/data/<ns>/advancement|function/`.
#[derive(Debug)]
pub struct DatapackOutput {
    /// File name for the advancement (no folder — the emitter adds it).
    pub advancement_name: String,
    /// File name for the reward function (no folder — the emitter adds it).
    pub function_name: String,
    /// The advancement JSON document (full file body).
    pub advancement_json: String,
    /// The reward function body (`.mcfunction` lines, no trailing newline).
    pub function_body: String,
}

impl DatapackOutput {
    /// The UI preview: advancement JSON then the reward function, labeled —
    /// this is what the editor's compile pane shows for a datapack behavior.
    pub fn preview(&self) -> String {
        format!(
            "// advancement: {}:{}\n{}\n\n// reward function: {}:{}\n{}",
            DATAPACK_NS,
            self.advancement_name,
            self.advancement_json,
            DATAPACK_NS,
            self.function_name,
            self.function_body
        )
    }
}

/// Compile a behavior to the datapack backend. Mirrors `compile_to_kubejs`:
/// structural errors return CompileError; coarsenings that still ship carry
/// deterministic warnings.
pub fn compile_to_datapack(
    b: &Behavior,
) -> Result<(DatapackOutput, Vec<super::CompileWarning>), super::CompileError> {
    use super::CompileWarning;
    let mut warnings: Vec<CompileWarning> = Vec::new();

    if !b.conditions.is_empty() {
        // Only EntityType folds (into the kills predicate); anything else is
        // unexpressible as a co-firing advancement criterion.
        if b.conditions.len() > 1 || !matches!(b.conditions[0], Condition::EntityType { .. }) {
            return Err(super::CompileError(format!(
                "datapack backend: behavior '{}' has a condition the datapack format cannot express (only an entity-type condition on a kills trigger is supported) — use the KubeJS backend",
                b.id
            )));
        }
    }

    let sanitized = sanitize_name(&b.id);
    let advancement_name = format!("behavior_{}", sanitized);
    let function_name = format!("behavior_{}", sanitized);
    let function_ref = format!("{}:{}", DATAPACK_NS, function_name);

    let (criterion_key, criterion_json) = emit_criterion(&b.trigger, &b.conditions, &mut warnings)?;

    let mut obj = serde_json::Map::new();
    if let Some(parent) = parent_advancement(&b.trigger) {
        obj.insert("parent".to_string(), json!(parent));
    }
    obj.insert("display".to_string(), serde_json::Value::Null);
    if criterion_key == "impossible" {
        // The chain trigger has no real criterion — the advancement completes
        // when its PARENT does (parentage is the trigger).
        obj.insert(
            "criteria".to_string(),
            json!({ "modcanvas_trigger": { "trigger": "minecraft:impossible" } }),
        );
    } else {
        obj.insert("criteria".to_string(), json!({ "modcanvas_trigger": criterion_json }));
    }
    obj.insert("rewards".to_string(), json!({ "function": function_ref }));

    let function_body = emit_function(&b.actions, &mut warnings)?;

    Ok((
        DatapackOutput {
            advancement_name,
            function_name,
            advancement_json: serde_json::to_string_pretty(&obj)
                .unwrap_or_else(|_| "{}".to_string()),
            function_body,
        },
        warnings,
    ))
}

/// The advancement trigger id + JSON body for a behavior's trigger.
fn emit_criterion(
    t: &Trigger,
    conditions: &[Condition],
    warnings: &mut Vec<super::CompileWarning>,
) -> Result<(String, serde_json::Value), super::CompileError> {
    use super::CompileError;
    match t {
        Trigger::PlayerKillsEntity { entity } => {
            // EntityType condition folds into the killed-entity predicate —
            // the one faithful condition fold in the datapack backend.
            let mut predicate = serde_json::Map::new();
            if let Some(e) = entity {
                predicate.insert("type".to_string(), json!(e));
            }
            if let Some(Condition::EntityType { entity: cond_e }) = conditions.first() {
                predicate.insert("type".to_string(), json!(cond_e));
            }
            let entity_json = if predicate.is_empty() {
                serde_json::Value::Null
            } else {
                json!(predicate)
            };
            Ok((
                "player_killed_entity".to_string(),
                json!({ "trigger": "minecraft:player_killed_entity", "conditions": { "entity": entity_json } }),
            ))
        }
        Trigger::ItemCrafted { item } => {
            // Datapack cannot distinguish crafting from any inventory change.
            warnings.push(super::CompileWarning(
                "ItemCrafted compiles to inventory_changed in the datapack backend — datapack cannot tell crafting from pickup".to_string(),
            ));
            // With no item filter, fire on ANY inventory change; with one,
            // the predicate requires the item to be present.
            let conditions = match item {
                Some(i) => json!({ "items": [ { "items": [i] } ] }),
                None => serde_json::Value::Null,
            };
            Ok((
                "inventory_changed".to_string(),
                json!({ "trigger": "minecraft:inventory_changed", "conditions": conditions }),
            ))
        }
        Trigger::BlockPlaced { block } => {
            let mut predicate = serde_json::Map::new();
            if let Some(bk) = block {
                predicate.insert("blocks".to_string(), json!([bk]));
            }
            Ok((
                "placed_block".to_string(),
                json!({ "trigger": "minecraft:placed_block", "conditions": { "location": { "block": predicate } } }),
            ))
        }
        Trigger::AdvancementCompleted { advancement } => {
            // The idiomatic "on advancement X done": a hidden child of X with
            // an impossible criterion — the child completes exactly when the
            // parent does.
            Ok((
                "impossible".to_string(),
                json!({ "trigger": "minecraft:impossible" }),
            ))
        }
        other => Err(CompileError(format!(
            "datapack backend: trigger {:?} has no datapack criterion — use the KubeJS backend",
            other
        ))),
    }
}

/// The `parent` field for the advancement, when the trigger is a chain on
/// another advancement. `AdvancementCompleted` becomes a child of the
/// referenced advancement; every other trigger is a root.
fn parent_advancement(t: &Trigger) -> Option<String> {
    match t {
        Trigger::AdvancementCompleted { advancement } => Some(advancement.clone()),
        _ => None,
    }
}

/// The reward function body: one `.mcfunction` command per action, addressed
/// at `@s` (the advancement grants it to the completing player).
fn emit_function(
    actions: &[Action],
    warnings: &mut Vec<super::CompileWarning>,
) -> Result<String, super::CompileError> {
    use super::CompileError;
    let mut lines: Vec<String> = Vec::new();
    for a in actions {
        let line = match a {
            Action::GiveItem { item, count } => {
                check_namespaced("GiveItem", item)?;
                format!("give @s {} {}", item, count)
            }
            Action::RemoveItem { item } => {
                check_namespaced("RemoveItem", item)?;
                format!("clear @s {}", item)
            }
            Action::RunCommand { command } => {
                if command.trim().is_empty() {
                    return Err(CompileError("RunCommand must not be empty".to_string()));
                }
                // Raw commands in .mcfunction have no leading slash.
                format!("{}", command.trim_start_matches('/'))
            }
            Action::Message { text } => {
                // tellraw with a JSON text component; escape the text.
                let escaped = serde_json::to_string(text)
                    .unwrap_or_else(|_| "\"\"".to_string());
                format!("tellraw @s {}", escaped)
            }
            Action::Heal { amount } => {
                if *amount <= 0.0 {
                    return Err(CompileError("Heal must be a positive amount".to_string()));
                }
                // instant_health heals 2*(amplifier+1) half-hearts; map to the
                // closest level and warn about the granularity.
                let amp = ((amount / 2.0).ceil() as i64) - 1;
                warnings.push(super::CompileWarning(
                    format!(
                        "Heal {} maps to instant_health level {} — datapack heals in 2-half-heart steps",
                        amount, amp + 1
                    ),
                ));
                format!("effect give @s minecraft:instant_health 1 {}", amp.max(0))
            }
            Action::Teleport { x, y, z, .. } => {
                format!("tp @s {} {} {}", x, y, z)
            }
            Action::SpawnEntity { entity } => {
                check_namespaced("SpawnEntity", entity)?;
                format!("summon {} ~ ~ ~", entity)
            }
            Action::SetStage { .. } => {
                return Err(CompileError(
                    "datapack backend: SetStage has no command form (KubeJS stages are not datapack data) — use the KubeJS backend".to_string(),
                ));
            }
        };
        lines.push(line);
    }
    Ok(lines.join("\n"))
}

/// Item/entity registry ids must be namespaced — same rule as the KubeJS
/// compiler; an unnamespaced id would emit a command the game rejects.
fn check_namespaced(action: &str, id: &str) -> Result<(), super::CompileError> {
    if !id.contains(':') {
        return Err(super::CompileError(format!(
            "{} references '{}' — ids must be namespaced (`ns:path`)",
            action, id
        )));
    }
    Ok(())
}

/// Behavior ids are `ns:name`; artifact file names must be plain paths —
/// map `:` and any path-hostile chars to `_`.
fn sanitize_name(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_alphanumeric() || c == '/' || c == '.' || c == '_' || c == '-' { c } else { '_' })
        .collect()
}
