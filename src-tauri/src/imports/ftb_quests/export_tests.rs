use super::*;
use crate::quest::*;
use tempfile;

fn images_roundtrip(mut graph: QuestGraph, expected: usize) -> QuestGraph {
    let chapters_with_images: Vec<_> = graph.chapters.iter().filter(|c| !c.images.is_empty()).collect();
    assert_eq!(chapters_with_images.len(), expected, "expected {expected} chapter(s) with images after import");

    if let Some(ch) = chapters_with_images.first() {
        let img = &ch.images[0];
        assert!(!img.image.is_empty(), "image path must be non-empty");
        assert!(img.x != 0.0 || img.y != 0.0, "image position should round-trip");
    }

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();
    import_ftb_quests(export_dir.path()).unwrap().graph
}

#[test]
fn test_flat_chapter_images_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("decorated.snbt"), r#"{
    id = "ch_dec"
    filename = "decorated"
    title = "Decorated"
    images: [
        {
            height: 2.0d
            image: "atm:textures/questpics/basicarmor/armor_title.png"
            rotation: 0.0d
            width: 13.30952380952381d
            x: 4.5d
            y: -1.5d
        }
        {
            height: 1.5d
            image: "atm:textures/questpics/basicarmor/armor_trims.png"
            rotation: 10.0d
            width: 9.982142857142858d
            x: -5.5d
            y: 5.5d
            order: 1
        }
    ]
    quests = []
}"#).unwrap();

    let mut graph = import_ftb_quests(tmp.path()).unwrap().graph;
    let images = graph.chapters.iter().find(|c| c.id == "ch_dec").map(|c| c.images.clone()).expect("chapter has images");
    assert_eq!(images.len(), 2);
    assert_eq!(images[0].image, "atm:textures/questpics/basicarmor/armor_title.png");
    assert!((images[0].x - 4.5).abs() < 1e-9);
    assert!((images[0].width - 13.30952380952381).abs() < 1e-9);
    assert_eq!(images[1].order, 1);
    assert!((images[1].rotation - 10.0).abs() < 1e-9);

    // Mutate: move the first decoration and rotate the second
    let ch = graph.chapters.iter_mut().find(|c| c.id == "ch_dec").unwrap();
    ch.images[0].x = 8.0;
    ch.images[0].y = 3.0;
    ch.images[1].rotation = 45.0;

    let graph2 = images_roundtrip(graph, 1);
    let imgs2 = graph2.chapters.iter().find(|c| c.id == "ch_dec").map(|c| &c.images).expect("images survive export");
    assert_eq!(imgs2.len(), 2, "decoration count preserved");
    assert!((imgs2[0].x - 8.0).abs() < 1e-9, "moved x persisted, got {}", imgs2[0].x);
    assert!((imgs2[0].y - 3.0).abs() < 1e-9, "moved y persisted");
    assert!((imgs2[1].rotation - 45.0).abs() < 1e-9, "rotation persisted");
}

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

    let graph = import_ftb_quests(tmp.path()).unwrap().graph;
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
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();

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

    let graph = import_ftb_quests(tmp.path()).unwrap().graph;
    let q1 = graph.nodes.iter().find(|n| n.id == "q1").expect("quest imported");
    assert!((q1.icon_scaling - 1.5).abs() < 1e-9, "icon_scale parsed from FTB key, got {}", q1.icon_scaling);
    let q2 = graph.nodes.iter().find(|n| n.id == "q2").expect("quest imported");
    assert!((q2.icon_scaling - 1.0).abs() < 1e-9, "default icon_scale is 1.0");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();

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

#[test]
fn test_delete_all_decorations_persists() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("decorated.snbt"), r#"{
    id = "ch_dec"
    filename = "decorated"
    title = "Decorated"
    images: [
        { image: "atm:textures/questpics/star.png", x: 1.0d, y: 2.0d, width: 3.0d, height: 3.0d }
    ]
    quests = []
}"#).unwrap();

    let mut graph = import_ftb_quests(tmp.path()).unwrap().graph;
    graph.chapters.iter_mut().find(|c| c.id == "ch_dec").unwrap().images.clear();

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();
    let result2 = import_ftb_quests(export_dir.path()).unwrap();
    let imgs2 = result2.graph.chapters.iter().find(|c| c.id == "ch_dec").map(|c| c.images.len()).unwrap();
    assert_eq!(imgs2, 0, "deleting all decorations must persist through export");
}

#[test]
fn test_subdirs_chapter_images_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapter_dir = quests_dir.join("decorated");
    std::fs::create_dir_all(&chapter_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapter_dir.join("chapter.snbt"), r#"{
    id = "ch_dec"
    filename = "decorated"
    title = "Decorated"
    images: [
        { image: "atm:textures/questpics/chap2/creative_star", x: -2.0d, y: 1.0d, width: 4.0d, height: 4.0d }
    ]
    quests = []
}"#).unwrap();

    let graph = images_roundtrip(import_ftb_quests(tmp.path()).unwrap().graph, 1);
    let imgs = graph.chapters.iter().find(|c| c.id == "ch_dec").map(|c| &c.images).expect("images survive subdirs export");
    assert_eq!(imgs.len(), 1);
    assert!((imgs[0].x - -2.0).abs() < 1e-9);
}

