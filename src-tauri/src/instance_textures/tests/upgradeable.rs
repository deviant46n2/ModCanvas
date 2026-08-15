// Engine-upgradeable set tests (s58): items that resolve FLAT offline but
// whose model chain reaches 3D block geometry — the companion render should
// replace the flat stand-in when connected. Split from vanilla.rs at the
// upgradeable seam (line-limit).

use super::*;
use std::fs;
use std::path::Path;
use tempfile::tempdir;

/// s58: the engine-upgradeable class — an item whose model carries its OWN
/// texture (resolves flat offline) but parents a 3D block chain (renders 3D
/// in-game). A common modded pattern (`{"parent":"block/cube_all",
/// "textures":{"all":"..."}}` directly on the item model). Flat is the offline
/// stand-in; the companion's render replaces it when connected.
#[test]
fn modded_flat_item_with_3d_chain_is_engine_upgradeable() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    let vdir = dir.path().join("versions").join("1.21.1");
    fs::create_dir_all(&vdir).unwrap();
    write_jar_multi(
        &vdir.join("1.21.1.jar"),
        &[
            (
                "assets/mymod/textures/block/carved.png".to_string(),
                &fake_png(9),
            ),
            (
                "assets/minecraft/models/block/cube.json".to_string(),
                br##"{"textures":{"particle":"#all"},"elements":[{"from":[0,0,0],"to":[16,16,16]}]}"##,
            ),
            (
                "assets/minecraft/models/block/cube_all.json".to_string(),
                br##"{"parent":"minecraft:block/cube","textures":{"all":"#all"}}"##,
            ),
            (
                "assets/mymod/models/block/carved.json".to_string(),
                br#"{"parent":"minecraft:block/cube_all","textures":{"all":"mymod:block/carved"}}"#,
            ),
            // The modded pattern: the ITEM model carries its own texture ref
            // AND parents the 3D block — resolves flat offline, bakes in-game.
            (
                "assets/mymod/models/item/carved.json".to_string(),
                br#"{"parent":"mymod:block/carved","textures":{"all":"mymod:block/carved"}}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(dir.path());
    assert!(idx.contains_key("mymod:carved"));
    let src = idx.get("mymod:carved").unwrap();
    assert!(
        !src.starts_with("bake:"),
        "item with own texture resolves flat, got: {src}"
    );
    let upgrade: Vec<String> = build_engine_upgrade_set(dir.path()).iter().cloned().collect();
    assert!(
        upgrade.contains(&"mymod:carved".to_string()),
        "flat item chaining to a 3D block must be engine-upgradeable, got: {upgrade:?}"
    );
}

/// s58: items whose chain never reaches 3D geometry (e.g. item/generated
/// sprites like ingots) stay flat forever — the engine render of a flat item
/// is darker than the jar bytes (s26), so they must NOT be upgradeable.
#[test]
fn flat_generated_items_are_not_engine_upgradeable() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    let vdir = dir.path().join("versions").join("1.21.1");
    fs::create_dir_all(&vdir).unwrap();
    write_jar_multi(
        &vdir.join("1.21.1.jar"),
        &[
            (format!("assets/minecraft/textures/item/iron_ingot.png"), &fake_png(7)),
            (
                "assets/minecraft/models/item/generated.json".to_string(),
                br##"{"textures":{"layer0":"#item"}}"##,
            ),
            (
                "assets/minecraft/models/item/iron_ingot.json".to_string(),
                br#"{"parent":"minecraft:item/generated","textures":{"layer0":"minecraft:item/iron_ingot"}}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(dir.path());
    assert!(idx.contains_key("minecraft:item/iron_ingot"));
    assert!(idx.contains_key("minecraft:iron_ingot"));
    let upgrade: Vec<String> = build_engine_upgrade_set(dir.path()).iter().cloned().collect();
    assert!(
        !upgrade.contains(&"minecraft:iron_ingot".to_string()),
        "iron_ingot must NOT be engine-upgradeable, got: {upgrade:?}"
    );
}
