use super::*;
use crate::quest::*;

#[test]
fn test_multi_chapter_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let ch1_dir = quests_dir.join("chapter_1");
    let ch2_dir = quests_dir.join("chapter_2");
    let ch3_dir = quests_dir.join("chapter_3");
    for d in [&ch1_dir, &ch2_dir, &ch3_dir] {
        std::fs::create_dir_all(d).unwrap();
    }

    // Data with chapter groups
    std::fs::write(quests_dir.join("data.snbt"), r#"{
    version: 13
    default_quest_shape: "circle"
    progression_mode: "linear"
}"#).unwrap();

    std::fs::write(quests_dir.join("chapter_groups.snbt"), r#"{
    chapter_groups: [
        { id: "group1" }
    ]
}"#).unwrap();

    // Chapter 1
    std::fs::write(ch1_dir.join("chapter.snbt"), r#"{
    id = "ch1"
    filename = "chapter_1"
    title = "Early Game"
    group = "group1"
    quests = [
        { id = "q1", x = 0.0d, y = 0.0d, title = "Start", tasks = [{ id = "t1", type = "checkmark", title = "Begin" }] }
    ]
}"#).unwrap();

    // Chapter 2
    std::fs::write(ch2_dir.join("chapter.snbt"), r#"{
    id = "ch2"
    filename = "chapter_2"
    title = "Mid Game"
    group = "group1"
    quests = [
        { id = "q2", x = 0.0d, y = 0.0d, title = "Progress", tasks = [{ id = "t2", type = "item", title = "Get Iron", item = "minecraft:iron_ingot", count = 8L }] }
    ]
}"#).unwrap();

    // Chapter 3 (no group)
    std::fs::write(ch3_dir.join("chapter.snbt"), r#"{
    id = "ch3"
    filename = "chapter_3"
    title = "End Game"
    quests = [
        { id = "q3", x = 0.0d, y = 0.0d, title = "Finish", tasks = [{ id = "t3", type = "checkmark", title = "Done" }] }
    ]
}"#).unwrap();

    // Import
    let result = import_ftb_quests(tmp.path()).unwrap();
    assert!(result.chapter_count >= 3, "Expected 3 chapters, got {}", result.chapter_count);
    assert!(result.quest_count >= 3);

    // Export
    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&result.graph, export_dir.path(), &result.sidecar).unwrap();

    // Re-import
    let result2 = import_ftb_quests(export_dir.path()).unwrap();
    assert!(result2.chapter_count >= 3, "Expected 3 chapters in re-import, got {}", result2.chapter_count);
    assert!(result2.quest_count >= 3);

    // Verify all quest labels survive
    let labels2: Vec<&str> = result2.graph.nodes.iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Quest))
        .map(|n| n.label.as_str())
        .collect();
    assert!(labels2.contains(&"Start"), "Missing 'Start' quest in round-trip");
    assert!(labels2.contains(&"Progress"), "Missing 'Progress' quest in round-trip");
    assert!(labels2.contains(&"Finish"), "Missing 'Finish' quest in round-trip");
}

#[test]
fn test_flat_chapters_layout() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();

    // Write data.snbt
    std::fs::write(quests_dir.join("data.snbt"), r#"{
    default_quest_shape: "circle"
    progression_mode: "linear"
}"#).unwrap();

    // Write chapter_groups.snbt
    std::fs::write(quests_dir.join("chapter_groups.snbt"), r#"{
    chapter_groups: [
        { id: "group1" }
    ]
}"#).unwrap();

    // Write a flat chapter file (old format: quests inline in chapter snbt)
    let chapter_snbt = r#"{
    id = "chapter_ae2"
    filename = "ae2"
    default_quest_shape = ""
    group = "group1"
    quests = [
        {
            id = "quest1"
            x = 1.0d
            y = 2.0d
            title = "AE2 Guide"
            description = ["Learn Applied Energistics 2"]
            tasks = [
                {
                    id = "task1"
                    type = "item"
                    title = "Get ME Controller"
                    item = "ae2:controller"
                    count = 1L
                }
            ]
        }
    ]
}"#;
    std::fs::write(chapters_dir.join("ae2.snbt"), chapter_snbt).unwrap();

    // Write a second chapter
    let chapter2 = r#"{
    id = "chapter_create"
    filename = "create"
    title = "Create Mod"
    quests = [
        {
            id = "quest2"
            x = 0.0d
            y = 0.0d
            title = "Mechanical Craft"
            tasks = [
                {
                    id = "task2"
                    type = "item"
                    title = "Crush Ore"
                    item = "create:crushing_wheel"
                    count = 4L
                }
            ]
        }
    ]
}"#;
    std::fs::write(chapters_dir.join("create.snbt"), chapter2).unwrap();

    // Import
    let result = import_ftb_quests(tmp.path()).unwrap();
    assert_eq!(result.format, "Snbt");
    assert_eq!(result.layout, "FlatChapters");
    assert!(result.chapter_count >= 2);
    assert!(result.quest_count >= 2);

    // Verify chapters were parsed
    let chapters: Vec<_> = result.graph.chapters.iter().collect();
    assert!(chapters.len() >= 2);

    // Verify quests
    let quest_nodes: Vec<_> = result.graph.nodes.iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Quest))
        .collect();
    assert!(quest_nodes.len() >= 2);
    let labels: Vec<&str> = quest_nodes.iter().map(|n| n.label.as_str()).collect();
    assert!(labels.contains(&"AE2 Guide"));
    assert!(labels.contains(&"Mechanical Craft"));
}

