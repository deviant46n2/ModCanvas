//! Behavior → KubeJS emission (P2-BEHAVIOR, roadmap §11.2): compile every
//! behavior and write the real `.js` into the instance's KubeJS scripts dir.
//!
//! This is the missing link the arc's completion criterion demands: "an
//! authored behavior emits real KubeJS that a test pack loads". The IR save
//! (`.modcanvas/behaviors.json`) is private authoring state; this module
//! turns it into the ecosystem artifact the game actually runs.
//!
//! Emission rules: a DEDICATED file (`modcanvas_behaviors.js`) so a save
//! never clobbers a pack-author's own scripts, scoped inside the project
//! root via `validate_under_root`, written atomically so an interrupted
//! write never corrupts the existing script.
//!
//! PATH NOTE (s45 finding): the script goes to `<project>/kubejs/server_scripts/`
//! — the project ROOT, NOT `<project>/config/`. KubeJS reads server scripts
//! from the game dir's `kubejs/server_scripts/` (verified: the instance's own
//! `main.js` example lives there; the shipped KubeJS README says so). The
//! recipe writer (`commands/mod.rs` write_script_files) resolves through the
//! config-scoped `validate_project_write`, which lands recipe scripts in
//! `<root>/config/kubejs/...` — a directory KubeJS never reads. That is a
//! separate latent bug in the recipe flow (flagged s45, not fixed here);
//! behavior emission deliberately does NOT copy that mistake.

use crate::behavior::compile_datapack::compile_to_datapack;
use crate::behavior::{compile::compile_to_kubejs, Backend, Behavior};
use crate::path_safety::{atomic_write_str, validate_under_root};
use std::path::Path;

/// The dedicated script file for all ModCanvas-authored KubeJS behaviors.
pub const BEHAVIORS_SCRIPT_REL: &str = "kubejs/server_scripts/modcanvas_behaviors.js";

/// The datapack root for ModCanvas-authored datapack behaviors (KubeJS
/// serves `kubejs/data/` as a virtual datapack — verified in the shipped
/// KubeJS jar at s46). Everything under `<ns>/` is OURS: the whole namespace
/// is re-emitted on every save so a deleted behavior cannot leave a stale
/// advancement firing in-game.
pub const DATAPACK_DATA_REL: &str = "kubejs/data/modcanvas";

/// Compile + write all behaviors to the instance. KubeJS behaviors go to
/// `modcanvas_behaviors.js`; datapack behaviors go to
/// `kubejs/data/modcanvas/advancement|function/` — the namespace is cleared
/// then re-emitted, so the on-disk datapack is ALWAYS exactly the saved IR.
///
/// Returns the warnings/errors for behaviors that did NOT emit (as `id:
/// reason` strings), so the caller can surface them honestly. Empty vec =
/// every behavior compiled and shipped.
pub fn emit_behavior_scripts(
    project_path: &str,
    behaviors: &[Behavior],
) -> Result<Vec<String>, String> {
    let mut body: Vec<String> = Vec::new();
    let mut failures: Vec<String> = Vec::new();

    body.push("// ModCanvas Generated Behaviors — do not edit by hand.".to_string());
    body.push("// Re-exported on every behavior save from the IR in .modcanvas/behaviors.json".to_string());
    body.push("".to_string());

    let root = Path::new(project_path);
    // Datapack namespace is re-emitted wholesale: clear it before writing so
    // the artifact set mirrors the IR exactly.
    clear_datapack_namespace(root)?;

    for b in behaviors {
        let result = match b.backend {
            Backend::Kubejs => {
                compile_to_kubejs(b).map(|(script, warnings)| (script, warnings))
            }
            Backend::Datapack => compile_to_datapack(b).map(|(out, warnings)| {
                (format!("// datapack behavior: {}\n{}", b.id, out.preview()), warnings)
            }),
        };
        match result {
            Ok((script, warnings)) => {
                if b.backend == Backend::Datapack {
                    emit_datapack_files(root, b)?;
                } else {
                    body.push(script);
                    body.push("".to_string());
                }
                for w in warnings {
                    failures.push(format!("{}: {}", b.id, w.0));
                }
            }
            Err(e) => failures.push(format!("{}: {}", b.id, e.0)),
        }
    }

    if !failures.is_empty() {
        body.push(format!(
            "// SKIPPED ({}): {}",
            failures.len(),
            failures.join("; ")
        ));
    }

    let target = validate_under_root(root, BEHAVIORS_SCRIPT_REL)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    atomic_write_str(&target, &body.join("\n"))?;

    Ok(failures)
}

