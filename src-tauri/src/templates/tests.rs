//! Fidelity tests for the template scaffold. The load-bearing guarantee: a
//! scaffolded pack must import through the SAME importer the app uses on
//! every open — if the template content drifts out of the round-trip shape,
//! these tests catch it at build time, not at a user's first launch.

use super::*;
use crate::imports::ftb_quests::{export_ftb_quests_snbt, import_ftb_quests};
use crate::quest::*;
use tempfile::tempdir;

fn scaffolded_root(template_id: &str) -> (tempfile::TempDir, std::path::PathBuf) {
    let tmp = tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    scaffold_template(&root, template_id)
        .unwrap_or_else(|e| panic!("{template_id} template scaffolds: {e}"));
    (tmp, root)
}

/// Both templates scaffold the same FlatChapters layout (the ONLY layout FTB
/// Quests 1.21.x reads, verified in the 2101.1.30 jar). The intro is a pure
/// core-loop chapter; the IDE tour keeps the tour chapter. Neither ships a
/// play chapter (pure tool teaching, s49).
#[test]
fn scaffold_writes_flat_chapters_layout() {
    for template_id in ["intro", "ide-tour"] {
        let (_tmp, root) = scaffolded_root(template_id);
        let quests = root.join("config").join("ftbquests").join("quests");

        assert!(quests.join("data.snbt").exists(), "book data file missing");
        // FlatChapters — the ONLY layout FTB Quests 1.21.x reads (verified in the
        // 2101.1.30 jar: "chapters/%s.snbt"). Subdirs would load 0 chapters.
        assert!(
            quests.join("chapters").is_dir(),
            "chapters/ dir missing for {template_id}"
        );
        let chapter_files: Vec<_> = std::fs::read_dir(quests.join("chapters"))
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(chapter_files.len(), 1, "{template_id} ships exactly one chapter");
        assert!(
            !chapter_files.iter().any(|f| f.ends_with(".json")),
            "no stray files in chapters/"
        );

        let chapter = quests.join("chapters").join(&chapter_files[0]);
        let content = std::fs::read_to_string(&chapter).unwrap();
        // Template ids are 1/2/3-prefixed (positive) — FTB's Long.parseLong throws
        // on ids > Long.MAX_VALUE (the s42 "no dependency lines" bug), so the
        // scaffold must never ship A/B/C-prefixed ids.
        assert!(
            content.contains(r#"id = "1000000000000"#),
            "positive-prefixed ids missing for {template_id}"
        );
        // The tour's signature quests; the intro's signature quest.
        if template_id == "ide-tour" {
            assert!(content.contains("Share Your Pack"), "tour milestone missing");
        } else {
            assert!(content.contains("Shed the Guide"), "intro self-removal lesson missing");
        }
    }
}

/// Per-template import fidelity: every quest imports as a checkmark (app-action
/// tasks players complete by hand), every dependency becomes an edge.
#[test]
fn scaffolded_pack_imports_cleanly() {
    let expected: &[(&str, usize, usize, usize)] = &[
        ("intro", 6, 6, 5),
        ("ide-tour", 21, 21, 26),
    ];
    for &(template_id, quests, checkmarks, edges) in expected {
        let (_tmp, root) = scaffolded_root(template_id);
        let result = import_ftb_quests(&root)
            .unwrap_or_else(|e| panic!("{template_id} pack imports: {e}"));

        assert_eq!(
            result.graph.chapters.len(),
            1,
            "{template_id}: one chapter expected"
        );
        let quest_count = result
            .graph
            .nodes
            .iter()
            .filter(|n| matches!(n.node_type, QuestNodeType::Quest))
            .count();
        assert_eq!(quest_count, quests, "{template_id}: quest count");

        let checkmarks_found = result
            .graph
            .nodes
            .iter()
            .filter(|n| n.objectives.iter().any(|o| matches!(o.objective_type, ObjectiveType::Checkmark)))
            .count();
        assert_eq!(checkmarks_found, checkmarks, "{template_id}: checkmark count");

        let prereqs = result
            .graph
            .edges
            .iter()
            .filter(|e| e.edge_type == EdgeType::Prerequisite)
            .count();
        assert_eq!(prereqs, edges, "{template_id}: prerequisite edge count");
    }
}

/// s45 regression lock (TEMPLATE-ITEM-TASK-BARE-STRING-NPE): every `item`
/// field in every template must use the 1.21 Data Components
/// compound form (`item = { id = ..., count = ... }`), NEVER a bare string
/// (`item = "minecraft:oak_log"`). Bare strings are the pre-1.20.5 format:
/// FTB Quests 2101.1.30's ItemTask.readData -> itemOrMissingFromNBT chokes on
/// them, createTask returns null, readQuestsFromNBT NPEs in
/// handleLegacyTaskNBT, the whole book fails to load, and the game re-saves a
/// stripped 2-quest chapter. The template must stay in the SAME form the
/// exporter emits (helpers.rs item_compound) so template and exporter can
/// never drift. The import tests above prove the compound form still imports
/// identically.
#[test]
fn template_item_fields_are_never_bare_strings() {
    for tpl in TEMPLATES {
        for (rel, contents) in tpl.files {
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
}

/// s52-class regression lock (TEMPLATE-ICON-BARE-STRING): every `icon` field
/// in every template must use the 1.21 Data Components compound form
/// (`icon = { id = "minecraft:chest" }`), NEVER a bare string
/// (`icon = "minecraft:chest"`). The exporter emits the compound form
/// (helpers.rs icon_to_snbt) and the game's own save rewrites icons as
/// compounds; a bare string parses but renders no icon in-game — a scaffolded
/// pack shows icon-less quests until the first save rewrites them. The
/// template must stay in the SAME form the exporter emits so template and
/// exporter can never drift.
#[test]
fn template_icon_fields_are_never_bare_strings() {
    for tpl in TEMPLATES {
        for (rel, contents) in tpl.files {
            if !rel.ends_with(".snbt") {
                continue;
            }
            // A bare `icon = "..."` — the pre-1.20.5 form. The compound form
            // `icon = { id = ... }` must survive this check untouched.
            let bare = contents.lines().filter(|l| l.trim().starts_with("icon = \""));
            let bare_lines: Vec<String> = bare.map(|l| l.trim().to_string()).collect();
            assert!(
                bare_lines.is_empty(),
                "template {} has bare-string icon fields (render nothing in-game on 1.21.x): {:?}",
                rel,
                bare_lines
            );
        }
    }
}

#[test]
fn scaffolded_pack_survives_edit_and_reexport() {
    for template_id in ["intro", "ide-tour"] {
        let (_tmp, root) = scaffolded_root(template_id);
        let result = import_ftb_quests(&root)
            .unwrap_or_else(|e| panic!("{template_id} first import: {e}"));

        // Simulate the wizard flow after creation: the user opens the pack
        // (import above) and hits Save (export). The re-exported pack must
        // import identically — template content rides the app's own serializer.
        let export_dir = tempdir().unwrap();
        export_ftb_quests_snbt(&result.graph, export_dir.path(), &result.sidecar)
            .expect("re-export succeeds");
        let result2 = import_ftb_quests(export_dir.path())
            .unwrap_or_else(|e| panic!("{template_id} re-import: {e}"));

        assert_eq!(result2.graph.nodes.len(), result.graph.nodes.len(), "{template_id} node count stable");
        assert_eq!(result2.graph.chapters.len(), 1, "{template_id} chapter count stable");
    }
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
    let (_tmp, root) = scaffolded_root("ide-tour");
    // The wizard can point at an existing instance: a quests dir the game (or
    // a previous project) wrote must never be overwritten by a scaffold.
    let quests = root.join("config").join("ftbquests").join("quests");
    let marker = quests.join("book.snbt");
    std::fs::create_dir_all(&marker.parent().unwrap()).unwrap();
    std::fs::write(&marker, "{version: 13}").unwrap();

    let err = scaffold_template(&root, "ide-tour").expect_err("existing content must error");
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
    assert!(templates.iter().any(|t| t.id == "intro"), "intro listed");
    assert!(templates.iter().any(|t| t.id == "ide-tour"), "ide-tour listed");
    assert!(
        templates.iter().all(|t| !t.name.is_empty() && !t.description.is_empty()),
        "every template carries display metadata"
    );
}
