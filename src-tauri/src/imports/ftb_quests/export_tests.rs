use super::*;
use crate::quest::*;
use tempfile;

fn images_roundtrip(mut graph: QuestGraph, expected: usize, sidecar: &snbt_sidecar::SnbtSidecar) -> QuestGraph {
    let chapters_with_images: Vec<_> = graph.chapters.iter().filter(|c| !c.images.is_empty()).collect();
    assert_eq!(chapters_with_images.len(), expected, "expected {expected} chapter(s) with images after import");

    if let Some(ch) = chapters_with_images.first() {
        let img = &ch.images[0];
        assert!(!img.image.is_empty(), "image path must be non-empty");
        assert!(img.x != 0.0 || img.y != 0.0, "image position should round-trip");
    }

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), sidecar).unwrap();
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

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
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

    let graph2 = images_roundtrip(graph, 1, &import_result.sidecar);
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

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    graph.chapters.iter_mut().find(|c| c.id == "ch_dec").unwrap().images.clear();

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
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

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = images_roundtrip(import_result.graph, 1, &import_result.sidecar);
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
    let import_result = import_ftb_quests(&real).unwrap();
    let mut graph = import_result.graph;
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
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

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
    assert!(content.contains("\"You must unlock this first\""), "lock message persisted");
    assert!(content.contains("show_lock_icons: 1b"), "show lock icons persisted");
    assert!(content.contains("\"en_us\""), "fallback locale persisted");
    assert!(content.contains("drop_book_on_death: 1b"), "drop book persisted");
    assert!(content.contains("boss: 25"), "loot crate boss persisted");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    assert_eq!(graph2.emergency_items.len(), 2, "emergency items survive round-trip");
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
fn per_quest_repeat_and_visibility_fields_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("repeat.snbt"), r#"{
    id = "ch_repeat"
    filename = "repeat"
    title = "repeat"
    quests = [
        {
            id = "q_repeat"
            title = "Repeat Quest"
            can_repeat: 1b
            repeat_cooldown: 120
            hide_lock_icon: 1b
            guide_page: "quests:guide/my_guide"
            max_completable_dependents: 3
            dependencies = []
        }
        {
            id = "q_default"
            title = "Plain Quest"
            dependencies = []
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    let qr = graph.nodes.iter().find(|n| n.id == "q_repeat").expect("repeat quest imported");
    assert!(qr.can_be_repeatable, "can_repeat 1b -> can_be_repeatable true");
    assert_eq!(qr.repeat_cooldown, 120, "repeat_cooldown seconds parsed");
    assert!(qr.hide_lock_icon, "hide_lock_icon parsed");
    assert_eq!(qr.guide_page, "quests:guide/my_guide", "guide_page parsed");
    assert_eq!(qr.max_completable_dependents, 3, "max_completable_dependents parsed");

    let qd = graph.nodes.iter().find(|n| n.id == "q_default").expect("plain quest imported");
    assert!(!qd.can_be_repeatable, "plain quest not repeatable");
    assert_eq!(qd.repeat_cooldown, 0);
    assert!(!qd.hide_lock_icon);
    assert!(qd.guide_page.is_empty());
    assert_eq!(qd.max_completable_dependents, 0);

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    let import_result2 = import_ftb_quests(export_dir.path()).unwrap();
    let mut graph2 = import_result2.graph;
    let qr2 = graph2.nodes.iter().find(|n| n.id == "q_repeat").expect("repeat quest re-imported");
    assert!(qr2.can_be_repeatable, "repeatability survived export");
    assert_eq!(qr2.repeat_cooldown, 120, "repeat_cooldown survived export");
    assert!(qr2.hide_lock_icon, "hide_lock_icon survived export");
    assert_eq!(qr2.guide_page, "quests:guide/my_guide", "guide_page survived export");
    assert_eq!(qr2.max_completable_dependents, 3, "max_completable_dependents survived export");

    // Mutate then round-trip again through export to confirm fields persist.
    let node = graph2.nodes.iter_mut().find(|n| n.id == "q_repeat").unwrap();
    node.repeat_cooldown = 300;
    node.max_completable_dependents = 5;
    node.hide_lock_icon = false;

    let export_dir2 = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph2, export_dir2.path(), &import_result2.sidecar).unwrap();
    let graph3 = import_ftb_quests(export_dir2.path()).unwrap().graph;
    let qr3 = graph3.nodes.iter().find(|n| n.id == "q_repeat").expect("repeat quest re-imported again");
    assert_eq!(qr3.repeat_cooldown, 300, "edited repeat_cooldown persisted");
    assert_eq!(qr3.max_completable_dependents, 5, "edited max_completable_dependents persisted");
    assert!(!qr3.hide_lock_icon, "edited hide_lock_icon persisted");
    assert_eq!(qr3.guide_page, "quests:guide/my_guide", "guide_page still present");
}

