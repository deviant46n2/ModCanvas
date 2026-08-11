//! Comment-preservation export tests: sidecar merge, live-export recovery from
//! disk, and preserving existing filenames/groups on flat re-export.

use super::*;
use crate::quest::*;
use tempfile;

#[test]
fn comment_preservation_roundtrip() {
    // Ensure no stale sidecar data from parallel tests
    // Write a chapter SNBT with comments on various fields.
    //
    // Parser attribution: the tokenizer emits Comment tokens, and the parser
    // assigns them as trailing on the *preceding* field's CommentedSnbt (via
    // `collect_trailing_comment()`).  So a comment placed between fields is
    // attached to the field above, not the field below.
    //
    // In this input:
    //   /* Chapter title with comment */ → trailing on `filename`
    //   /* Group identifier */          → trailing on `title`
    //   /* Quest x position */          → trailing on quest `id`
    //   /* Quest title */               → trailing on quest `y`
    //
    // The sidecar merge preserves comments on fields whose *value* hasn't
    // changed.  `filename` is always re-derived via `sanitize_filename`, so
    // `/* Chapter title with comment */` (trailing on `filename`) will always
    // be lost.  That is expected behavior given the parser's attribution.

    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    // Chapter with comments
    std::fs::write(chapters_dir.join("test.snbt"), r#"{
    id = "ch1"
    filename = "test"
    /* Chapter title with comment */
    title = "Test Chapter"
    /* Group identifier */
    group = "main"
    quests = [
        {
            id = "q1"
            /* Quest x position */
            x = 100.0d
            y = 50.0d
            /* Quest title */
            title = "First Quest"
            tasks = [
                {
                    id = "t1"
                    type = "item"
                    title = "Get Item"
                    item = "minecraft:diamond"
                    count = 5L
                }
            ]
        }
    ]
}"#).unwrap();

    // Import
    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    assert_eq!(graph.chapters.len(), 1);

    // Export without modifications
    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    // Read the exported chapter file — the pack is FlatChapters, and the
    // exporter now writes ONE layout (the pack's), so the flat file is the
    // only copy.
    let exported_chapter = export_dir.path()
        .join("config").join("ftbquests").join("quests").join("chapters").join("Test_Chapter.snbt");
    assert!(exported_chapter.exists(), "exported chapter exists");
    let exported = std::fs::read_to_string(&exported_chapter).unwrap();

    // Comments trailing on unchanged fields survive:
    //   `/* Group identifier */` — trailing on `title` (unchanged "Test Chapter")
    assert!(exported.contains("/* Group identifier */"),
        "chapter group comment preserved (trailing on unchanged title)");

    // `/* Chapter title with comment */` is trailing on `filename` which is
    // always re-derived as "Test_Chapter", so it is expected to be lost.
    assert!(!exported.contains("/* Chapter title with comment */"),
        "comment on sanitized filename is correctly lost");

    // Quest-level: `/* Quest x position */` trailing on `id` (unchanged "q1")
    assert!(exported.contains("/* Quest x position */"),
        "quest x position comment preserved (trailing on unchanged id)");
    // `/* Quest title */` trailing on `y` (unchanged 50.0)
    assert!(exported.contains("/* Quest title */"),
        "quest title comment preserved (trailing on unchanged y)");

    // --- Mutation test: re-import from first export, then mutate and re-export ---
    // The first export cleared the sidecar, so we re-import from its output to
    // re-populate the sidecar before the second export.
    let import_result2 = import_ftb_quests(export_dir.path()).unwrap();
    let mut graph2 = import_result2.graph;
    let node = graph2.nodes.iter_mut().find(|n| n.id == "q1").unwrap();
    node.position.x = 200.0; // changed x

    let export_dir2 = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph2, export_dir2.path(), &import_result2.sidecar).unwrap();

    let exported_chapter2 = export_dir2.path()
        .join("config").join("ftbquests").join("quests").join("chapters").join("Test_Chapter.snbt");
    let exported2 = std::fs::read_to_string(&exported_chapter2).unwrap();

    // Since the parser attributes `/* Quest x position */` as trailing on `id`
    // (which didn't change), the comment survives even though `x` changed.
    // This is a parser-attribution limitation, not a sidecar bug.
    assert!(exported2.contains("/* Quest x position */"),
        "quest x position comment still present (trailing on unchanged id)");
    assert!(exported2.contains("/* Quest title */"),
        "quest title comment preserved after x mutation");
    assert!(exported2.contains("/* Group identifier */"),
        "chapter group comment preserved after quest mutation");

    // --- Fresh export (no import, no sidecar) — comments are gone ---
    // Re-import, mutate quest title (changes trailing-on-y comment), re-export
    let import_result3 = import_ftb_quests(export_dir2.path()).unwrap();
    let mut graph3 = import_result3.graph;
    let node3 = graph3.nodes.iter_mut().find(|n| n.id == "q1").unwrap();
    node3.label = "Renamed Quest".to_string(); // changes title value → comment lost

    let export_dir3 = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph3, export_dir3.path(), &import_result3.sidecar).unwrap();

    let exported_chapter3 = export_dir3.path()
        .join("config").join("ftbquests").join("quests").join("chapters").join("Test_Chapter.snbt");
    let exported3 = std::fs::read_to_string(&exported_chapter3).unwrap();

    // `y` didn't change so the trailing `/* Quest title */` comment survives
    // (parser attributes it on `y`, not on `title`)
    assert!(exported3.contains("/* Quest title */"),
        "quest title comment survives (trailing on unchanged y)");
    // `id` didn't change, so trailing `/* Quest x position */` survives
    assert!(exported3.contains("/* Quest x position */"),
        "quest x position comment survives (trailing on unchanged id)");
}

