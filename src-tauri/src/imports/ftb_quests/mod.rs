mod types;
mod detect;
mod import;
pub mod export;

pub use types::*;
pub use detect::*;
pub use import::*;
pub use export::*;

#[cfg(test)]
mod export_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use super::*;
    use crate::imports::snbt::{SnbtValue, parse_snbt, compound_to_snbt};
    use crate::quest::*;
    use std::collections::HashMap;

    #[test]
    fn test_snbt_roundtrip() {
        let mut map = HashMap::new();
        map.insert("title".to_string(), ce(SnbtValue::String("Test Quest".to_string())));
        map.insert("x".to_string(), ce(SnbtValue::Double(100.0)));
        map.insert("optional".to_string(), ce(SnbtValue::Byte(1)));
        map.insert("count".to_string(), ce(SnbtValue::Long(64)));

        let snbt_str = compound_to_snbt(&map);
        assert!(snbt_str.contains("title: \"Test Quest\""));
        assert!(snbt_str.contains("x: 100.0d"));
        assert!(snbt_str.contains("optional: 1b"));
        assert!(snbt_str.contains("count: 64L"));
    }

    #[test]
    fn test_snbt_roundtrip_parse() {
        let mut map = HashMap::new();
        map.insert("title".to_string(), ce(SnbtValue::String("Hello World".to_string())));
        map.insert("count".to_string(), ce(SnbtValue::Int(42)));

        let snbt_str = compound_to_snbt(&map);
        let parsed = parse_snbt(&snbt_str).unwrap();
        let m = parsed.as_compound().unwrap();
        assert_eq!(m.get_str("title"), Some("Hello World"));
        assert_eq!(m.get_i64("count"), Some(42));
    }

    #[test]
    fn test_format_detection() {
        let tmp = tempfile::tempdir().unwrap();
        // Create SNBT marker
        std::fs::write(tmp.path().join("data.snbt"), "{}").unwrap();
        assert_eq!(detect_format(tmp.path()), FtBQuestsFormat::Snbt);

        // Create Json5 marker
        let tmp2 = tempfile::tempdir().unwrap();
        std::fs::write(tmp2.path().join("data.json5"), "{}").unwrap();
        assert_eq!(detect_format(tmp2.path()), FtBQuestsFormat::Json5);
    }

    #[test]
    fn test_import_export_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
        let chapter_dir = quests_dir.join("getting_started");
        std::fs::create_dir_all(&chapter_dir).unwrap();

        // Write a simple chapter
        let chapter_snbt = r#"{
    id = "chapter1"
    filename = "getting_started"
    title = "Getting Started"
    quests = [
        {
            id = "quest1"
            x = 0.0d
            y = 0.0d
            title = "Collect Wood"
            description = ["Punch a tree to get wood"]
            tasks = [
                {
                    id = "task1"
                    type = "item"
                    title = "Get Oak Log"
                    item = "minecraft:oak_log"
                    count = 16L
                }
            ]
            rewards = [
                {
                    id = "reward1"
                    type = "item"
                    title = "Starter Tools"
                    item = "minecraft:iron_axe"
                }
            ]
        }
    ]
}"#;
        std::fs::write(chapter_dir.join("chapter.snbt"), chapter_snbt).unwrap();

        // Also write data.snbt
        std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

        // Import
        let result = import_ftb_quests(tmp.path()).unwrap();
        assert_eq!(result.format, "Snbt");
        assert!(result.quest_count >= 1);
        assert!(result.chapter_count >= 1);

        // Verify parsed quest
        let quest_nodes: Vec<_> = result.graph.nodes.iter()
            .filter(|n| matches!(n.node_type, QuestNodeType::Quest))
            .collect();
        assert!(!quest_nodes.is_empty());
        assert_eq!(quest_nodes[0].label, "Collect Wood");
        assert_eq!(quest_nodes[0].position.x, 0.0);
        assert_eq!(quest_nodes[0].position.y, 0.0);
        assert!(!quest_nodes[0].objectives.is_empty());
        assert_eq!(quest_nodes[0].objectives[0].target, "minecraft:oak_log");
        assert_eq!(quest_nodes[0].objectives[0].target_count, 16);

        // Export
        let export_dir = tempfile::tempdir().unwrap();
        export_ftb_quests_snbt(&result.graph, export_dir.path()).unwrap();

        // Verify exported files exist
        assert!(export_dir.path().join("config/ftbquests/quests/data.snbt").exists());
        // The exporter creates directory names from sanitized titles, so "Getting Started" → "Getting_Started"
        let exported_chapter = export_dir.path().join("config/ftbquests/quests").join("Getting_Started");
        assert!(exported_chapter.join("chapter.snbt").exists(), "Expected chapter.snbt at {}", exported_chapter.display());

        // Re-import and verify roundtrip
        let result2 = import_ftb_quests(export_dir.path()).unwrap();
        let quests2: Vec<_> = result2.graph.nodes.iter()
            .filter(|n| matches!(n.node_type, QuestNodeType::Quest))
            .collect();
        assert!(!quests2.is_empty());
    }

    #[test]
    fn test_roundtrip_with_dependencies() {
        let tmp = tempfile::tempdir().unwrap();
        let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
        let chapter_dir = quests_dir.join("getting_started");
        std::fs::create_dir_all(&chapter_dir).unwrap();

        // Two quests with a dependency: q1 -> q2 (q2 depends on q1)
        let chapter_snbt = r#"{
    id = "chapter1"
    filename = "getting_started"
    title = "Getting Started"
    quests = [
        {
            id = "quest1"
            x = 0.0d
            y = 0.0d
            title = "Mine Wood"
            tasks = [{ id = "task1", type = "item", title = "Get Log", item = "minecraft:oak_log", count = 1L }]
        }
        {
            id = "quest2"
            x = 64.0d
            y = 0.0d
            title = "Craft Planks"
            dependencies = ["quest1"]
            tasks = [{ id = "task2", type = "item", title = "Craft Planks", item = "minecraft:oak_planks", count = 16L }]
        }
    ]
}"#;
        std::fs::write(chapter_dir.join("chapter.snbt"), chapter_snbt).unwrap();
        std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

        // Import
        let result = import_ftb_quests(tmp.path()).unwrap();
        let quests: Vec<_> = result.graph.nodes.iter()
            .filter(|n| matches!(n.node_type, QuestNodeType::Quest))
            .collect();
        assert_eq!(quests.len(), 2);

        // Verify edges were created from dependency
        assert!(!result.graph.edges.is_empty(), "Expected dependency edges");
        let found_dep = result.graph.edges.iter().any(|e| {
            e.source == "quest1" && e.target == "quest2" && e.edge_type == EdgeType::Prerequisite
        });
        assert!(found_dep, "Expected edge quest1 -> quest2");

        // Export
        let export_dir = tempfile::tempdir().unwrap();
        export_ftb_quests_snbt(&result.graph, export_dir.path()).unwrap();

        // Re-import and verify edges survive
        let result2 = import_ftb_quests(export_dir.path()).unwrap();
        let found_dep2 = result2.graph.edges.iter().any(|e| {
            e.source == "quest1" && e.target == "quest2" && e.edge_type == EdgeType::Prerequisite
        });
        assert!(found_dep2, "Dependency edge not preserved in round-trip");
        assert_eq!(result2.graph.nodes.len(), result.graph.nodes.len(),
            "Node count changed during round-trip");
    }

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
        export_ftb_quests_snbt(&result.graph, export_dir.path()).unwrap();

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
    fn test_roundtrip_with_quest_mutations() {
        let tmp = tempfile::tempdir().unwrap();
        let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
        let chapter_dir = quests_dir.join("chapter1");
        std::fs::create_dir_all(&chapter_dir).unwrap();

        std::fs::write(chapter_dir.join("chapter.snbt"), r#"{
    id = "ch1"
    filename = "chapter1"
    title = "Tutorial"
    quests = [
        {
            id = "q1"
            x = 0.0d
            y = 0.0d
            title = "First Quest"
            description = ["Do the thing"]
            tasks = [{ id = "t1", type = "item", title = "Get Item", item = "minecraft:dirt", count = 1L }]
            rewards = [{ id = "r1", type = "xp", xp = 100 }]
        }
    ]
}"#).unwrap();
        std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

        // Import
        let mut graph = import_ftb_quests(tmp.path()).unwrap().graph;

        // Mutate: change quest title and add an objective
        let quest = graph.nodes.iter_mut()
            .find(|n| n.id == "q1")
            .expect("Quest q1 not found");
        quest.label = "Renamed Quest".to_string();
        quest.objectives.push(QuestObjective {
            id: "t2".to_string(),
            label: "Second Objective".to_string(),
            objective_type: ObjectiveType::ItemAcquisition,
            target: "minecraft:stone".to_string(),
            target_count: 8,
            ..Default::default()
        });
        quest.description = "Updated description".to_string();

        // Remove the original task to avoid duplicates
        quest.objectives.retain(|o| o.id != "t1");

        // Export mutated graph
        let export_dir = tempfile::tempdir().unwrap();
        export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();

        // Re-import
        let result2 = import_ftb_quests(export_dir.path()).unwrap();
        let quest2 = result2.graph.nodes.iter()
            .find(|n| n.id == "q1")
            .expect("Quest q1 not found after mutation round-trip");

        assert_eq!(quest2.label, "Renamed Quest", "Quest title not preserved after mutation");
        assert_eq!(quest2.description, "Updated description", "Quest description not preserved after mutation");
        assert!(quest2.objectives.iter().any(|o| o.target == "minecraft:stone" && o.target_count == 8),
            "Added objective not found after mutation round-trip");
        assert_eq!(quest2.rewards.len(), 1, "Rewards should be preserved");
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
    fn test_grid_scale_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
        std::fs::create_dir_all(quests_dir.join("chapter_1")).unwrap();

        std::fs::write(quests_dir.join("data.snbt"), r#"{
    version: 13
    default_quest_shape: "circle"
    grid_scale: 0.5d
}"#).unwrap();
        std::fs::write(quests_dir.join("chapter_1").join("chapter.snbt"), r#"{
    id = "ch1"
    filename = "chapter_1"
    title = "Start"
    quests = []
}"#).unwrap();

        let mut graph = import_ftb_quests(tmp.path()).unwrap().graph;
        assert_eq!(graph.grid_scale, 0.5, "grid_scale should be imported from data.snbt");

        // Mutate to a different grain and confirm it round-trips.
        graph.grid_scale = 1.0;
        let export_dir = tempfile::tempdir().unwrap();
        export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();
        let result2 = import_ftb_quests(export_dir.path()).unwrap();
        assert_eq!(result2.graph.grid_scale, 1.0, "grid_scale should survive export/import");

        // Default (no grid_scale key) is 0.5, matching in-game.
        let bare = tempfile::tempdir().unwrap();
        let bare_q = bare.path().join("config").join("ftbquests").join("quests");
        std::fs::create_dir_all(bare_q.join("chapter_1")).unwrap();
        std::fs::write(bare_q.join("data.snbt"), "{version: 13}").unwrap();
        std::fs::write(bare_q.join("chapter_1").join("chapter.snbt"), r#"{
    id = "ch1"
    filename = "chapter_1"
    title = "Start"
    quests = []
}"#).unwrap();
        let graph3 = import_ftb_quests(bare.path()).unwrap().graph;
        assert_eq!(graph3.grid_scale, 0.5, "default grid_scale should be 0.5");
    }

    #[test]
    fn test_real_ftb_skies_2() {        let pack_dir = std::path::PathBuf::from(
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
}
