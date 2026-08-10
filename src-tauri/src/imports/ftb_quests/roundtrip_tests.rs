use super::*;
use crate::quest::*;

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
    export_ftb_quests_snbt(&result.graph, export_dir.path(), &result.sidecar).unwrap();

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
    export_ftb_quests_snbt(&result.graph, export_dir.path(), &result.sidecar).unwrap();

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
    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;

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
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

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

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    assert_eq!(graph.grid_scale, 0.5, "grid_scale should be imported from data.snbt");

    // Mutate to a different grain and confirm it round-trips.
    graph.grid_scale = 1.0;
    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
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
