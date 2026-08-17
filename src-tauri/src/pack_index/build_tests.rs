// Determinism lock for the Pack Index build: same instance + same graph →
// same index, guaranteed by test (roadmap completion criterion). The fixture
// exercises every input leg — item registry cache, recipe scan, tag index,
// quest graph — so the lock covers the whole assembly, not just one leg.

use super::build::build_pack_index;
use crate::indexer::{save_item_registry, ItemRegistryEntry};
use crate::pack_index::models::PackIndex;
use crate::quest::{QuestGraph, QuestNode, QuestNodeType, QuestReward};
use tempfile;

/// Build a minimal-but-complete fixture instance: one recipe, one tag with a
/// member, a companion-seeded item registry, and a saved quest graph with a
/// reward referencing one of the registered items. The TempDir is returned
/// WITH the path: the files live inside the tempdir, so dropping it early
/// would delete the fixture (the registry cache survives in ~/.cache, the
/// recipe/tag/graph files do not).
fn fixture_instance() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();

    // Recipe scan leg: data/minecraft/recipes/*.json.
    let recipes = root.join("data/minecraft/recipes");
    std::fs::create_dir_all(&recipes).unwrap();
    std::fs::write(
        recipes.join("diamond_block.json"),
        r#"{"type":"minecraft:crafting_shaped","pattern":["AA","AA"],"key":{"A":{"item":"minecraft:diamond"}},"result":{"item":"minecraft:diamond_block"}}"#,
    )
    .unwrap();

    // Tag index leg: data/<ns>/tags/items/*.json with a member item.
    let tags = root.join("data/testmod/tags/items");
    std::fs::create_dir_all(&tags).unwrap();
    std::fs::write(
        tags.join("gems.json"),
        r#"{"replace":false,"values":["minecraft:diamond"]}"#,
    )
    .unwrap();

// Item registry leg: companion-authoritative cache, seeded directly so the
    // scan returns the registered universe. scan_instance_items bails to empty
    // when there are no jars AND no kubejs scripts (indexer/mod.rs:69), so the
    // fixture carries one throwaway script to keep the scan path alive.
    let kube = root.join("kubejs/server_scripts");
    std::fs::create_dir_all(&kube).unwrap();
    std::fs::write(kube.join("keepalive.js"), "console.log('pack index fixture');").unwrap();

    let entries = vec![
        ItemRegistryEntry { id: "minecraft:diamond".into(), mod_id: "minecraft".into(), name: "Diamond".into(), texture_data_url: None },
        ItemRegistryEntry { id: "minecraft:diamond_block".into(), mod_id: "minecraft".into(), name: "Block of Diamond".into(), texture_data_url: None },
    ];
    save_item_registry(root, entries).unwrap();

    // Quest graph leg: one node rewarding a REGISTERED item + one rewarding a
    // MISSING item (the dead reference must surface as a named finding).
    let graph = QuestGraph {
        id: "g".into(),
        project_id: "proj".into(),
        name: "Fixtures".into(),
        nodes: vec![
            QuestNode {
                id: "n_registered".into(),
                node_type: QuestNodeType::Quest,
                label: "Registered".into(),
                rewards: vec![QuestReward {
                    item_id: "minecraft:diamond".into(),
                    items: vec![],
                    ..Default::default()
                }],
                ..Default::default()
            },
            QuestNode {
                id: "n_missing".into(),
                node_type: QuestNodeType::Quest,
                label: "Missing".into(),
                rewards: vec![QuestReward {
                    item_id: "minecraft:missing_quest_item".into(),
                    items: vec![],
                    ..Default::default()
                }],
                ..Default::default()
            },
        ],
        ..Default::default()
    };
    let graph_path = crate::path_safety::quest_graph_path(root.to_string_lossy().as_ref()).unwrap();
    crate::path_safety::atomic_write_str(&graph_path, &serde_json::to_string(&graph).unwrap()).unwrap();

    let path = root.to_string_lossy().to_string();
    (dir, path)
}

#[test]
fn pack_index_build_is_deterministic() {
    let (_dir, path) = fixture_instance();
    let a = build_pack_index("proj", std::path::Path::new(&path), "kubejs");
    let b = build_pack_index("proj", std::path::Path::new(&path), "kubejs");
    assert_eq!(a, b, "same instance + same graph must produce the same index");
}

#[test]
fn pack_index_covers_all_input_legs() {
    let (_dir, path) = fixture_instance();
    let index = build_pack_index("proj", std::path::Path::new(&path), "kubejs");

    // Items: the registered universe.
    assert!(index.items.contains(&"minecraft:diamond".to_string()), "registered item in items");
    assert!(index.items.contains(&"minecraft:diamond_block".to_string()), "recipe output in items");

    // Recipes: the diamond_block recipe with its ingredient.
    assert_eq!(index.recipe_ids, vec!["minecraft:diamond_block".to_string()]);
    assert!(index.references.iter().any(|r| r.source_kind == "recipe" && r.item_id == "minecraft:diamond"),
        "recipe ingredient reference present");

    // Recipe outputs: the craftability spine — the output item, NOT the
    // ingredient (availability consumers must not infer craftability from
    // references, which conflate output + ingredient).
    assert_eq!(index.recipe_outputs, vec!["minecraft:diamond_block".to_string()],
        "recipe_outputs lists the output item only");

    // Tags: canonical #ns:path id + the member reference.
    assert!(index.tags.contains(&"#testmod:gems".to_string()), "tag id canonicalized with #");
    assert!(index.references.iter().any(|r| r.source_kind == "tag" && r.source_id == "testmod:gems" && r.item_id == "minecraft:diamond"),
        "tag member reference present");

    // Quests: node ids indexed + reward references.
    assert!(index.quest_ids.contains(&"n_registered".to_string()));
    assert!(index.references.iter().any(|r| r.source_kind == "quest" && r.source_id == "n_registered" && r.item_id == "minecraft:diamond"),
        "quest reward reference present");

    // Dead references: the missing quest item is NAMED, never silent.
    assert!(index.dead_references.iter().any(|f| f.source_kind == "quest" && f.referenced_id == "minecraft:missing_quest_item" && !f.resolved),
        "missing item surfaces as a named dead finding");
}