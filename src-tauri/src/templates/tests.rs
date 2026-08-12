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
fn scaffold_writes_flat_chapters_layout() {
    let (_tmp, root) = scaffolded_root();
    let quests = root.join("config").join("ftbquests").join("quests");

    assert!(quests.join("data.snbt").exists(), "book data file missing");
    // FlatChapters — the ONLY layout FTB Quests 1.21.x reads (verified in the
    // 2101.1.30 jar: "chapters/%s.snbt"). Subdirs would load 0 chapters.
    let play = quests.join("chapters").join("Exploration_Starter.snbt");
    assert!(play.exists(), "play chapter missing in chapters/ layout");
    let shape = quests.join("chapters").join("Shape_Your_Pack.snbt");
    assert!(shape.exists(), "shape chapter missing in chapters/ layout");
    assert!(!quests.join("Exploration_Starter").exists(), "no subdirs chapter folders");

    let play_content = std::fs::read_to_string(&play).unwrap();
    // Template ids are 1/2/3-prefixed (positive) — FTB's Long.parseLong throws
    // on ids > Long.MAX_VALUE (the s42 "no dependency lines" bug), so the
    // scaffold must never ship A/B/C-prefixed ids.
    assert!(play_content.contains(r#"id = "100000000000001""#), "play chapter id missing");
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
    assert_eq!(quest_count, 27, "7 play quests + 20 tour quests must import");

    // Task variety survives: one kill task, one crafting task, twenty-one
    // checkmark (app-action) tasks — twenty tour quests plus the play
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
    assert_eq!(checkmarks, 21, "twenty tour quests + the play milestone");

    // The play chapter's linear chain produces 6 prerequisite edges; the
    // tour's teaching spine + side branches add 25 more: 6 along the spine,
    // 7 converging on Health (spine + the six content quests), 2 along the
    // Run/Share tail, and 10 side branches (undo, beginner mode, chapter,
    // book settings, recipe, config, mods, behaviors, loot, config tweaks +
    // the spine links they hang off).
    let prereqs = result
        .graph
        .edges
        .iter()
        .filter(|e| e.edge_type == EdgeType::Prerequisite)
        .count();
    assert_eq!(prereqs, 31, "6 play-chain edges + 25 tour edges");
}

/// s45 regression lock (TEMPLATE-ITEM-TASK-BARE-STRING-NPE): every `item`
/// field in the exploration template must use the 1.21 Data Components
/// compound form (`item = { id = ..., count = ... }`), NEVER a bare string
/// (`item = "minecraft:oak_log"`). Bare strings are the pre-1.20.5 format:
/// FTB Quests 2101.1.30's ItemTask.readData -> itemOrMissingFromNBT chokes on
/// them, createTask returns null, readQuestsFromNBT NPEs in
/// handleLegacyTaskNBT, the whole book fails to load, and the game re-saves a
/// stripped 2-quest chapter. The template must stay in the SAME form the
/// exporter emits (helpers.rs item_compound) so template and exporter can
/// never drift. The 27-quest import above proves the compound form still
/// imports identically.
#[test]
fn template_item_fields_are_never_bare_strings() {
    for (rel, contents) in TEMPLATES
        .iter()
        .find(|t| t.id == "exploration")
        .expect("exploration template exists")
        .files
    {
        if !rel.ends_with(".snbt") {
            continue;
        }
        // A bare `item = "..."` — the pre-1.20.5 form. The compound form
        // `item = { ... }` must survive this check untouched.
        let bare = contents.lines().filter(|l| l.trim().starts_with("item = \""));
        let bare_lines: Vec<String> = bare.map(|l| l.trim().to_string()).collect();
        assert!(
            bare_lines.is_empty(),
            "template {} has bare-string item fields (pre-1.20.5 format, NPEs FTB 2101.1.30): {:?}",
            rel,
            bare_lines
        );
    }
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

// --- template behaviors (s46): the template ships 3 example behaviors so a
// new pack demonstrates the Behaviors tab on first open. The load-bearing
// guarantee: the scaffolded `.modcanvas/behaviors.json` must (a) be valid IR
// the app's own store reads, and (b) compile on its declared backend — a
// template behavior that errors on open would teach the wrong lesson.

#[test]
fn scaffold_writes_example_behaviors_state() {
    let (_tmp, root) = scaffolded_root();
    let behaviors_file = root.join(".modcanvas").join("behaviors.json");
    assert!(behaviors_file.exists(), "template behaviors state missing");

    let contents = std::fs::read_to_string(&behaviors_file).unwrap();
    let behaviors: Vec<crate::behavior::Behavior> =
        serde_json::from_str(&contents).expect("template behaviors must be valid IR");
    assert_eq!(behaviors.len(), 3, "template ships exactly 3 example behaviors");

    // Every example behavior compiles on its declared backend — a broken
    // template behavior would fail in the editor's live preview on first open.
    for b in &behaviors {
        let out = crate::behavior::CompileOutput::from_behavior(b);
        assert!(
            matches!(out, crate::behavior::CompileOutput::Ok { .. }),
            "template behavior '{}' ({:?}) must compile: {:?}",
            b.name,
            b.backend,
            out
        );
    }
    // The template demonstrates both backends (roadmap §11.2: KubeJS first,
    // datapack second).
    let backends: std::collections::HashSet<_> =
        behaviors.iter().map(|b| b.backend).collect();
    assert_eq!(backends.len(), 2, "template examples cover kubejs + datapack");
}

#[test]
fn example_behaviors_scaffold_through_state_path() {
    let (_tmp, root) = scaffolded_root();
    // The scaffold must NOT place behaviors under config/ (the s45 recipe-writer
    // bug class) — they are project-root private state.
    assert!(!root.join("config").join(".modcanvas").exists());
    assert!(
        !root.join("config").join("ftbquests").join("quests").join(".modcanvas").exists()
    );
}