#[test]
fn layout_for_version_maps_1_21_to_flat_chapters() {
    use crate::imports::ftb_quests::FtBQuestsLayout;
    // Verified against the shipped 1.21.1 jar (2101.1.30): the ONLY loadable
    // layout is chapters/ (path template "chapters/%s.snbt").
    assert_eq!(layout_for_version("1.21.1"), Some(FtBQuestsLayout::FlatChapters));
    assert_eq!(layout_for_version("1.21.4"), Some(FtBQuestsLayout::FlatChapters));
    // Unverified versions keep the pre-existing behavior.
    assert_eq!(layout_for_version("1.20.1"), None);
    assert_eq!(layout_for_version(""), None);
}

#[test]
fn export_override_forces_flat_chapters_for_subdirs_graph() {
    use crate::imports::ftb_quests::FtBQuestsLayout;
    // A graph whose layout says "Subdirs" records what the pack directory
    // contained — not what FTB 1.21.x can load. The version-aware override
    // must migrate it to chapters/*.snbt (the s42 bug: Monster's subdirs
    // export loaded 0 chapters in-game).
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let ch_dir = quests_dir.join("chapter_1");
    std::fs::create_dir_all(&ch_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();
    std::fs::write(ch_dir.join("chapter.snbt"), r#"{
    id = "ch1"
    filename = "chapter_1"
    title = "Early Game"
    quests = [
        { id = "q1", x = 0.0d, y = 0.0d, title = "Start", tasks = [{ id = "t1", type = "checkmark", title = "Begin" }] }
    ]
}"#).unwrap();

    let result = import_ftb_quests(tmp.path()).unwrap();
    assert_eq!(result.layout, "Subdirs");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt_for_layout(&result.graph, export_dir.path(), &result.sidecar, Some(FtBQuestsLayout::FlatChapters)).unwrap();

    let out_quests = export_dir.path().join("config").join("ftbquests").join("quests");
    let flat_files: Vec<_> = std::fs::read_dir(out_quests.join("chapters"))
        .map(|e| e.flatten().filter(|p| p.path().extension().map_or(false, |x| x == "snbt")).collect())
        .unwrap_or_default();
    assert_eq!(flat_files.len(), 1, "expected exactly one chapter file in chapters/");
    assert!(!out_quests.join("chapter_1").join("chapter.snbt").exists(), "subdirs copy must be gone");

    // The flat output re-imports as FlatChapters (the layout FTB 1.21 loads).
    let result2 = import_ftb_quests(export_dir.path()).unwrap();
    assert_eq!(result2.layout, "FlatChapters");
    assert!(result2.chapter_count >= 1, "chapter survived the migration");
}

#[test]
fn test_checkmark_quest_uses_accept_icon() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    std::fs::create_dir_all(quests_dir.join("chapter_1")).unwrap();

    std::fs::write(quests_dir.join("data.snbt"), r#"{
    version: 13
    default_quest_shape: "circle"
}"#).unwrap();

    // One checkmark-only quest (no icon field) and one item quest
    std::fs::write(quests_dir.join("chapter_1").join("chapter.snbt"), r#"{
    id = "ch1"
    filename = "chapter_1"
    title = "Start"
    quests = [
        {
            id = "q1"
            x = 0.0d
            y = 0.0d
            title = "Click Me"
            tasks = [
                { id = "t1", type = "checkmark", title = "Begin" }
            ]
        }
    ]
}"#).unwrap();

    let result = import_ftb_quests(tmp.path()).unwrap();
    let checkmark_node = result.graph.nodes.iter()
        .find(|n| n.id.contains("q1"))
        .expect("checkmark quest node present");
    // In-game FTB shows Icons.ACCEPT_GRAY for checkmark tasks, so the
    // imported icon must be the resolvable accept_gray texture rather than
    // the unresolvable "minecraft:" fallback.
    assert!(
        checkmark_node.icon.contains("accept"),
        "expected accept icon, got {:?}",
        checkmark_node.icon
    );
    assert!(
        !checkmark_node.icon.is_empty() && checkmark_node.icon != "minecraft:",
        "icon should not be the empty minecraft: fallback"
    );
}

#[test]
fn test_real_ftb_skies_2() {
    let pack_dir = std::path::PathBuf::from(
        std::env::var("HOME").unwrap_or_default()
    ).join(".local/share/PrismLauncher/instances/FTB Skies 2/minecraft");
    if !pack_dir.exists() {
        eprintln!("Skipping real FTB Skies 2 test: instance not found");
        return;
    }
    let result = import_ftb_quests(&pack_dir);
    match result {
        Ok(r) => {
            eprintln!("Import OK: {} chapters, {} quests, format={}, layout={}",
                r.chapter_count, r.quest_count, r.format, r.layout);
            assert!(r.chapter_count > 0, "Expected chapters");
            assert!(r.quest_count > 0, "Expected quests");
        }
        Err(e) => {
            panic!("Import failed: {}", e);
        }
    }
}
