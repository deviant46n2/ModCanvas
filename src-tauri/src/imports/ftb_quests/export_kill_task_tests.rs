//! Kill-task and reward bonus-field export round-trip test.

use super::*;
use crate::quest::*;
use tempfile;

#[test]
fn kill_task_and_reward_bonus_fields_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("bonus.snbt"), r#"{
    id = "ch_bonus"
    filename = "bonus"
    title = "Bonus"
    quests = [
        {
            id = "q1"
            x = 0.0d
            y = 0.0d
            title = "Kill Tagged"
            tasks = [
                {
                    id = "t0"
                    type = "item"
                    item = "minecraft:iron_ingot"
                    count = 4L
                    consume_items = 1b
                    task_screen_only = 1b
                    only_from_crafting = 1b
                    match_components = 1b
                }
                {
                    id = "t1"
                    type = "kill"
                    entity = "minecraft:zombie"
                    entityTypeTag = "minecraft:undead"
                    custom_name = "Wither Warden"
                    nbt_filter = "{Damage: 3}"
                    value = 5L
                }
            ]
            rewards = [
                { id = "r1", type = "item", item = { id = "minecraft:diamond", count = 1 }, random_bonus = 1.5d, only_one = 1b }
                { id = "r2", type = "command", command = "give @p minecraft:stick 1", permission_level = 2, silent = 1b, feedback_message = "Granted!" }
            ]
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    let node = graph.nodes.iter().find(|n| n.id == "q1").expect("quest imported");
    let item_task = node.objectives.iter().find(|o| o.id == "t0").expect("item task imported");
    assert_eq!(item_task.target, "minecraft:iron_ingot");
    assert_eq!(item_task.target_count, 4, "item task count imported");
    assert!(item_task.consume_items, "consume_items imported");
    assert!(item_task.task_screen_only, "task_screen_only imported");
    assert!(item_task.only_from_crafting, "only_from_crafting imported");
    assert!(item_task.match_components, "match_components imported");
    let kill = node.objectives.iter().find(|o| o.id == "t1").expect("kill task imported");
    assert_eq!(kill.entity_id, "minecraft:zombie");
    assert_eq!(kill.entity_type_tag, "minecraft:undead", "kill tag imported");
    assert_eq!(kill.custom_name, "Wither Warden", "kill custom_name imported");
    assert_eq!(kill.nbt_filter, "{Damage: 3}", "kill nbt_filter imported");
    assert_eq!(kill.target_count, 5, "kill count imported from value");

    let item = node.rewards.iter().find(|r| r.id == "r1").expect("item reward imported");
    assert!((item.random_bonus - 1.5).abs() < 1e-9, "random_bonus imported");
    assert!(item.only_one, "only_one imported");
    let cmd = node.rewards.iter().find(|r| r.id == "r2").expect("command reward imported");
    assert_eq!(cmd.permission_level, 2, "permission_level imported");
    assert!(cmd.silent, "silent imported");
    assert_eq!(cmd.feedback_message, "Granted!", "feedback_message imported");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    let exported = std::fs::read_to_string(
        export_dir.path().join("config").join("ftbquests").join("quests").join("chapters").join("Bonus.snbt")
    ).unwrap();
    assert!(exported.contains("entityTypeTag: \"minecraft:undead\""), "kill entityTypeTag exported");
    assert!(exported.contains("custom_name: \"Wither Warden\""), "kill custom_name exported");
    assert!(exported.contains("nbt_filter: \"{Damage: 3}\""), "kill nbt_filter exported");
    assert!(exported.contains("value: 5"), "kill value exported");
    assert!(!exported.contains("count: 5"), "kill must not write generic count");
    assert!(exported.contains("task_screen_only: 1b"), "task_screen_only exported");
    assert!(exported.contains("only_from_crafting: 1b"), "only_from_crafting exported");
    assert!(exported.contains("match_components: 1b"), "match_components exported");
    assert!(exported.contains("random_bonus: 1.5"), "random_bonus exported");
    assert!(exported.contains("only_one: 1b"), "only_one exported");
    assert!(exported.contains("permission_level: 2"), "permission_level exported");
    assert!(exported.contains("silent: 1b"), "silent exported");
    assert!(exported.contains("feedback_message: \"Granted!\""), "feedback_message exported");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    let node2 = graph2.nodes.iter().find(|n| n.id == "q1").expect("quest re-imported");
    let item_task2 = node2.objectives.iter().find(|o| o.id == "t0").expect("item task re-imported");
    assert!(item_task2.task_screen_only, "task_screen_only round-tripped");
    assert!(item_task2.only_from_crafting, "only_from_crafting round-tripped");
    assert!(item_task2.match_components, "match_components round-tripped");
    let kill2 = node2.objectives.iter().find(|o| o.id == "t1").expect("kill task re-imported");
    assert_eq!(kill2.entity_type_tag, "minecraft:undead", "kill tag round-tripped");
    assert_eq!(kill2.custom_name, "Wither Warden", "kill custom_name round-tripped");
    assert_eq!(kill2.nbt_filter, "{Damage: 3}", "kill nbt_filter round-tripped");
    assert_eq!(kill2.target_count, 5, "kill count round-tripped");
    let item2 = node2.rewards.iter().find(|r| r.id == "r1").expect("item reward re-imported");
    assert!((item2.random_bonus - 1.5).abs() < 1e-9, "random_bonus round-tripped");
    assert!(item2.only_one, "only_one round-tripped");
    let cmd2 = node2.rewards.iter().find(|r| r.id == "r2").expect("command reward re-imported");
    assert_eq!(cmd2.permission_level, 2, "permission_level round-tripped");
    assert!(cmd2.silent, "silent round-tripped");
    assert_eq!(cmd2.feedback_message, "Granted!", "feedback_message round-tripped");
}
