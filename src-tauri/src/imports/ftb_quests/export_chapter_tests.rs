//! Chapter-level metadata / group / quest-link export round-trip tests.

use super::*;
use crate::quest::*;
use tempfile;

#[test]
fn chapter_metadata_fields_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("meta.snbt"), r#"{
    id = "ch_meta"
    filename = "meta"
    title = "Meta Chapter"
    subtitle = "A subtitle"
    always_invisible: true
    default_quest_shape = "rounded_square"
    default_quest_size: 1.5d
    default_min_width: 120
    default_hide_dependency_lines: true
    hide_quest_details_until_startable: true
    hide_quest_until_deps_visible: true
    hide_quest_until_deps_complete: true
    hide_text_until_complete: true
    progression_mode: "linear"
    default_repeatable_quest: true
    require_sequential_tasks: true
    autofocus_id = "abc123"
    quests = []
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    let ch = graph.chapters.iter().find(|c| c.id == "ch_meta").expect("chapter imported");
    assert_eq!(ch.subtitle, "A subtitle");
    assert!(ch.always_invisible);
    assert_eq!(ch.default_quest_shape.to_string(), "rounded_square");
    assert_eq!(ch.default_quest_size.width, 36.0, "1.5x default size maps to 36 grid units");
    assert_eq!(ch.default_min_width, 120);
    assert!(ch.default_hide_dependency_lines);
    assert!(ch.hide_quest_details_until_startable);
    assert!(ch.hide_quest_until_deps_visible);
    assert!(ch.hide_quest_until_deps_complete);
    assert!(ch.hide_text_until_complete);
    assert_eq!(ch.progression_mode.to_string(), "linear");
    assert!(ch.default_repeatable);
    assert!(ch.require_sequential_tasks);
    assert_eq!(ch.autofocus_id, "abc123");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    let ch2 = graph2.chapters.iter().find(|c| c.id == "ch_meta").expect("chapter re-imported");
    assert_eq!(ch2.subtitle, "A subtitle");
    assert!(ch2.always_invisible);
    assert_eq!(ch2.default_quest_shape.to_string(), "rounded_square");
    assert_eq!(ch2.default_quest_size.width, 36.0, "size survives round-trip");
    assert_eq!(ch2.default_min_width, 120);
    assert!(ch2.default_hide_dependency_lines);
    assert!(ch2.hide_quest_details_until_startable);
    assert!(ch2.hide_quest_until_deps_visible);
    assert!(ch2.hide_quest_until_deps_complete);
    assert!(ch2.hide_text_until_complete);
    assert_eq!(ch2.progression_mode.to_string(), "linear");
    assert!(ch2.default_repeatable);
    assert!(ch2.require_sequential_tasks);
    assert_eq!(ch2.autofocus_id, "abc123");
}

#[test]
fn chapter_groups_roundtrip_through_export() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(quests_dir.join("chapter_groups.snbt"), r#"{
    chapter_groups: [
        { id: "group_a" }
        { id: "group_b", title: "Group B" }
    ]
}"#).unwrap();

    std::fs::write(chapters_dir.join("g1.snbt"), r#"{
    id = "ch1"
    filename = "g1"
    title = "Chapter 1"
    group = "group_a"
    quests = []
}"#).unwrap();
    std::fs::write(chapters_dir.join("g2.snbt"), r#"{
    id = "ch2"
    filename = "g2"
    title = "Chapter 2"
    group = "group_b"
    quests = []
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    assert_eq!(graph.chapter_groups.len(), 2, "both groups parsed");
    assert_eq!(graph.chapter_groups[0].id, "group_a");
    assert_eq!(graph.chapter_groups[1].title, "Group B");
    let ch1 = graph.chapters.iter().find(|c| c.id == "ch1").unwrap();
    assert_eq!(ch1.group_id.as_deref(), Some("group_a"));

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    let groups_path = export_dir.path().join("config").join("ftbquests").join("quests").join("chapter_groups.snbt");
    let content = std::fs::read_to_string(&groups_path).expect("chapter_groups.snbt written");
    assert!(content.contains("group_a"), "group id exported");
    assert!(content.contains("Group B"), "group title exported");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    assert_eq!(graph2.chapter_groups.len(), 2, "groups survive round-trip");
    assert_eq!(graph2.chapters.iter().find(|c| c.id == "ch1").unwrap().group_id.as_deref(), Some("group_a"));
}

#[test]
fn quest_link_roundtrips_through_export() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    // Two chapters: ch_a holds a real quest, ch_b holds a link pointing at it.
    std::fs::write(chapters_dir.join("a.snbt"), r#"{
    id = "ch_a"
    filename = "a"
    title = "Chapter A"
    quests = [
        { id: "q_real", x: 0.0d, y: 0.0d, title: "Real Quest" }
    ]
}"#).unwrap();
    std::fs::write(chapters_dir.join("b.snbt"), r#"{
    id = "ch_b"
    filename = "b"
    title = "Chapter B"
    quests = [
        { id: "link1", x: 3.0d, y: 4.0d, title: "Jump to Real", linked_quest: "q_real" }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    let link = graph.nodes.iter().find(|n| n.id == "link1").expect("link node parsed");
    assert_eq!(link.node_type, QuestNodeType::QuestLink, "link node type");
    assert_eq!(link.link_target, "q_real", "link target captured");
    assert_eq!(link.position.x, 3.0);

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    // Subdirs layout: chapter dir is the sanitized chapter title.
    let link_path = export_dir.path().join("config").join("ftbquests").join("quests").join("Chapter_B").join("chapter.snbt");
    let content = std::fs::read_to_string(&link_path).expect("chapter b written");
    assert!(content.contains("linked_quest"), "linked_quest exported");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    let link2 = graph2.nodes.iter().find(|n| n.id == "link1").expect("link survives round-trip");
    assert_eq!(link2.node_type, QuestNodeType::QuestLink);
    assert_eq!(link2.link_target, "q_real");
}

#[test]
fn quest_link_no_linked_target_stays_link() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();
    std::fs::write(chapters_dir.join("b.snbt"), r#"{
    id = "ch_b"
    filename = "b"
    title = "Chapter B"
    quests = [
        { id: "broken_link", x: 1.0d, y: 1.0d, linked_quest: "" }
    ]
}"#).unwrap();

    let graph = import_ftb_quests(tmp.path()).unwrap().graph;
    let link = graph.nodes.iter().find(|n| n.id == "broken_link").expect("node parsed");
    assert_eq!(link.node_type, QuestNodeType::QuestLink, "empty linked_quest still a link");
    assert_eq!(link.link_target, "");
}