#[test]
fn real_pack_images_export_roundtrip() {
    let real = std::path::PathBuf::from(
        std::env::var("HOME").unwrap_or_default()
    ).join(".local/share/PrismLauncher/instances/All the Mods 10- To the Sky   ATM10SKY(1)/minecraft");
    if !real.exists() {
        eprintln!("Skipping: instance not found");
        return;
    }
    let mut graph = import_ftb_quests(&real).unwrap().graph;
    let chapters_with_images: Vec<_> = graph.chapters.iter().filter(|c| !c.images.is_empty()).collect();
    println!("chapters with images: {}/{}", chapters_with_images.len(), graph.chapters.len());
    assert!(!chapters_with_images.is_empty(), "expected decorations in the real pack");

    let total_before: usize = graph.chapters.iter().map(|c| c.images.len()).sum();
    println!("total decorations before: {total_before}");

    let ch = chapters_with_images[0].id.clone();
    let img = &chapters_with_images[0].images[0];
    println!("sample: {} @ ({}, {}) {}x{} rot {}", img.image, img.x, img.y, img.width, img.height, img.rotation);

    // Mutate the first decoration of the first decorated chapter
    let c = graph.chapters.iter_mut().find(|c| c.id == ch).unwrap();
    c.images[0].x += 1.0;
    c.images[0].rotation = 33.3;

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    let total_after: usize = graph2.chapters.iter().map(|c| c.images.len()).sum();
    println!("total decorations after: {total_after}");
    assert_eq!(total_before, total_after, "decoration count must survive export");

    let c2 = graph2.chapters.iter().find(|c| c.id == ch).unwrap();
    let a = graph.chapters.iter().find(|c| c.id == ch).unwrap();
    assert_eq!(a.images.len(), c2.images.len());
    assert!((c2.images[0].x - a.images[0].x).abs() < 1e-9, "x mutation persisted");
    assert!((c2.images[0].rotation - 33.3).abs() < 1e-9, "rotation mutation persisted");
    println!("real-pack images export round-trip OK");
}

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

    let graph = import_ftb_quests(tmp.path()).unwrap().graph;
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
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();

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

    let graph = import_ftb_quests(tmp.path()).unwrap().graph;
    assert_eq!(graph.chapter_groups.len(), 2, "both groups parsed");
    assert_eq!(graph.chapter_groups[0].id, "group_a");
    assert_eq!(graph.chapter_groups[1].title, "Group B");
    let ch1 = graph.chapters.iter().find(|c| c.id == "ch1").unwrap();
    assert_eq!(ch1.group_id.as_deref(), Some("group_a"));

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();

    let groups_path = export_dir.path().join("config").join("ftbquests").join("quests").join("chapter_groups.snbt");
    let content = std::fs::read_to_string(&groups_path).expect("chapter_groups.snbt written");
    assert!(content.contains("group_a"), "group id exported");
    assert!(content.contains("Group B"), "group title exported");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    assert_eq!(graph2.chapter_groups.len(), 2, "groups survive round-trip");
    assert_eq!(graph2.chapters.iter().find(|c| c.id == "ch1").unwrap().group_id.as_deref(), Some("group_a"));
}

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

    let graph = import_ftb_quests(tmp.path()).unwrap().graph;
    assert!(graph.default_reward_team, "default_reward_team parsed");
    assert!(graph.default_consume_items, "default_consume_items parsed");
    assert_eq!(graph.default_autoclaim_rewards, "enabled");
    assert_eq!(graph.detection_delay, 40);

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();
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

    let graph = import_ftb_quests(tmp.path()).unwrap().graph;
    let link = graph.nodes.iter().find(|n| n.id == "link1").expect("link node parsed");
    assert_eq!(link.node_type, QuestNodeType::QuestLink, "link node type");
    assert_eq!(link.link_target, "q_real", "link target captured");
    assert_eq!(link.position.x, 3.0);

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();

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

    let graph = import_ftb_quests(tmp.path()).unwrap().graph;
    assert_eq!(graph.reward_tables.len(), 1, "one reward table imported");
    let table = &graph.reward_tables[0];
    assert_eq!(table.id, "00E1FAFD0EF07752");
    assert_eq!(table.rewards.len(), 2);
    assert_eq!(table.rewards[0].item_id, "minecraft:diamond");
    assert_eq!(table.rewards[0].weight, 2.0);

    let node = graph.nodes.iter().find(|n| n.id == "q1").expect("quest imported");
    assert_eq!(node.rewards.len(), 2);
    assert_eq!(node.rewards[0].table_id, "00E1FAFD0EF07752", "random reward table_id resolved");
    assert_eq!(node.rewards[1].table_id, "00E1FAFD0EF07752", "choice reward table_id resolved");
    assert!(!node.rewards[0].items.is_empty(), "random reward items populated from table");

    // Export then re-import.
    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path()).unwrap();
    assert!(export_dir.path().join("config").join("ftbquests").join("quests").join("reward_tables").join("00E1FAFD0EF07752.snbt").exists(),
        "reward table file written");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    assert_eq!(graph2.reward_tables.len(), 1, "reward table survived export");
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

