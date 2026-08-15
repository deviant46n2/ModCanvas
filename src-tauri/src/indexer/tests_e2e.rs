use super::*;
use super::tests::{create_test_jar, write_kubejs_script};
use tempfile::tempdir;

// s59 contract: the item registry is COMPANION-AUTHORITATIVE. Before the first
// companion connect there is no cache and scan_instance_items returns EMPTY
// (blank-first-run is the agreed UX — Pack Health's registryDegraded guard
// keeps it from becoming a false "all items missing" storm). After
// save_item_registry persists a companion dump, the cache is served as-is.
// The legacy lang-key scan path is PARKED (not deleted this session).

#[test]
fn test_scan_empty_before_first_launch() {
    let dir = tempdir().unwrap();
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();

    // A jar with lang keys exists — but the lang-key scan is parked. Before
    // the companion ever connects, the registry must be EMPTY, not polluted.
    create_test_jar(
        &mods.join("mod1.jar"),
        "mod1",
        &["item/ingot_copper.png"],
        Some(r#"{"item.mod1.ingot_copper": "Copper Ingot"}"#),
    );

    let items = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert!(items.is_empty(), "no companion data yet → empty registry");
}

#[test]
fn test_companion_dump_is_served_and_cached() {
    let dir = tempdir().unwrap();
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();
    create_test_jar(
        &mods.join("mod1.jar"),
        "mod1",
        &["item/ingot_copper.png"],
        Some(r#"{"item.mod1.ingot_copper": "Copper Ingot"}"#),
    );

    // Companion dump lands (simulates ITEM_REGISTRY_RESULT → save cmd).
    let dump = vec![
        ItemRegistryEntry {
            id: "minecraft:white_banner".to_string(),
            name: "White Banner".to_string(),
            mod_id: "minecraft".to_string(),
            texture_data_url: None,
        },
        ItemRegistryEntry {
            id: "minecraft:potion".to_string(),
            name: "Potion".to_string(),
            mod_id: "minecraft".to_string(),
            texture_data_url: None,
        },
    ];
    save_item_registry(dir.path(), dump.clone()).unwrap();

    // Cache hit serves the companion data — the real items, no lang-key junk.
    let items = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert_eq!(items.len(), 2);
    assert!(items.iter().any(|i| i.id == "minecraft:white_banner"));
    assert!(items.iter().any(|i| i.id == "minecraft:potion"));
    // No lang-key pollution from the jar (ingot_copper must NOT appear).
    assert!(!items.iter().any(|i| i.id == "mod1:ingot_copper"));
}

#[test]
fn test_cache_invalidation_on_jar_change() {
    let dir = tempdir().unwrap();
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();
    create_test_jar(
        &mods.join("test.jar"),
        "testmod",
        &["item/test_item.png"],
        Some(r#"{"item.testmod.test_item": "Test Item"}"#),
    );

    let dump = vec![ItemRegistryEntry {
        id: "minecraft:arrow".to_string(),
        name: "Arrow".to_string(),
        mod_id: "minecraft".to_string(),
        texture_data_url: None,
    }];
    save_item_registry(dir.path(), dump.clone()).unwrap();
    let items1 = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert_eq!(items1.len(), 1);

    // Same jars unchanged → cache stays valid.
    let items2 = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert_eq!(items2.len(), 1);
    assert_eq!(items1[0].id, items2[0].id);

    // Touching the jar (new mtime/size) invalidates → empty again (the pack
    // changed; the game needs a relaunch anyway and will re-dump on connect).
    create_test_jar(
        &mods.join("test.jar"),
        "testmod",
        &["item/test_item.png", "item/other.png"],
        Some(r#"{"item.testmod.test_item": "Test Item"}"#),
    );
    let items3 = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert!(items3.is_empty(), "jar changed → cache invalidated → empty");
}

#[test]
fn test_cache_invalidates_on_kubejs_script_change() {
    let dir = tempdir().unwrap();
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();
    create_test_jar(&mods.join("m.jar"), "minecraft", &[], Some(r#"{}"#));

    let dump = vec![ItemRegistryEntry {
        id: "minecraft:stone".to_string(),
        name: "Stone".to_string(),
        mod_id: "minecraft".to_string(),
        texture_data_url: None,
    }];
    save_item_registry(dir.path(), dump.clone()).unwrap();
    let items1 = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert!(items1.iter().any(|i| i.id == "minecraft:stone"));

    // Editing a KubeJS script (same path) must invalidate the cached dump —
    // the pack's content changed; the next game connect re-dumps truth.
    write_kubejs_script(
        dir.path(),
        r#"StartupEvents.registry('item', event => { event.create('second_item') })"#,
    );
    let items2 = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert!(items2.is_empty(), "kubejs script changed → cache invalidated → empty");
}
