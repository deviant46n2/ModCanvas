use super::*;
use std::io::Write;
use tempfile::tempdir;
use zip::write::FileOptions;
use zip::CompressionMethod;

use super::jar::parse_lang_for_items;

pub(super) fn create_test_jar(path: &Path, namespace: &str, textures: &[&str], lang_data: Option<&str>) {
    create_test_jar_with_models(path, namespace, textures, lang_data, &[])
}

pub(super) fn create_test_jar_with_models(
    path: &Path, namespace: &str, textures: &[&str],
    lang_data: Option<&str>, models: &[(&str, &str)],
) {
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);

    for tex_path in textures {
        let full = format!("assets/{}/textures/{}", namespace, tex_path);
        zip.start_file(&full, options).unwrap();
        zip.write_all(b"fake_png_data").unwrap();
    }

    if let Some(lang_json) = lang_data {
        let lang_path = format!("assets/{}/lang/en_us.json", namespace);
        zip.start_file(&lang_path, options).unwrap();
        zip.write_all(lang_json.as_bytes()).unwrap();
    }

    for (model_path, model_json) in models {
        let full = format!("assets/{}/models/{}", namespace, model_path);
        zip.start_file(&full, options).unwrap();
        zip.write_all(model_json.as_bytes()).unwrap();
    }

    zip.finish().unwrap();
}

pub(super) fn write_kubejs_script(instance: &std::path::Path, contents: &str) {
    let startup = instance.join("kubejs").join("startup_scripts");
    fs::create_dir_all(&startup).unwrap();
    fs::write(startup.join("items.js"), contents).unwrap();
}

#[test]
fn test_parse_lang_for_items() {
    let json = r#"{
        "item.minecraft.diamond": "Diamond",
        "item.minecraft.iron_ingot": "Iron Ingot",
        "block.minecraft.stone": "Stone"
    }"#;
    let items = parse_lang_for_items(json);
    assert_eq!(items.len(), 3);
    assert!(items.contains(&("minecraft:diamond".into(), "Diamond".into(), "minecraft".into())));
    assert!(items.contains(&("minecraft:iron_ingot".into(), "Iron Ingot".into(), "minecraft".into())));
    assert!(items.contains(&("minecraft:stone".into(), "Stone".into(), "minecraft".into())));
}

#[test]
fn test_parse_lang_filters_non_item_keys() {
    let json = r#"{
        "item.minecraft.diamond": "Diamond",
        "gui.minecraft.something": "GUI Thing",
        "key.minecraft.jump": "Jump"
    }"#;
    let items = parse_lang_for_items(json);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].0, "minecraft:diamond");
}

#[test]
fn test_parse_lang_filters_tooltip_and_description_keys() {
    let json = r#"{
        "item.theurgy.alchemical_sulfur_dragonfruit": "Alchemical Sulfur Dragonfruit",
        "item.theurgy.alchemical_sulfur_dragonfruit.tooltip.extended": "Sulfur represents the idea of souls",
        "item.mod.thing.desc": "A long description",
        "item.mod.thing.lore": "Some lore",
        "item.mod.real_item": "Real Item",
        "block.mod.real_block": "Real Block",
        "block.mod.real_block.tooltip.info": "Block info"
    }"#;
    let items = parse_lang_for_items(json);
    let mut ids: Vec<String> = items.iter().map(|(id, _, _)| id.clone()).collect();
    ids.sort();
    assert_eq!(ids, vec![
        "mod:real_block".to_string(),
        "mod:real_item".to_string(),
        "theurgy:alchemical_sulfur_dragonfruit".to_string(),
    ]);
}

