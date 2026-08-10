//! Location / stage / advancement task and reward common-field export
//! round-trip test.

use super::*;
use crate::quest::*;
use tempfile;

#[test]
fn location_box_stage_advancement_and_reward_common_fields_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    // Subdirs layout: quests_dir/<chapter_dir>/chapter.snbt (location keeps its real `location` type).
    let chapter_dir = quests_dir.join("Loc");
    std::fs::create_dir_all(&chapter_dir).unwrap();
    std::fs::write(chapter_dir.join("chapter.snbt"), r#"{
    id = "ch_loc"
    filename = "Loc"
    title = "Loc"
    quests = [
        {
            id = "q1"
            x = 0.0d
            y = 0.0d
            tasks = [
                {
                    id = "t_loc"
                    type = "location"
                    dimension = "minecraft:overworld"
                    ignore_dimension = 1b
                    position = [I; 12, 64, -30]
                    size = [I; 5, 3, 4]
                }
                {
                    id = "t_stage"
                    type = "stage"
                    stage = "midgame"
                    team_stage = 1b
                }
                {
                    id = "t_adv"
                    type = "advancement"
                    advancement = "minecraft:story/iron_tools"
                    criterion = "iron_pickaxe"
                }
                {
                    id = "t_opt"
                    type = "checkmark"
                    optional_task = 1b
                }
            ]
            rewards = [
                {
                    id = "r1"
                    type = "item"
                    item = { id = "minecraft:diamond", count = 1 }
                    team_reward = 1b
                    auto = "enabled"
                    exclude_from_claim_all = 1b
                    ignore_reward_blocking = 1b
                    disable_reward_screen_blur = 1b
                }
            ]
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    let node = graph.nodes.iter().find(|n| n.id == "q1").expect("quest imported");

    let loc = node.objectives.iter().find(|o| o.id == "t_loc").expect("location task imported");
    assert_eq!(loc.dimension, "minecraft:overworld");
    assert!(loc.ignore_dim, "ignore_dim imported from ignore_dimension");
    assert_eq!(loc.x, 12.0, "position[0] imported");
    assert_eq!(loc.y, 64.0, "position[1] imported");
    assert_eq!(loc.z, -30.0, "position[2] imported");
    assert_eq!(loc.box_w, 5.0, "size[0] imported");
    assert_eq!(loc.box_h, 3.0, "size[1] imported");
    assert_eq!(loc.box_d, 4.0, "size[2] imported");

    let stage = node.objectives.iter().find(|o| o.id == "t_stage").expect("stage task imported");
    assert_eq!(stage.advancement_id, "midgame", "stage name imported");
    assert!(stage.team_stage, "team_stage imported");

    let adv = node.objectives.iter().find(|o| o.id == "t_adv").expect("advancement task imported");
    assert_eq!(adv.advancement_id, "minecraft:story/iron_tools");
    assert_eq!(adv.criterion, "iron_pickaxe", "criterion imported");

    let opt = node.objectives.iter().find(|o| o.id == "t_opt").expect("checkmark task imported");
    assert!(!opt.required, "optional_task makes task optional");

    let reward = node.rewards.iter().find(|r| r.id == "r1").expect("item reward imported");
    assert!(reward.team_reward, "team_reward imported");
    assert_eq!(reward.autoclaim, "enabled", "auto imported");
    assert!(reward.exclude_from_claim_all, "exclude_from_claim_all imported");
    assert!(reward.ignore_reward_blocking, "ignore_reward_blocking imported");
    assert!(reward.disable_reward_screen_blur, "disable_reward_screen_blur imported");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    let exported = std::fs::read_to_string(
        export_dir.path().join("config").join("ftbquests").join("quests").join("Loc").join("chapter.snbt")
    ).unwrap();
    assert!(exported.contains("position: [I; 12, 64, -30]"), "position array exported: {exported}");
    assert!(exported.contains("size: [I; 5, 3, 4]"), "size array exported");
    assert!(exported.contains("ignore_dimension: 1b"), "ignore_dimension exported");
    assert!(exported.contains("team_stage: 1b"), "team_stage exported");
    assert!(exported.contains("criterion: \"iron_pickaxe\""), "criterion exported");
    assert!(exported.contains("optional_task: 1b"), "optional_task exported");
    assert!(!exported.contains("count:"), "checkmark must not write a count");
    assert!(exported.contains("team_reward: 1b"), "reward team_reward exported");
    assert!(exported.contains("auto: \"enabled\""), "reward auto exported");
    assert!(exported.contains("exclude_from_claim_all: 1b"), "reward exclude_from_claim_all exported");
    assert!(exported.contains("ignore_reward_blocking: 1b"), "reward ignore_reward_blocking exported");
    assert!(exported.contains("disable_reward_screen_blur: 1b"), "reward disable_reward_screen_blur exported");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    let node2 = graph2.nodes.iter().find(|n| n.id == "q1").expect("quest re-imported");
    let loc2 = node2.objectives.iter().find(|o| o.id == "t_loc").expect("location re-imported");
    assert_eq!(loc2.x, 12.0, "x round-tripped");
    assert_eq!(loc2.box_w, 5.0, "box_w round-tripped");
    assert!(loc2.ignore_dim, "ignore_dim round-tripped");
    let stage2 = node2.objectives.iter().find(|o| o.id == "t_stage").expect("stage re-imported");
    assert!(stage2.team_stage, "team_stage round-tripped");
    let adv2 = node2.objectives.iter().find(|o| o.id == "t_adv").expect("advancement re-imported");
    assert_eq!(adv2.criterion, "iron_pickaxe", "criterion round-tripped");
    let reward2 = node2.rewards.iter().find(|r| r.id == "r1").expect("reward re-imported");
    assert_eq!(reward2.autoclaim, "enabled", "auto round-tripped");
    assert!(reward2.exclude_from_claim_all, "exclude_from_claim_all round-tripped");
    assert!(reward2.ignore_reward_blocking, "ignore_reward_blocking round-tripped");
    assert!(reward2.disable_reward_screen_blur, "disable_reward_screen_blur round-tripped");
}
