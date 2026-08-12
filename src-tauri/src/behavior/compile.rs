//! Behavior → KubeJS compiler (P2-BEHAVIOR, roadmap §11.2). Pure function:
//! typed IR in, script string out, no I/O. The output is real KubeJS `.js`
//! that rides the same evidence loop the hotswap gate uses (the script is a
//! server script; `kubejs reload server-scripts` picks it up).
//!
//! Golden-output tests (`tests.rs`) lock every emitted string byte-for-byte.
//! That locks the STRING, not the API: KubeJS method signatures can surprise
//! at runtime, and only an in-game run proves them (roadmap §21 risk #3 —
//! "file-level sound, runtime-only surprises remain").

use crate::behavior::{Action, Behavior, Trigger};

/// Compile-time validation failure — the behavior IR cannot be emitted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileError(pub String);

/// A non-fatal note about the compiled script (e.g. a suspicious item id).
/// Deterministic — same IR always yields the same warnings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileWarning(pub String);

/// Compile a behavior to a KubeJS server-script file body (no trailing
/// newline). Errors are reserved for structurally invalid IR; suspicious but
/// emit-table values surface as warnings.
pub fn compile_to_kubejs(b: &Behavior) -> Result<(String, Vec<CompileWarning>), CompileError> {
    let mut lines: Vec<String> = Vec::new();
    let mut warnings: Vec<CompileWarning> = Vec::new();

    lines.push("// ModCanvas Generated Behavior".to_string());
    lines.push(format!("// {} — {}", b.id, b.name));
    lines.push("".to_string());

    if !b.conditions.is_empty() {
        // Conditions are part of the IR shape but no compile path exists yet;
        // a behavior that declares them must not silently drop them.
        return Err(CompileError(format!(
            "behavior '{}' declares {} condition(s), but condition compilation is not implemented yet",
            b.id,
            b.conditions.len()
        )));
    }

    let event = match b.trigger {
        Trigger::PlayerJoinsGame => "PlayerEvents.loggedIn",
    };

    lines.push(format!("{}(event => {{", event));
    for action in &b.actions {
        lines.extend(emit_action(action)?);
    }
    lines.push("})".to_string());

    Ok((lines.join("\n"), warnings))
}

fn emit_action(action: &Action) -> Result<Vec<String>, CompileError> {
    match action {
        Action::GiveItem { item, count } => {
            if !item.contains(':') {
                return Err(CompileError(format!(
                    "GiveItem references '{}' — item ids must be namespaced (`ns:path`)",
                    item
                )));
            }
            let arg = if *count == 1 {
                format!("'{}'", item)
            } else {
                format!("Item.of('{}', {})", item, count)
            };
            Ok(vec![format!("  event.player.give({})", arg)])
        }
    }
}
