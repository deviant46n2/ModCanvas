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
    let play = quests.join("Exploration_Starter").join("chapter.snbt");
    assert!(play.exists(), "play chapter missing in subdirs layout");
    let shape = quests.join("Shape_Your_Pack").join("chapter.snbt");
    assert!(shape.exists(), "shape chapter missing in subdirs layout");

    let play_content = std::fs::read_to_string(&play).unwrap();
    assert!(play_content.contains(r#"id = "A000000000000001""#), "play chapter id missing");
    assert!(play_content.contains("On Your Way"), "milestone quest missing");
    assert!(play_content.contains(r#"shape = "rsquare""#), "milestone shape missing");
    let shape_content = std::fs::read_to_string(&shape).unwrap();
    assert!(shape_content.contains("Share Your Pack"), "tour milestone missing");
}

#[test]
fn scaffolded_pack_imports_cleanly() {
    let (_tmp, root) = scaffolded_root();
    let result = import_ftb_quests(&root).expect("scaffolded pack imports without error");

    assert_eq!(result.graph.chapters.len(), 2, "two chapters expected");
    let quest_count = result
        .graph
        .nodes
        .iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Quest))
        .count();
    assert_eq!(quest_count, 18, "7 play quests + 11 tour quests must import");

    // Task variety survives: one kill task, one crafting task, twelve
    // checkmark (app-action) tasks — eleven tour quests plus the play
    // chapter's own milestone. All must import as checkmarks so players
    // can complete them by hand.
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
    let checkmarks = result
        .graph
        .nodes
        .iter()
        .filter(|n| n.objectives.iter().any(|o| matches!(o.objective_type, ObjectiveType::Checkmark)))
        .count();
    assert_eq!(checkmarks, 12, "eleven tour quests + the play milestone");

    // The play chapter's linear chain produces 6 prerequisite edges; the
    // tour chapter is deliberately dependency-free (self-paced).
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
    assert_eq!(result2.graph.chapters.len(), 2, "chapter count stable");
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
fn scaffold_refuses_to_clobber_an_existing_quest_book() {
    let (_tmp, root) = scaffolded_root();
    // The wizard can point at an existing instance: a quests dir the game (or
    // a previous project) wrote must never be overwritten by a scaffold.
    let quests = root.join("config").join("ftbquests").join("quests");
    let marker = quests.join("book.snbt");
    std::fs::create_dir_all(&marker.parent().unwrap()).unwrap();
    std::fs::write(&marker, "{version: 13}").unwrap();

    let err = scaffold_template(&root, "exploration").expect_err("existing content must error");
    assert!(err.contains("already contains a quest book"), "error explains: {err}");
    assert_eq!(
        std::fs::read_to_string(&marker).unwrap(),
        "{version: 13}",
        "existing quest content untouched"
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