#[test]
fn test_scan_jar_for_items_and_textures() {
    let dir = tempdir().unwrap();
    let jar_path = dir.path().join("test.jar");
    create_test_jar(
        &jar_path,
        "testmod",
        &["item/test_item.png", "block/test_block.png"],
        Some(r#"{"item.testmod.test_item": "Test Item"}"#),
    );

    let (lang_items, textures, model_textures) = scan_jar_for_items_and_textures(&jar_path).unwrap();
    assert_eq!(lang_items.len(), 1);
    assert_eq!(lang_items[0].0, "testmod:test_item");
    assert!(model_textures.is_empty());

    assert!(textures.contains_key("testmod:item/test_item"));
    assert!(textures.contains_key("testmod:block/test_block"));
}

#[test]
fn test_find_texture_item_subdir() {
    let mut textures = HashMap::new();
    textures.insert("testmod:item/test_item".into(), "jar:/abs/test.jar!assets/testmod/textures/item/test_item.png".into());
    textures.insert("testmod:block/test_block".into(), "jar:/abs/test.jar!assets/testmod/textures/block/test_block.png".into());

    assert_eq!(
        find_texture_for_item("testmod:test_item", &textures),
        Some("testmod:item/test_item".into())
    );
    assert_eq!(
        find_texture_for_item("testmod:test_block", &textures),
        Some("testmod:block/test_block".into())
    );
    assert_eq!(
        find_texture_for_item("testmod:unknown", &textures),
        None
    );
}

#[test]
fn test_scan_emits_descriptors_not_data_urls() {
    let dir = tempdir().unwrap();
    let jar_path = dir.path().join("test.jar");
    create_test_jar(
        &jar_path,
        "testmod",
        &["item/test_item.png", "block/test_block.png"],
        Some(r#"{"item.testmod.test_item": "Test Item"}"#),
    );

    let (_, textures, _) = scan_jar_for_items_and_textures(&jar_path).unwrap();
    // AGENTS.md: scans are enumeration-only — values must be compact
    // `jar:<abs>!<zip>` descriptors, never base64 data URLs.
    for value in textures.values() {
        assert!(
            value.starts_with("jar:") && value.contains('!'),
            "scan emitted a non-descriptor value: {value}"
        );
        assert!(
            !value.starts_with("data:image/png;base64,"),
            "scan emitted a banned base64 data URL: {value}"
        );
    }
}

#[test]
fn test_model_texture_resolution_fallback() {
    let mut textures = HashMap::new();
    textures.insert("minecraft:block/crafting_table_front".into(), "jar:/abs/test.jar!assets/minecraft/textures/block/crafting_table_front.png".into());

    let mut model_map = HashMap::new();
    model_map.insert("minecraft:crafting_table".into(), vec!["minecraft:block/crafting_table_front".into()]);

    let url = resolve_texture_from_model("minecraft:crafting_table", &model_map, &textures);
    assert_eq!(url, Some("jar:/abs/test.jar!assets/minecraft/textures/block/crafting_table_front.png".into()));
}

#[test]
fn test_model_scan_in_jar() {
    let dir = tempdir().unwrap();
    let jar_path = dir.path().join("test.jar");
    create_test_jar_with_models(
        &jar_path, "testmod",
        &["item/actual_diamond.png", "block/crafting_table_front.png"],
        Some(r#"{"item.testmod.crafting_table": "Crafting Table"}"#),
        &[("item/crafting_table.json", r#"{"parent":"item/generated","textures":{"layer0":"testmod:block/crafting_table_front"}}"#)],
    );

    let (lang_items, textures, model_textures) = scan_jar_for_items_and_textures(&jar_path).unwrap();
    assert_eq!(lang_items.len(), 1);
    assert_eq!(lang_items[0].0, "testmod:crafting_table");

    assert!(textures.contains_key("testmod:item/actual_diamond"));
    assert!(textures.contains_key("testmod:block/crafting_table_front"));

    let refs = model_textures.get("testmod:crafting_table");
    assert!(refs.is_some(), "model entry should be keyed as testmod:crafting_table");
    assert_eq!(refs.unwrap()[0], "testmod:block/crafting_table_front");
}

#[test]
fn test_find_vanilla_jar_at_instance_root() {
    let dir = tempdir().unwrap();
    // Place a JAR at the instance root (simulating minecraft.jar)
    create_test_jar(
        &dir.path().join("minecraft.jar"),
        "minecraft",
        &["item/diamond.png"],
        Some(r#"{"item.minecraft.diamond": "Diamond", "block.minecraft.stone": "Stone"}"#),
    );
    // Also create a mods/ dir with a mod jar to ensure both sources merge
    let mods = dir.path().join("mods");
    fs::create_dir_all(&mods).unwrap();
    create_test_jar(
        &mods.join("somemod.jar"),
        "somemod",
        &["item/ingot_copper.png"],
        Some(r#"{"item.somemod.ingot_copper": "Copper Ingot"}"#),
    );

    let items = scan_instance_items(dir.path(), "kubejs").unwrap();

    // Should contain vanilla items from root jar AND mod items from mods/
    let diamond = items.iter().find(|i| i.id == "minecraft:diamond");
    assert!(diamond.is_some(), "Vanilla diamond should be found");
    assert_eq!(diamond.unwrap().name, "Diamond");

    let stone = items.iter().find(|i| i.id == "minecraft:stone");
    assert!(stone.is_some(), "Vanilla stone should be found");
    assert_eq!(stone.unwrap().name, "Stone");

    let copper = items.iter().find(|i| i.id == "somemod:ingot_copper");
    assert!(copper.is_some(), "Mod item should be found");
}
