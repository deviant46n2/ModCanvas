//! Smart-filter DSL and icon-scale export round-trip tests.

use super::*;
use crate::quest::*;
use tempfile;

#[test]
fn smart_filter_dsl_roundtrips_through_export() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("smartfilter.snbt"), r#"{
    id = "ch_sf"
    filename = "smartfilter"
    title = "Smart Filter"
    quests = [
        {
            id = "q1"
            x: 1.5d
            y: 2.0d
            tasks = [{
                id: "t1"
                item: { components: { "ftbfiltersystem:filter": "or(item(buildinggadgets2:gadget_building)item(buildinggadgets2:gadget_exchanging))" }, count: 1, id: "ftbfiltersystem:smart_filter" }
                type: "item"
            }]
            rewards = [{
                id: "r1"
                item: { components: { "ftbfiltersystem:filter": "ftbfiltersystem:item_tag(minecraft:hoes)" }, count: 1, id: "ftbfiltersystem:smart_filter" }
                type: "item"
            }]
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    let node = graph.nodes.iter().find(|n| n.id == "q1").expect("quest imported");
    let obj = &node.objectives[0];
    assert_eq!(obj.target, "ftbfiltersystem:smart_filter");
    assert_eq!(
        obj.smart_filter,
        "or(item(buildinggadgets2:gadget_building)item(buildinggadgets2:gadget_exchanging))"
    );
    let reward = &node.rewards[0];
    assert_eq!(reward.item_id, "ftbfiltersystem:smart_filter");
    assert_eq!(reward.smart_filter, "ftbfiltersystem:item_tag(minecraft:hoes)");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    let graph2_import = import_ftb_quests(export_dir.path()).unwrap();
    let graph2 = graph2_import.graph;
    let node2 = graph2.nodes.iter().find(|n| n.id == "q1").expect("quest re-imported");
    assert_eq!(node2.objectives[0].target, "ftbfiltersystem:smart_filter");
    assert_eq!(node2.objectives[0].smart_filter, obj.smart_filter, "task DSL survives export");
    assert_eq!(node2.rewards[0].smart_filter, reward.smart_filter, "reward DSL survives export");
}

#[test]
fn icon_scale_roundtrips_through_export() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("iconscale.snbt"), r#"{
    id = "ch_is"
    filename = "iconscale"
    title = "Icon Scale"
    quests = [
        {
            id = "q1"
            icon_scale: 1.5d
        }
        {
            id = "q2"
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    let q1 = graph.nodes.iter().find(|n| n.id == "q1").expect("quest imported");
    assert!((q1.icon_scaling - 1.5).abs() < 1e-9, "icon_scale parsed from FTB key, got {}", q1.icon_scaling);
    let q2 = graph.nodes.iter().find(|n| n.id == "q2").expect("quest imported");
    assert!((q2.icon_scaling - 1.0).abs() < 1e-9, "default icon_scale is 1.0");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    // FTB reads `icon_scale` in both layouts — the emitted key must match.
    let exported_chapters_dir = export_dir.path().join("config").join("ftbquests").join("quests").join("chapters");
    let exported_flat = std::fs::read_to_string(
        exported_chapters_dir.join("Icon_Scale.snbt")
    ).expect("flat chapter exported");
    assert!(exported_flat.contains("icon_scale"), "flat layout writes FTB's icon_scale key");
    assert!(!exported_flat.contains("icon_scaling"), "flat layout must not write the legacy key");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    let q1b = graph2.nodes.iter().find(|n| n.id == "q1").expect("quest re-imported");
    assert!((q1b.icon_scaling - 1.5).abs() < 1e-9, "icon_scale survives export");
    let q2b = graph2.nodes.iter().find(|n| n.id == "q2").expect("quest re-imported");
    assert!((q2b.icon_scaling - 1.0).abs() < 1e-9);
}
