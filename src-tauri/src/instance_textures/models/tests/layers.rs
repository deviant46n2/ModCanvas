use super::*;
/// Resource pack models override mod models for the same item.
#[test]
fn pack_model_overrides_mod() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/items/gadget.png", &fake_png(8)),
            (
                "assets/mymod/models/item/gadget.json",
                br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/gadget"}}"#,
            ),
        ],
    );
    write_jar_entries(
        &instance.join("resourcepacks").join("p.zip"),
        &[
            ("assets/mymod/textures/items/gadget.png", &fake_png(9)),
            (
                "assets/mymod/models/item/gadget.json",
                br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/gadget"}}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    let winner = idx.get("mymod:gadget").unwrap();
    assert!(winner.contains("p.zip"), "got {winner}");
    assert_eq!(idx.get("mymod:gadget").unwrap(), idx.get("mymod:items/gadget").unwrap());
    let out = resolve_texture_urls(&instance, &["mymod:gadget".to_string()]);
    assert_eq!(decoded(out.get("mymod:gadget").unwrap().as_deref().unwrap()), fake_png(9));
}

/// Model ids that are not real item ids (nested paths, templates) never get a
/// bare key.
#[test]
fn nested_and_template_ids_are_skipped() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/items/sub.png", &fake_png(10)),
            ("assets/mymod/textures/items/tpl.png", &fake_png(11)),
            (
                "assets/mymod/models/item/sub/part.json",
                br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/sub"}}"#,
            ),
            (
                "assets/mymod/models/item/template_thing.json",
                br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/tpl"}}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    assert!(!idx.contains_key("mymod:sub/part"));
    assert!(!idx.contains_key("mymod:template_thing"));
}

/// Cyclic parents terminate without error and yield no key.
#[test]
fn cyclic_parents_terminate() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            (
                "assets/mymod/models/item/loop_a.json",
                br#"{"parent":"mymod:item/loop_b"}"#,
            ),
            (
                "assets/mymod/models/item/loop_b.json",
                br#"{"parent":"mymod:item/loop_a"}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    assert!(!idx.contains_key("mymod:loop_a"));
    assert!(!idx.contains_key("mymod:loop_b"));
}

/// Hand-modeled 3D items with no `layer0` fall back to their `particle`/
/// `base`-style texture slots.
#[test]
fn hand_modeled_item_falls_back_to_texture_slot() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/item/model/wrench.png", &fake_png(13)),
            (
                "assets/mymod/models/item/wrench.json",
                br#"{"textures":{"base":"mymod:item/model/wrench"},"elements":[]}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    assert_eq!(idx.get("mymod:wrench").unwrap(), idx.get("mymod:item/model/wrench").unwrap());
}

/// Editing a kubejs model file invalidates the texture cache.
#[test]
fn kubejs_model_change_invalidates_cache() {
    let (dir, instance) = new_instance();
    let kjs_tex = instance.join("kubejs").join("assets").join("mymod").join("textures").join("items");
    fs::create_dir_all(&kjs_tex).unwrap();
    fs::write(kjs_tex.join("gadget.png"), fake_png(14)).unwrap();
    let kjs_model = instance.join("kubejs").join("assets").join("mymod").join("models").join("item");
    fs::create_dir_all(&kjs_model).unwrap();
    fs::write(
        kjs_model.join("gadget.json"),
        br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/gadget"}}"#,
    )
    .unwrap();

    let first = scan_instance_textures(&instance);
    assert_eq!(first.get("mymod:gadget").unwrap(), first.get("mymod:items/gadget").unwrap());

    fs::write(kjs_tex.join("alt.png"), fake_png(15)).unwrap();
    fs::write(
        kjs_model.join("gadget.json"),
        br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/alt"}}"#,
    )
    .unwrap();
    let second = scan_instance_textures(&instance);
    assert_eq!(second.get("mymod:gadget").unwrap(), second.get("mymod:items/alt").unwrap());
    let out = resolve_texture_urls(&instance, &["mymod:gadget".to_string()]);
    assert_eq!(decoded(out.get("mymod:gadget").unwrap().as_deref().unwrap()), fake_png(15));
}

/// Model-resolved bare keys survive the disk cache round trip.
#[test]
fn cache_round_trip_keeps_model_keys() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/items/gadget.png", &fake_png(12)),
            (
                "assets/mymod/models/item/gadget.json",
                br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/gadget"}}"#,
            ),
        ],
    );

    let first = scan_instance_textures(&instance);
    let second = scan_instance_textures(&instance);
    assert_eq!(first.get("mymod:gadget").unwrap(), second.get("mymod:gadget").unwrap());
    assert_eq!(first.len(), second.len());
}
