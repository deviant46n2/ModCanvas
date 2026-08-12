//! Action → KubeJS emission. Each action compiles to one or more lines in
//! the event handler body, addressed at the trigger's subject expression.
//! All emitted calls are verified against the shipped KubeJS jar at s46:
//!   - `player.give(...)`           — PlayerKJS.kjs$give(ItemStack)
//!   - `player.inventory.clear(id)` — InventoryKJS.kjs$clear(ItemPredicate)
//!   - `event.server.runCommandSilent(...)` — MinecraftServerKJS
//!   - `player.tell(...)`           — EntityKJS.kjs$tell(Component)
//!   - `player.heal(...)`           — vanilla LivingEntity#heal via wrapper
//!   - `player.setPositionAndRotation(...)` — ServerPlayerKJS
//!   - `player.level.spawnEntity(...)`      — LevelKJS
//!   - `player.stages.add(...)`     — PlayerKJS.kjs$getStages, Stages.add

use super::compile::js_quote;
use super::{Action, CompileError, CompileWarning};

pub(crate) fn emit_action(
    a: &Action,
    subject: &str,
    indent: usize,
    lines: &mut Vec<String>,
    warnings: &mut Vec<CompileWarning>,
) -> Result<(), CompileError> {
    let pad = "  ".repeat(indent);
    let line = match a {
        Action::GiveItem { item, count } => {
            check_namespaced("GiveItem", item)?;
            let arg = if *count == 1 {
                js_quote(item)
            } else {
                format!("Item.of({}, {})", js_quote(item), count)
            };
            format!("{}.give({})", subject, arg)
        }
        Action::RemoveItem { item } => {
            check_namespaced("RemoveItem", item)?;
            format!("{}.inventory.clear({})", subject, js_quote(item))
        }
        Action::RunCommand { command } => {
            if command.trim().is_empty() {
                return Err(CompileError("RunCommand must not be empty".to_string()));
            }
            if command.trim_start().starts_with('/') {
                warnings.push(CompileWarning(
                    "RunCommand starts with '/', which the game strips anyway".to_string(),
                ));
            }
            // runCommandSilent runs on the SERVER; the subject is irrelevant.
            format!("event.server.runCommandSilent({})", js_quote(command))
        }
        Action::Message { text } => format!("{}.tell({})", subject, js_quote(text)),
        Action::Heal { amount } => {
            if *amount <= 0.0 {
                return Err(CompileError("Heal must be a positive amount".to_string()));
            }
            format!("{}.heal({})", subject, amount)
        }
        Action::Teleport { x, y, z, yaw, pitch } => format!(
            "{}.setPositionAndRotation({}, {}, {}, {}, {})",
            subject, x, y, z, yaw, pitch
        ),
        Action::SpawnEntity { entity } => {
            check_namespaced("SpawnEntity", entity)?;
            format!("{}.level.spawnEntity({}, e => {{}})", subject, js_quote(entity))
        }
        Action::SetStage { stage } => {
            if stage.trim().is_empty() {
                return Err(CompileError("SetStage must not be empty".to_string()));
            }
            format!("{}.stages.add({})", subject, js_quote(stage))
        }
    };
    lines.push(format!("{}{}", pad, line));
    Ok(())
}

/// Item/entity registry ids must be namespaced (`ns:path`) — an unnamespaced
/// id is a structural error, matching the GiveItem rule.
fn check_namespaced(action: &str, id: &str) -> Result<(), CompileError> {
    if !id.contains(':') {
        return Err(CompileError(format!(
            "{} references '{}' — ids must be namespaced (`ns:path`)",
            action, id
        )));
    }
    Ok(())
}