/// Write one datapack behavior's advancement + reward function into the
/// (already-cleared) modcanvas namespace.
fn emit_datapack_files(root: &Path, b: &Behavior) -> Result<(), String> {
    let (out, _warnings) = compile_to_datapack(b).map_err(|e| e.0)?;
    let adv_rel = format!(
        "{}/advancement/{}.json",
        DATAPACK_DATA_REL, out.advancement_name
    );
    let fn_rel = format!("{}/function/{}.mcfunction", DATAPACK_DATA_REL, out.function_name);
    for (rel, content) in [(adv_rel, out.advancement_json), (fn_rel, out.function_body)] {
        let target = validate_under_root(root, &rel)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        atomic_write_str(&target, &content)?;
    }
    Ok(())
}

/// Remove everything ModCanvas owns under `kubejs/data/modcanvas/` so the
/// on-disk datapack mirrors the IR exactly. Absent = nothing to clear.
fn clear_datapack_namespace(root: &Path) -> Result<(), String> {
    let ns = validate_under_root(root, DATAPACK_DATA_REL)?;
    if ns.exists() {
        std::fs::remove_dir_all(&ns).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::behavior::{Action, Trigger};

    fn kit() -> Behavior {
        Behavior {
            id: "starter:kit".to_string(),
            name: "Starter Kit".to_string(),
            backend: Backend::Kubejs,
            trigger: Trigger::PlayerJoinsGame,
            conditions: vec![],
            actions: vec![Action::GiveItem {
                item: "minecraft:diamond".to_string(),
                count: 1,
            }],
        }
    }

    #[test]
    fn writes_dedicated_script_file_in_instance() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        let failures = emit_behavior_scripts(&root, &[kit()]).unwrap();
        assert!(failures.is_empty());

        let path = tmp.path().join(BEHAVIORS_SCRIPT_REL);
        assert!(path.exists(), "script must be written into the instance");
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("PlayerEvents.loggedIn"));
        assert!(content.contains("minecraft:diamond"));
        assert!(content.contains("starter:kit"));
    }

    #[test]
    fn broken_behavior_is_reported_not_emitted() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        let bad = Behavior {
            id: "bad:item".to_string(),
            actions: vec![Action::GiveItem {
                item: "diamond".to_string(), // unnamespaced — compile error
                count: 1,
            }],
            ..kit()
        };

        let failures = emit_behavior_scripts(&root, &[kit(), bad]).unwrap();
        assert_eq!(failures.len(), 1);
        assert!(failures[0].contains("bad:item"));
        assert!(failures[0].contains("namespaced"));

        // The good behavior still shipped.
        let content =
            std::fs::read_to_string(tmp.path().join(BEHAVIORS_SCRIPT_REL)).unwrap();
        assert!(content.contains("PlayerEvents.loggedIn"));
        assert!(content.contains("SKIPPED"), "skipped behaviors must be visible in the file");
    }

    #[test]
    fn empty_behaviors_writes_header_only() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        let failures = emit_behavior_scripts(&root, &[]).unwrap();
        assert!(failures.is_empty());
        let content =
            std::fs::read_to_string(tmp.path().join(BEHAVIORS_SCRIPT_REL)).unwrap();
        assert!(content.starts_with("// ModCanvas Generated Behaviors"));
        assert!(!content.contains("PlayerEvents"));
    }

    #[test]
    fn never_creates_file_outside_project_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_string_lossy().to_string();

        // validate_project_write refuses traversal — emitting to a project
        // path with a `..` must error before any write.
        let evil = tmp.path().join("ok").join("..").join("..").to_string_lossy().to_string();
        let err = emit_behavior_scripts(&evil, &[kit()]).unwrap_err();
        assert!(!err.is_empty());
    }
}
