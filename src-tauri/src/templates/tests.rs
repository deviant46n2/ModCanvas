//! Fidelity tests for the template scaffold. The load-bearing guarantee: a
//! scaffolded pack must import through the SAME importer the app uses on
//! every open — if the template content drifts out of the round-trip shape,
//! these tests catch it at build time, not at a user's first launch.

use super::*;
use crate::imports::ftb_quests::{export_ftb_quests_snbt, import_ftb_quests};
use crate::quest::*;
use tempfile::tempdir;

fn scaffolded_root() -> (tempfile::TempDir, std::path::PathBuf) {
    let tmp = tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    scaffold_template(&root, "exploration").expect("exploration template scaffolds");
    (tmp, root)
}

#[test]
fn scaffold_writes_subdirs_layout() {
    let (_tmp, root) = scaffolded_root();
    let quests = root.join("config").join("ftbquests").join("quests");

    assert!(quests.join("data.snbt").exists(), "book data file missing");
    let chapter = quests.join("Exploration_Starter").join("chapter.snbt");
    assert!(chapter.exists(), "chapter file missing in subdirs layout");

    let content = std::fs::read_to_string(&chapter).unwrap();
    assert!(content.contains(r#"id = "A000000000000001""#), "chapter id missing");
    assert!(content.contains("On Your Way"), "milestone quest missing");
    assert!(content.contains(r#"shape = "rsquare""#), "milestone shape missing");
}

#[test]
fn scaffolded_pack_imports_cleanly() {
    let (_tmp, root) = scaffolded_root();
    let result = import_ftb_quests(&root).expect("scaffolded pack imports without error");

    assert_eq!(result.graph.chapters.len(), 1, "exactly one chapter expected");
    let quest_count = result
        .graph
        .nodes
        .iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Quest))
        .count();
    assert_eq!(quest_count, 7, "all seven template quests must import");

    // Task variety survives: one kill task, one crafting task, one checkmark.
    let kill = result
        .graph
        .nodes
        .iter()
        .filter(|n| n.objectives.iter().any(|o| matches!(o.objective_type, ObjectiveType::EntityKill)))
        .count();
    assert_eq!(kill, 1, "kill task must import");
    let craft = result
        .graph
        .nodes
        .iter()
        .filter(|n| n.objectives.iter().any(|o| matches!(o.objective_type, ObjectiveType::ItemCrafting)))
        .count();
    assert_eq!(craft, 1, "item_crafting task must import");

    // The linear chain produces 6 prerequisite edges.
    let prereqs = result
        .graph
        .edges
        .iter()
        .filter(|e| e.edge_type == EdgeType::Prerequisite)
        .count();
    assert_eq!(prereqs, 6, "six prerequisite edges for the seven-quest chain");
}

#[test]
fn scaffolded_pack_survives_edit_and_reexport() {
    let (_tmp, root) = scaffolded_root();
    let result = import_ftb_quests(&root).expect("first import succeeds");

    // Simulate the wizard flow after creation: the user opens the pack
    // (import above) and hits Save (export). The re-exported pack must
    // import identically — template content rides the app's own serializer.
    let export_dir = tempdir().unwrap();
    export_ftb_quests_snbt(&result.graph, export_dir.path(), &result.sidecar)
        .expect("re-export succeeds");
    let result2 = import_ftb_quests(export_dir.path()).expect("re-import succeeds");

    assert_eq!(result2.graph.nodes.len(), result.graph.nodes.len(), "node count stable");
    assert_eq!(result2.graph.chapters.len(), 1, "chapter count stable");
}

#[test]
fn unknown_template_errors_without_partial_writes() {
    let tmp = tempdir().unwrap();
    let root = tmp.path();
    let err = scaffold_template(root, "does-not-exist").expect_err("unknown id must error");
    assert!(err.contains("Unknown project template"), "error names the failure: {err}");
    assert!(
        !root.join("config").exists(),
        "no partial writes on unknown template"
    );
}

#[test]
fn list_templates_exposes_metadata() {
    let templates = list_templates();
    assert!(templates.iter().any(|t| t.id == "exploration"), "exploration listed");
    assert!(
        templates.iter().all(|t| !t.name.is_empty() && !t.description.is_empty()),
        "every template carries display metadata"
    );
}
