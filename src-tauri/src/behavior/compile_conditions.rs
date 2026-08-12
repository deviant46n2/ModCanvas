//! Condition → KubeJS guard emission. Each condition compiles to a
//! `return` guard inside the event handler: if the condition fails, the
//! actions never run. All emitted accessors are verified against the
//! shipped KubeJS jar at s46:
//!   - `player.mainHandItem.id`      — LivingEntityKJS.kjs$getMainHandItem,
//!                                     ItemStackKJS.kjs$getId
//!   - `player.inventory.count(id)`  — PlayerKJS.kjs$getInventory,
//!                                     InventoryKJS.kjs$count(ItemPredicate)
//!   - `event.entity.type`           — EntityKJS.kjs$getType (String)
//!   - `player.level.dimension`      — EntityKJS.kjs$getLevel,
//!                                     LevelKJS.kjs$getDimension (RL; `==`
//!                                     compares its toString in KubeJS)
//!   - `Math.random() < chance`      — pure JS
//!   - `player.health`               — vanilla LivingEntity#getHealth exposed
//!                                     through the KubeJS wrapper
//!
//! An `EntityType` condition on a trigger with no entity in scope is a
//! CompileError — the compiler refuses rather than emitting a guard that
//! could never see the entity it tests.

use super::compile::js_quote;
use super::{CompileError, CompileWarning, Condition};

pub(crate) fn emit_condition(
    c: &Condition,
    subject: &str,
    indent: usize,
    lines: &mut Vec<String>,
    warnings: &mut Vec<CompileWarning>,
) -> Result<(), CompileError> {
    let pad = "  ".repeat(indent);
    let guard = match c {
        Condition::ItemHeld { item } => format!(
            "if ({}.mainHandItem.id != {}) return;",
            subject,
            js_quote(item)
        ),
        Condition::ItemInInventory { item, min_count } => format!(
            "if ({}.inventory.count({}) < {}) return;",
            subject,
            js_quote(item),
            min_count
        ),
        Condition::EntityType { entity } => {
            // The entity being tested is the EVENT's entity, not the action
            // subject (on kills the subject is the killer player). Emitted
            // against `event.entity`; only meaningful on entity-scoped
            // triggers — enforced by the caller.
            format!("if (event.entity.type != {}) return;", js_quote(entity))
        }
        Condition::Dimension { dimension } => format!(
            "if ({}.level.dimension != {}) return;",
            subject,
            js_quote(dimension)
        ),
        Condition::RandomChance { chance } => {
            if !(0.0..=1.0).contains(chance) {
                return Err(CompileError(format!(
                    "RandomChance must be between 0.0 and 1.0, got {}",
                    chance
                )));
            }
            format!("if (Math.random() >= {}) return;", chance)
        }
        Condition::HealthBelow { health } => {
            if *health <= 0.0 {
                return Err(CompileError(
                    "HealthBelow must be a positive half-heart amount".to_string(),
                ));
            }
            format!("if ({}.health >= {}) return;", subject, health)
        }
    };
    lines.push(format!("{}{}", pad, guard));
    let _ = warnings; // no warnings today; kept for signature symmetry
    Ok(())
}

/// True when a trigger puts an entity into `event.entity` (death, hurt,
/// crafted, picked up, placed, broken) — the only place an `EntityType`
/// condition can see anything.
pub(crate) fn trigger_has_entity(t: &crate::behavior::Trigger) -> bool {
    use crate::behavior::Trigger::*;
    matches!(
        t,
        PlayerKillsEntity { .. }
            | PlayerTakesDamage
            | ItemCrafted { .. }
            | ItemPickedUp { .. }
            | BlockPlaced { .. }
            | BlockBroken { .. }
    )
}