#[test]
fn repeat_fields_export_uses_ftb_canonical_keys() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();
    std::fs::write(chapters_dir.join("legacy.snbt"), r#"{
    id = "ch_legacy"
    filename = "legacy"
    title = "legacy"
    quests = [
        {
            id = "q_legacy"
            title = "Legacy Repeat"
            can_repeat: 1b
            repeat_time: 60
            repeat_min_delay: 5
            repeat_max_delay: 10
            dependencies = []
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    let q = graph.nodes.iter().find(|n| n.id == "q_legacy").expect("legacy quest imported");
    assert!(q.can_be_repeatable, "legacy can_repeat parsed");
    assert_eq!(q.repeat_cooldown, 0, "legacy repeat_time does not map to cooldown");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    let exported = std::fs::read_to_string(
        export_dir.path().join("config").join("ftbquests").join("quests").join("chapters").join("legacy.snbt")
    ).unwrap();
    assert!(exported.contains("can_repeat: 1b"), "exports can_repeat");
    assert!(exported.contains("repeat_cooldown: 60"), "legacy repeat_time promoted to repeat_cooldown");
    assert!(!exported.contains("repeat_time"), "no legacy repeat_time key emitted");
    assert!(!exported.contains("repeat_min_delay"), "no legacy repeat_min_delay emitted");
    assert!(!exported.contains("repeat_max_delay"), "no legacy repeat_max_delay emitted");
    assert!(!exported.contains("repeatability"), "no legacy repeatability emitted");
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

#[test]
fn comment_preservation_roundtrip() {
    // Ensure no stale sidecar data from parallel tests
    // Write a chapter SNBT with comments on various fields.
    //
    // Parser attribution: the tokenizer emits Comment tokens, and the parser
    // assigns them as trailing on the *preceding* field's CommentedSnbt (via
    // `collect_trailing_comment()`).  So a comment placed between fields is
    // attached to the field above, not the field below.
    //
    // In this input:
    //   /* Chapter title with comment */ → trailing on `filename`
    //   /* Group identifier */          → trailing on `title`
    //   /* Quest x position */          → trailing on quest `id`
    //   /* Quest title */               → trailing on quest `y`
    //
    // The sidecar merge preserves comments on fields whose *value* hasn't
    // changed.  `filename` is always re-derived via `sanitize_filename`, so
    // `/* Chapter title with comment */` (trailing on `filename`) will always
    // be lost.  That is expected behavior given the parser's attribution.

    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    // Chapter with comments
    std::fs::write(chapters_dir.join("test.snbt"), r#"{
    id = "ch1"
    filename = "test"
    /* Chapter title with comment */
    title = "Test Chapter"
    /* Group identifier */
    group = "main"
    quests = [
        {
            id = "q1"
            /* Quest x position */
            x = 100.0d
            y = 50.0d
            /* Quest title */
            title = "First Quest"
            tasks = [
                {
                    id = "t1"
                    type = "item"
                    title = "Get Item"
                    item = "minecraft:diamond"
                    count = 5L
                }
            ]
        }
    ]
}"#).unwrap();

    // Import
    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    assert_eq!(graph.chapters.len(), 1);

    // Export without modifications
    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    // Read the exported chapter file — prefer FlatChapters, fall back to Subdirs
    let flat_path = export_dir.path()
        .join("config").join("ftbquests").join("chapters").join("Test_Chapter.snbt");
    let subdirs_path = export_dir.path()
        .join("config").join("ftbquests").join("quests").join("Test_Chapter").join("chapter.snbt");
    let exported_chapter = if flat_path.exists() { flat_path } else { subdirs_path };
    assert!(exported_chapter.exists(), "exported chapter exists");
    let exported = std::fs::read_to_string(&exported_chapter).unwrap();

    // Comments trailing on unchanged fields survive:
    //   `/* Group identifier */` — trailing on `title` (unchanged "Test Chapter")
    assert!(exported.contains("/* Group identifier */"),
        "chapter group comment preserved (trailing on unchanged title)");

    // `/* Chapter title with comment */` is trailing on `filename` which is
    // always re-derived as "Test_Chapter", so it is expected to be lost.
    assert!(!exported.contains("/* Chapter title with comment */"),
        "comment on sanitized filename is correctly lost");

    // Quest-level: `/* Quest x position */` trailing on `id` (unchanged "q1")
    assert!(exported.contains("/* Quest x position */"),
        "quest x position comment preserved (trailing on unchanged id)");
    // `/* Quest title */` trailing on `y` (unchanged 50.0)
    assert!(exported.contains("/* Quest title */"),
        "quest title comment preserved (trailing on unchanged y)");

    // --- Mutation test: re-import from first export, then mutate and re-export ---
    // The first export cleared the sidecar, so we re-import from its output to
    // re-populate the sidecar before the second export.
    let import_result2 = import_ftb_quests(export_dir.path()).unwrap();
    let mut graph2 = import_result2.graph;
    let node = graph2.nodes.iter_mut().find(|n| n.id == "q1").unwrap();
    node.position.x = 200.0; // changed x

    let export_dir2 = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph2, export_dir2.path(), &import_result2.sidecar).unwrap();

    let flat_path2 = export_dir2.path()
        .join("config").join("ftbquests").join("chapters").join("Test_Chapter.snbt");
    let subdirs_path2 = export_dir2.path()
        .join("config").join("ftbquests").join("quests").join("Test_Chapter").join("chapter.snbt");
    let exported_chapter2 = if flat_path2.exists() { flat_path2 } else { subdirs_path2 };
    let exported2 = std::fs::read_to_string(&exported_chapter2).unwrap();

    // Since the parser attributes `/* Quest x position */` as trailing on `id`
    // (which didn't change), the comment survives even though `x` changed.
    // This is a parser-attribution limitation, not a sidecar bug.
    assert!(exported2.contains("/* Quest x position */"),
        "quest x position comment still present (trailing on unchanged id)");
    assert!(exported2.contains("/* Quest title */"),
        "quest title comment preserved after x mutation");
    assert!(exported2.contains("/* Group identifier */"),
        "chapter group comment preserved after quest mutation");

    // --- Fresh export (no import, no sidecar) — comments are gone ---
    // Re-import, mutate quest title (changes trailing-on-y comment), re-export
    let import_result3 = import_ftb_quests(export_dir2.path()).unwrap();
    let mut graph3 = import_result3.graph;
    let node3 = graph3.nodes.iter_mut().find(|n| n.id == "q1").unwrap();
    node3.label = "Renamed Quest".to_string(); // changes title value → comment lost

    let export_dir3 = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph3, export_dir3.path(), &import_result3.sidecar).unwrap();

    let flat_path3 = export_dir3.path()
        .join("config").join("ftbquests").join("chapters").join("Test_Chapter.snbt");
    let subdirs_path3 = export_dir3.path()
        .join("config").join("ftbquests").join("quests").join("Test_Chapter").join("chapter.snbt");
    let exported_chapter3 = if flat_path3.exists() { flat_path3 } else { subdirs_path3 };
    let exported3 = std::fs::read_to_string(&exported_chapter3).unwrap();

    // `y` didn't change so the trailing `/* Quest title */` comment survives
    // (parser attributes it on `y`, not on `title`)
    assert!(exported3.contains("/* Quest title */"),
        "quest title comment survives (trailing on unchanged y)");
    // `id` didn't change, so trailing `/* Quest x position */` survives
    assert!(exported3.contains("/* Quest x position */"),
        "quest x position comment survives (trailing on unchanged id)");
}

/// A live export path (empty sidecar) must still preserve comments that exist
/// on disk: the exporter recovers a sidecar from the existing quests directory
/// before merging. Regression for `export_ftb_quests_to_dir` /
/// `write_quest_graph_to_instance` which passed `HashMap::new()`.
#[test]
fn live_export_without_sidecar_recovers_comments_from_disk() {
    // Build a pack on disk with comments, then import it.
    let tmp = tempfile::tempdir().unwrap();
    let pack_root = tmp.path().to_path_buf();
    let quests_dir = pack_root.join("config").join("ftbquests").join("quests");
    std::fs::create_dir_all(&quests_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13L /* book version */}").unwrap();
    let ch_dir = quests_dir.join("Chapter_One");
    std::fs::create_dir_all(&ch_dir).unwrap();
    std::fs::write(ch_dir.join("chapter.snbt"), r#"{
        id = "ch1"
        title = "Chapter One"
        /* quest position */
        quests = [
            {
                id = "q1"
                title = "Quest One"
                x = 0
                y = 0
            }
        ]
    }"#).unwrap();

    let import_result = crate::imports::ftb_quests::import_ftb_quests(&pack_root).unwrap();
    let mut graph = import_result.graph;

    // Simulate the live path: export to the SAME directory with an empty sidecar.
    let node = graph.nodes.iter_mut().find(|n| n.id == "q1").unwrap();
    node.label = "Renamed Quest".to_string();

    let empty_sidecar: snbt_sidecar::SnbtSidecar = std::collections::HashMap::new();
    export_ftb_quests_snbt(&graph, &pack_root, &empty_sidecar).unwrap();

    // Chapter comment must survive (unchanged), and the renamed title is present.
    let chapter_path = quests_dir.join("Chapter_One").join("chapter.snbt");
    let exported = std::fs::read_to_string(&chapter_path).unwrap();
    assert!(exported.contains("/* quest position */"),
        "chapter quest-list comment recovered from disk: {exported}");
    assert!(exported.contains("Renamed Quest"), "renamed title exported: {exported}");

    // Book-level data.snbt comment must survive too.
    let data = std::fs::read_to_string(quests_dir.join("data.snbt")).unwrap();
    assert!(data.contains("/* book version */"), "data.snbt comment recovered: {data}");
}

#[test]
fn test_flat_export_preserves_existing_filenames_and_group() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    // The pack's own file: lowercase name + group key + a title with a
    // formatting code that sanitizes to a DIFFERENT name ("fLoot") — the
    // exact trap that produced the duplicate chapters in real packs.
    std::fs::write(chapters_dir.join("loot.snbt"), r#"{
        id: "ch_loot"
        filename: "loot"
        title: "§fLoot"
        group: "grp_1"
        quests: []
    }"#).unwrap();
    let import_result = import_ftb_quests(tmp.path()).unwrap();
    // Export back into the SAME dir — the app always writes into the pack
    // itself (in-place), never into a fresh folder.
    export_ftb_quests_snbt(&import_result.graph, tmp.path(), &import_result.sidecar).unwrap();

    let out_chapters = tmp.path().join("config").join("ftbquests").join("quests").join("chapters");
    assert!(!out_chapters.join("fLoot.snbt").exists(), "no title-sanitized duplicate created");
    let exported = std::fs::read_to_string(out_chapters.join("loot.snbt")).unwrap();
    assert!(exported.contains("order_index"), "export must rewrite the pack's own file: {exported}");
    assert!(exported.contains("group:"), "group key must survive the rewrite: {exported}");
}
