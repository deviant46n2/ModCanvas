//! Book/global settings and reward-table export round-trip tests.

use super::*;
use crate::quest::*;
use tempfile;

#[test]
fn global_settings_roundtrip_through_export() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    std::fs::create_dir_all(&quests_dir).unwrap();
    std::fs::write(
        quests_dir.join("data.snbt"),
        r#"{
        version: 13
        default_reward_team: 1b
        default_consume_items: 1b
        default_autoclaim_rewards: "enabled"
        detection_delay: 40
    }"#,
    )
    .unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    assert!(graph.default_reward_team, "default_reward_team parsed");
    assert!(graph.default_consume_items, "default_consume_items parsed");
    assert_eq!(graph.default_autoclaim_rewards, "enabled");
    assert_eq!(graph.detection_delay, 40);

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    let data_path = export_dir.path().join("config").join("ftbquests").join("quests").join("data.snbt");
    let content = std::fs::read_to_string(&data_path).expect("data.snbt written");
    assert!(content.contains("default_reward_team: 1b"), "reward team persisted");
    assert!(content.contains("default_consume_items: 1b"), "consume items persisted");
    assert!(content.contains("\"enabled\""), "autoclaim persisted");
    assert!(content.contains("detection_delay: 40"), "detection delay persisted");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    assert!(graph2.default_reward_team, "reward team survives round-trip");
    assert!(graph2.default_consume_items, "consume items survive round-trip");
    assert_eq!(graph2.default_autoclaim_rewards, "enabled");
    assert_eq!(graph2.detection_delay, 40);
}

#[test]
fn book_level_settings_roundtrip_through_export() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    std::fs::create_dir_all(&quests_dir).unwrap();
    std::fs::write(
        quests_dir.join("data.snbt"),
        r#"{
        version: 13
        icon: {
            id: "minecraft:stone"
        }
        emergency_items: [
            {
                count: 1
                id: "minecraft:grass_block"
            }
            {
                count: 3
                id: "enderio:grains_of_infinity"
            }
        ]
        emergency_items_cooldown: 300
        lock_message: "You must unlock this first"
        show_lock_icons: true
        fallback_locale: "en_us"
        disable_gui: false
        pause_game: true
        drop_book_on_death: true
        drop_loot_crates: false
        hide_excluded_quests: true
        verify_on_load: false
        default_quest_disable_jei: true
        loot_crate_no_drop: {
            boss: 25
            monster: 50
            passive: 0
        }
    }"#,
    )
    .unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    assert_eq!(graph.emergency_items.len(), 2, "emergency items parsed");
    assert_eq!(graph.book_icon, "minecraft:stone", "book icon id parsed from compound");
    assert_eq!(graph.emergency_items[0].id, "minecraft:grass_block");
    assert_eq!(graph.emergency_items[0].count, 1);
    assert_eq!(graph.emergency_items[1].count, 3);
    assert_eq!(graph.emergency_items_cooldown, 300);
    assert_eq!(graph.lock_message, "You must unlock this first");
    assert!(graph.show_lock_icons);
    assert_eq!(graph.fallback_locale, "en_us");
    assert!(!graph.disable_gui);
    assert!(graph.pause_game);
    assert!(graph.drop_book_on_death);
    assert!(!graph.drop_loot_crates);
    assert!(graph.hide_excluded_quests);
    assert!(!graph.verify_on_load);
    assert!(graph.default_quest_disable_jei);
    assert_eq!(graph.loot_crate_no_drop.boss, 25);
    assert_eq!(graph.loot_crate_no_drop.monster, 50);
    assert_eq!(graph.loot_crate_no_drop.passive, 0);

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    let data_path = export_dir.path().join("config").join("ftbquests").join("quests").join("data.snbt");
    let content = std::fs::read_to_string(&data_path).expect("data.snbt written");
    assert!(content.contains("emergency_items_cooldown: 300"), "cooldown persisted");
    assert!(content.contains("icon: {"), "book icon compound written");
    assert!(content.contains("\"minecraft:stone\""), "book icon id persisted");
    assert!(content.contains("\"You must unlock this first\""), "lock message persisted");
    assert!(content.contains("show_lock_icons: 1b"), "show lock icons persisted");
    assert!(content.contains("\"en_us\""), "fallback locale persisted");
    assert!(content.contains("drop_book_on_death: 1b"), "drop book persisted");
    assert!(content.contains("boss: 25"), "loot crate boss persisted");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    assert_eq!(graph2.emergency_items.len(), 2, "emergency items survive round-trip");
    assert_eq!(graph2.book_icon, "minecraft:stone", "book icon survives round-trip");
    assert_eq!(graph2.emergency_items[0].id, "minecraft:grass_block");
    assert_eq!(graph2.emergency_items[1].id, "enderio:grains_of_infinity");
    assert_eq!(graph2.emergency_items[1].count, 3);
    assert_eq!(graph2.emergency_items_cooldown, 300);
    assert_eq!(graph2.lock_message, "You must unlock this first");
    assert!(graph2.show_lock_icons);
    assert_eq!(graph2.fallback_locale, "en_us");
    assert!(graph2.pause_game);
    assert!(graph2.drop_book_on_death);
    assert!(graph2.hide_excluded_quests);
    assert!(graph2.default_quest_disable_jei);
    assert_eq!(graph2.loot_crate_no_drop.boss, 25);
    assert_eq!(graph2.loot_crate_no_drop.monster, 50);
    assert_eq!(graph2.loot_crate_no_drop.passive, 0);
}