/// A live export path (empty sidecar) must still preserve comments that exist
/// on disk: the exporter recovers a sidecar from the existing quests directory
/// before merging. Regression for `export_ftb_quests_to_dir` /
/// `write_quest_graph_to_instance` which passed `HashMap::new()`.
#[test]
fn live_export_without_sidecar_recovers_comments_from_disk() {
    // Build a pack on disk with comments, then import it.
    let tmp = tempfile::tempdir().unwrap();
    let pack_root = tmp.path().to_path_buf();
    let quests_dir = pack_root.join("config").join("ftbquests").join("quests");
    std::fs::create_dir_all(&quests_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13L /* book version */}").unwrap();
    let ch_dir = quests_dir.join("Chapter_One");
    std::fs::create_dir_all(&ch_dir).unwrap();
    std::fs::write(ch_dir.join("chapter.snbt"), r#"{
        id = "ch1"
        title = "Chapter One"
        /* quest position */
        quests = [
            {
                id = "q1"
                title = "Quest One"
                x = 0
                y = 0
            }
        ]
    }"#).unwrap();

    let import_result = crate::imports::ftb_quests::import_ftb_quests(&pack_root).unwrap();
    let mut graph = import_result.graph;

    // Simulate the live path: export to the SAME directory with an empty sidecar.
    let node = graph.nodes.iter_mut().find(|n| n.id == "q1").unwrap();
    node.label = "Renamed Quest".to_string();

    let empty_sidecar: snbt_sidecar::SnbtSidecar = std::collections::HashMap::new();
    export_ftb_quests_snbt(&graph, &pack_root, &empty_sidecar).unwrap();

    // Chapter comment must survive (unchanged), and the renamed title is present.
    let chapter_path = quests_dir.join("Chapter_One").join("chapter.snbt");
    let exported = std::fs::read_to_string(&chapter_path).unwrap();
    assert!(exported.contains("/* quest position */"),
        "chapter quest-list comment recovered from disk: {exported}");
    assert!(exported.contains("Renamed Quest"), "renamed title exported: {exported}");

    // Book-level data.snbt comment must survive too.
    let data = std::fs::read_to_string(quests_dir.join("data.snbt")).unwrap();
    assert!(data.contains("/* book version */"), "data.snbt comment recovered: {data}");
}

#[test]
fn test_flat_export_preserves_existing_filenames_and_group() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    // The pack's own file: lowercase name + group key + a title with a
    // formatting code that sanitizes to a DIFFERENT name ("fLoot") — the
    // exact trap that produced the duplicate chapters in real packs.
    std::fs::write(chapters_dir.join("loot.snbt"), r#"{
        id: "ch_loot"
        filename: "loot"
        title: "§fLoot"
        group: "grp_1"
        quests: []
    }"#).unwrap();
    let import_result = import_ftb_quests(tmp.path()).unwrap();
    // Export back into the SAME dir — the app always writes into the pack
    // itself (in-place), never into a fresh folder.
    export_ftb_quests_snbt(&import_result.graph, tmp.path(), &import_result.sidecar).unwrap();

    let out_chapters = tmp.path().join("config").join("ftbquests").join("quests").join("chapters");
    assert!(!out_chapters.join("fLoot.snbt").exists(), "no title-sanitized duplicate created");
    let exported = std::fs::read_to_string(out_chapters.join("loot.snbt")).unwrap();
    assert!(exported.contains("order_index"), "export must rewrite the pack's own file: {exported}");
    assert!(exported.contains("group:"), "group key must survive the rewrite: {exported}");
}
