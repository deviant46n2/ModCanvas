//! Behavior → KubeJS compiler (P2-BEHAVIOR, roadmap §11.2). Pure function:
//! typed IR in, script string out, no I/O. The output is real KubeJS `.js`
//! that rides the same evidence loop the hotswap gate uses (the script is a
//! server script; `kubejs reload server-scripts` picks it up).
//!
//! Golden-output tests (`tests.rs`) lock every emitted string byte-for-byte.
//! That locks the STRING, not the API: every event name, method, and
//! accessor here was verified against the shipped KubeJS 2101.7.2 jar at
//! s46 (javap on PlayerEvents/EntityEvents/BlockEvents/ItemEvents/
//! ServerEvents, PlayerKJS/ServerPlayerKJS/LivingEntityKJS/EntityKJS,
//! InventoryKJS, DamageSourceMixin, Stages) — the §21 risk #3 discipline.
//! In-game verification against a real instance is the arc's final node.
//!
//! SUBJECT BINDING (the s46 architecture): actions run against a subject,
//! but the subject expression differs per trigger. Conditions and actions
//! address `subject`; triggers that can fire without a player emit a
//! `guard` binding (`const player = …; if (!player) return;`):
//!   - always-player triggers (joins, crafted, picked up, advancement):
//!     subject `event.player`, no guard.
//!   - nullable triggers (block placed/broken): subject `player`, guard
//!     `event.player` — the placer may be a piston.
//!   - kills: subject `player`, guard `event.source.player` — the dying
//!     entity's killer; the guard IS the "player kills" semantic.
//!   - timed: subject `player` (the `forEach` loop variable over online
//!     players), no guard.

use super::compile_actions::emit_action;
use super::compile_conditions::emit_condition;
use super::{Backend, Behavior, Trigger};
use serde::Serialize;

/// Compile-time validation failure — the behavior IR cannot be emitted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CompileError(pub String);

/// A non-fatal note about the compiled script. Deterministic — same IR
/// always yields the same warnings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CompileWarning(pub String);

/// The result of a compile attempt, shaped for the frontend: a behavior
/// either compiles to an artifact (with deterministic warnings) or fails with
/// a reason, for ONE backend. The `backend` field tells the UI which
/// artifact it is previewing — a behavior compiles to exactly one backend
/// (kubejs = the full vocabulary; datapack = the faithful vanilla subset).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CompileOutput {
    Ok {
        backend: Backend,
        script: String,
        warnings: Vec<CompileWarning>,
    },
    Err {
        backend: Backend,
        reason: String,
    },
}

impl CompileOutput {
    /// Compile a behavior into the UI-facing shape, on its declared backend.
    pub fn from_behavior(b: &Behavior) -> Self {
        match b.backend {
            Backend::Kubejs => match compile_to_kubejs(b) {
                Ok((script, warnings)) => CompileOutput::Ok {
                    backend: Backend::Kubejs,
                    script,
                    warnings,
                },
                Err(e) => CompileOutput::Err {
                    backend: Backend::Kubejs,
                    reason: e.0,
                },
            },
            Backend::Datapack => match super::compile_datapack::compile_to_datapack(b) {
                Ok((out, warnings)) => CompileOutput::Ok {
                    backend: Backend::Datapack,
                    script: out.preview(),
                    warnings,
                },
                Err(e) => CompileOutput::Err {
                    backend: Backend::Datapack,
                    reason: e.0,
                },
            },
        }
    }
}

/// The result of trigger emission: opening lines, the subject expression
/// actions/conditions address, an optional guarded binding line, the closing
/// lines, and the indentation level of the handler body.
struct TriggerEmit {
    open: Vec<String>,
    subject: String,
    guard: Option<String>,
    close: Vec<String>,
    indent: usize,
}