#[test]
fn global_settings_defaults_when_absent() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    std::fs::create_dir_all(&quests_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    let graph = import_ftb_quests(tmp.path()).unwrap().graph;
    assert!(!graph.default_reward_team);
    assert!(!graph.default_consume_items);
    assert_eq!(graph.default_autoclaim_rewards, "disabled");
    assert_eq!(graph.detection_delay, 20);
}

#[test]
fn reward_table_roundtrips_through_export() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    let tables_dir = quests_dir.join("reward_tables");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::create_dir_all(&tables_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    // A reward table (hex id) and a chapter with a random + choice reward referencing it.
    std::fs::write(tables_dir.join("00E1FAFD0EF07752.snbt"), r#"{
    id: "00E1FAFD0EF07752"
    order_index: 0
    loot_size: 1
    rewards: [
        { id: "11A553146CF97DDB", item: { id: "minecraft:diamond", count: 1 }, count: 3, weight: 2.0 }
        { id: "28EE0BB3E39D7CB3", item: { id: "minecraft:emerald", count: 1 }, count: 1 }
    ]
}"#).unwrap();
    std::fs::write(chapters_dir.join("loot.snbt"), r#"{
    id = "ch_loot"
    filename = "loot"
    title = "Loot"
    quests = [
        {
            id = "q1"
            x = 0.0d
            y = 0.0d
            rewards = [
                { id = "r1", type = "random", table_id: 63607834544207698L }
                { id = "r2", type = "choice", table_id: 63607834544207698L }
            ]
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    assert_eq!(graph.reward_tables.len(), 1, "one reward table imported");
    let table = &graph.reward_tables[0];
    assert_eq!(table.id, "00E1FAFD0EF07752");
    assert_eq!(table.rewards.len(), 2);
    assert_eq!(table.rewards[0].item_id, "minecraft:diamond");
    assert_eq!(table.rewards[0].weight, 2.0);
    assert_eq!(table.rewards[0].count, 3, "top-level reward count captured on import");

    let node = graph.nodes.iter().find(|n| n.id == "q1").expect("quest imported");
    assert_eq!(node.rewards.len(), 2);
    assert_eq!(node.rewards[0].table_id, "00E1FAFD0EF07752", "random reward table_id resolved");
    assert_eq!(node.rewards[1].table_id, "00E1FAFD0EF07752", "choice reward table_id resolved");
    assert!(!node.rewards[0].items.is_empty(), "random reward items populated from table");

    // Export then re-import.
    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    assert!(export_dir.path().join("config").join("ftbquests").join("quests").join("reward_tables").join("00E1FAFD0EF07752.snbt").exists(),
        "reward table file written");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    assert_eq!(graph2.reward_tables.len(), 1, "reward table survived export");
    assert_eq!(graph2.reward_tables[0].rewards[0].count, 3, "top-level reward count survived export");
    assert_eq!(graph2.reward_tables[0].rewards[0].item_id, "minecraft:diamond");
    let node2 = graph2.nodes.iter().find(|n| n.id == "q1").expect("quest re-imported");
    assert_eq!(node2.rewards[0].table_id, "00E1FAFD0EF07752", "table_id reference survived export");
}

#[test]
fn reward_table_id_long_hex_mapping() {
    // FTB writes table_id as the raw long; files are keyed by 16-digit uppercase hex.
    let hex = "00E1FAFD0EF07752";
    let long_id = i64::from_str_radix(hex, 16).unwrap();
    assert_eq!(RewardTable::to_hex_id(long_id), hex);
    assert_eq!(RewardTable::to_long_id(hex), long_id);
    // Reference from the StoneBlock 4 sample.
    assert_eq!(RewardTable::to_long_id("37F7F856288632A7"), 4032965040264327847);
}
