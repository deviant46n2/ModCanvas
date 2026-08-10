use super::*;
use super::tests::{create_test_jar, create_test_jar_with_models, write_kubejs_script};
use tempfile::tempdir;

#[test]
fn test_scan_instance_items_end_to_end() {
    let dir = tempdir().unwrap();
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();

    create_test_jar(
        &mods.join("mod1.jar"),
        "mod1",
        &["item/ingot_copper.png"],
        Some(r#"{"item.mod1.ingot_copper": "Copper Ingot"}"#),
    );
    create_test_jar(
        &mods.join("mod2.jar"),
        "mod2",
        &["block/machine_frame.png"],
        Some(r#"{"block.mod2.machine_frame": "Machine Frame"}"#),
    );

    let items = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert_eq!(items.len(), 2);

    let copper = items.iter().find(|i| i.id == "mod1:ingot_copper").unwrap();
    assert_eq!(copper.name, "Copper Ingot");
    let url = copper.texture_data_url.as_deref().expect("copper resolves a texture");
    assert!(url.starts_with("jar:"), "registry holds a descriptor, not a data URL: {url}");
    assert!(!url.starts_with("data:image"), "banned base64 format leaked into the registry: {url}");

    let machine = items.iter().find(|i| i.id == "mod2:machine_frame").unwrap();
    assert_eq!(machine.name, "Machine Frame");
    assert!(machine.texture_data_url.is_some());
}

#[test]
fn test_end_to_end_with_model_fallback() {
    let dir = tempdir().unwrap();
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();

    // A mod where the block texture has a suffix mismatch:
    // Item `testmod:crafting_table` - texture is `block/crafting_table_front.png`
    create_test_jar_with_models(
        &mods.join("testmod.jar"), "testmod",
        &["block/crafting_table_front.png", "block/crafting_table_top.png"],
        Some(r#"{"block.testmod.crafting_table": "Crafting Table"}"#),
        &[("item/crafting_table.json", r#"{"parent":"block/crafting_table","textures":{"layer0":"testmod:block/crafting_table_front"}}"#)],
    );

    // A simple item with direct match
    create_test_jar(
        &mods.join("simple.jar"), "simplemod",
        &["item/ingot_copper.png"],
        Some(r#"{"item.simplemod.ingot_copper": "Copper Ingot"}"#),
    );

    let items = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert_eq!(items.len(), 2);

    let table = items.iter().find(|i| i.id == "testmod:crafting_table").unwrap();
    assert!(table.texture_data_url.is_some(), "Crafting Table should resolve texture from model");

    let copper = items.iter().find(|i| i.id == "simplemod:ingot_copper").unwrap();
    assert!(copper.texture_data_url.is_some(), "Copper Ingot should have direct texture match");
}

#[test]
fn test_cache_invalidation() {
    let dir = tempdir().unwrap();
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();

    create_test_jar(
        &mods.join("test.jar"),
        "testmod",
        &["item/test_item.png"],
        Some(r#"{"item.testmod.test_item": "Test Item"}"#),
    );

    let items1 = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert_eq!(items1.len(), 1);

    let items2 = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert_eq!(items2.len(), 1);
    assert_eq!(items1[0].id, items2[0].id);
}

#[test]
fn test_scan_instance_kubejs_items_end_to_end() {
    let dir = tempdir().unwrap();
    // A jar providing the texture the kubejs `.texture()` ref points at.
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();
    create_test_jar(
        &mods.join("m.jar"),
        "minecraft",
        &["item/test_item.png"],
        Some(r#"{}"#),
    );
    write_kubejs_script(
        dir.path(),
        r#"StartupEvents.registry('item', event => {
  event.create('test_item').displayName('Test Item').texture('minecraft:item/test_item')
  event.create('no_icon')
})"#,
    );

    let items = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert_eq!(items.len(), 2);

    let with_icon = items.iter().find(|i| i.id == "kubejs:test_item").unwrap();
    assert_eq!(with_icon.name, "Test Item");
    assert_eq!(with_icon.mod_id, "kubejs");
    assert!(
        with_icon.texture_data_url.is_some(),
        "kubejs item should resolve its .texture() against the jar texture map"
    );

    let no_icon = items.iter().find(|i| i.id == "kubejs:no_icon").unwrap();
    assert_eq!(no_icon.name, "no_icon");
    assert!(no_icon.texture_data_url.is_none());
}

#[test]
fn test_scan_instance_kubejs_bare_ids_namespaced_by_argument() {
    let dir = tempdir().unwrap();
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();
    create_test_jar(&mods.join("m.jar"), "minecraft", &[], Some(r#"{}"#));
    write_kubejs_script(
        dir.path(),
        r#"onEvent('item.registry', event => { event.register('legacy_thing') })"#,
    );

    // Custom namespace passed from the frontend adapter.
    let items = scan_instance_items(dir.path(), "example").unwrap();
    assert!(items.iter().any(|i| i.id == "example:legacy_thing"));

    // Bare namespaced ids are untouched.
    write_kubejs_script(
        dir.path(),
        r#"StartupEvents.registry('item', event => { event.create('mymod:explicit') })"#,
    );
    let items = scan_instance_items(dir.path(), "example").unwrap();
    assert!(items.iter().any(|i| i.id == "mymod:explicit"));
}

#[test]
fn test_cache_invalidates_on_kubejs_script_change() {
    let dir = tempdir().unwrap();
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();
    create_test_jar(&mods.join("m.jar"), "minecraft", &[], Some(r#"{}"#));

    write_kubejs_script(
        dir.path(),
        r#"StartupEvents.registry('item', event => { event.create('first_item') })"#,
    );
    let items1 = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert!(items1.iter().any(|i| i.id == "kubejs:first_item"));

    // Editing the script (same path) must invalidate the cached scan.
    write_kubejs_script(
        dir.path(),
        r#"StartupEvents.registry('item', event => { event.create('second_item') })"#,
    );
    let items2 = scan_instance_items(dir.path(), "kubejs").unwrap();
    assert!(items2.iter().any(|i| i.id == "kubejs:second_item"));
    assert!(!items2.iter().any(|i| i.id == "kubejs:first_item"));
}