/// Compile a behavior to a KubeJS server-script file body (no trailing
/// newline). Errors are reserved for structurally invalid IR; suspicious but
/// emit-table values surface as warnings.
pub fn compile_to_kubejs(b: &Behavior) -> Result<(String, Vec<CompileWarning>), CompileError> {
    let mut lines: Vec<String> = Vec::new();
    let mut warnings: Vec<CompileWarning> = Vec::new();

    lines.push("// ModCanvas Generated Behavior".to_string());
    lines.push(format!("// {} — {}", b.id, b.name));
    lines.push("".to_string());

    let te = emit_trigger(&b.trigger)?;
    lines.extend(te.open);

    if let Some(source) = te.guard {
        let pad = "  ".repeat(te.indent);
        lines.push(format!(
            "{}const player = {}; if (!player) return;",
            pad, source
        ));
    }

    for cond in &b.conditions {
        if let super::Condition::EntityType { .. } = cond {
            if !super::compile_conditions::trigger_has_entity(&b.trigger) {
                return Err(CompileError(format!(
                    "behavior '{}' has an entity-type condition, but its trigger has no entity in scope",
                    b.id
                )));
            }
        }
        emit_condition(cond, &te.subject, te.indent, &mut lines, &mut warnings)?;
    }

    for action in &b.actions {
        emit_action(action, &te.subject, te.indent, &mut lines, &mut warnings)?;
    }

    lines.extend(te.close);

    Ok((lines.join("\n"), warnings))
}

/// Emit the event registration, subject binding, and closers for a trigger.
fn emit_trigger(t: &Trigger) -> Result<TriggerEmit, CompileError> {
    let mut open = Vec::new();
    let mut subject = "event.player".to_string();
    let mut guard: Option<String> = None;
    let mut close = vec!["})".to_string()];
    let mut indent = 1usize;

    let targeted = |id: Option<&str>| -> String {
        match id {
            Some(v) => format!("'{}', ", v),
            None => String::new(),
        }
    };

    match t {
        Trigger::PlayerJoinsGame => open.push("PlayerEvents.loggedIn(event => {".to_string()),
        Trigger::PlayerLeavesGame => open.push("PlayerEvents.loggedOut(event => {".to_string()),
        Trigger::PlayerTakesDamage => {
            open.push("EntityEvents.afterHurt('minecraft:player', event => {".to_string())
        }
        Trigger::PlayerKillsEntity { entity } => {
            open.push(format!(
                "EntityEvents.death({}event => {{",
                targeted(entity.as_deref())
            ));
            // The killer, not the dying entity, is the action subject.
            subject = "player".to_string();
            guard = Some("event.source.player".to_string());
        }
        Trigger::ItemCrafted { item } => {
            open.push(format!("ItemEvents.crafted({}event => {{", targeted(item.as_deref())))
        }
        Trigger::ItemPickedUp { item } => {
            open.push(format!("ItemEvents.pickedUp({}event => {{", targeted(item.as_deref())))
        }
        Trigger::BlockPlaced { block } => {
            open.push(format!("BlockEvents.placed({}event => {{", targeted(block.as_deref())));
            // The placer may be a piston or other non-player entity.
            subject = "player".to_string();
            guard = Some("event.player".to_string());
        }
        Trigger::BlockBroken { block } => {
            open.push(format!("BlockEvents.broken({}event => {{", targeted(block.as_deref())));
            // Broken events always carry a player in KubeJS, but guard anyway
            // for parity with placed — cheap and honest.
            subject = "player".to_string();
            guard = Some("event.player".to_string());
        }
        Trigger::AdvancementCompleted { advancement } => {
            open.push(format!(
                "PlayerEvents.advancement('{}', event => {{",
                advancement
            ));
        }
        Trigger::TimedEvery { ticks } => {
            if *ticks == 0 {
                return Err(CompileError(
                    "TimedEvery interval must be at least 1 tick".to_string(),
                ));
            }
            open.push("ServerEvents.loaded(event => {".to_string());
            open.push(format!(
                "  event.server.scheduleRepeatingInTicks({}, () => {{",
                ticks
            ));
            open.push("    event.server.players.forEach(player => {".to_string());
            subject = "player".to_string();
            close = vec!["    })".to_string(), "  })".to_string(), "})".to_string()];
            indent = 3;
        }
    }

    Ok(TriggerEmit { open, subject, guard, close, indent })
}

/// Quote a string as a single-quoted JS literal (escapes `\` and `'`).
pub(crate) fn js_quote(s: &str) -> String {
    format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'"))
}
