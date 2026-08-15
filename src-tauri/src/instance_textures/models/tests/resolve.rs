use super::*;
/// An item whose texture only exists via a model `layer0` resolves to a bare
/// key (`mymod:gadget`) that the PNG scan alone could not produce.
#[test]
fn model_layer0_resolves_bare_key() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/items/gadget.png", &fake_png(1)),
            (
                "assets/mymod/models/item/gadget.json",
                br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/gadget"}}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    assert_eq!(idx.get("mymod:gadget").unwrap(), idx.get("mymod:items/gadget").unwrap());
}

/// A model without textures resolves through a parent defined in another
/// namespace.
#[test]
fn cross_namespace_item_parent() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/items/widget.png", &fake_png(2)),
            (
                "assets/mymod/models/item/widget.json",
                br#"{"parent":"examplemod:item/base"}"#,
            ),
        ],
    );
    write_jar_entries(
        &instance.join("mods").join("b.jar"),
        &[(
            "assets/examplemod/models/item/base.json",
            br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/widget"}}"#,
        )],
    );

    let idx = scan_instance_textures(&instance);
    assert_eq!(idx.get("mymod:widget").unwrap(), idx.get("mymod:items/widget").unwrap());
}

/// Item models that parent a block model resolve from the block's own
/// textures before walking the block parent chain. When the parent chain
/// carries 3D geometry, the item bakes instead of staying flat.
#[test]
fn item_parent_block_model() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/block/crate.png", &fake_png(3)),
            (
                "assets/mymod/models/item/crate.json",
                br#"{"parent":"mymod:block/crate"}"#,
            ),
            (
                "assets/mymod/models/block/crate.json",
                br#"{"parent":"minecraft:block/cube_all","textures":{"all":"mymod:block/crate"}}"#,
            ),
        ],
    );
    // Vanilla cube_all model WITH elements, so the parent chain bakes —
    // hermetic: previously this test relied on a real vanilla jar being
    // found via the host's ~/.ftba layout, which made it non-hermetic (s57).
    // Written in ONE pass (appending to a zip corrupts it).
    let vdir = instance.join("versions").join("1.21.1");
    fs::create_dir_all(&vdir).unwrap();
    write_jar_entries(
        &vdir.join("1.21.1.jar"),
        &[
            (
                "assets/minecraft/models/block/cube.json",
                br##"{"textures":{"particle":"#all"},"elements":[{"from":[0,0,0],"to":[16,16,16]}]}"##,
            ),
            (
                "assets/minecraft/models/block/cube_all.json",
                br##"{"parent":"minecraft:block/cube","textures":{"all":"#all"}}"##,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    // cube_all → cube (vanilla, via the shared jar) carries elements, so the
    // block-parented item bakes; the raw texture key stays a jar source.
    let bake = idx.get("mymod:crate").expect("crate resolves");
    assert!(bake.starts_with("bake:mymod:block/crate"), "expected bake descriptor, got {bake}");
    let tex = idx.get("mymod:block/crate").expect("texture resolves");
    assert!(!tex.starts_with("bake:"), "texture key should stay flat, got {tex}");
}

/// Block models that only expose `particle` still resolve.
#[test]
fn block_particle_fallback() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/block/cell.png", &fake_png(4)),
            (
                "assets/mymod/models/item/cell.json",
                br#"{"parent":"mymod:block/cell"}"#,
            ),
            (
                "assets/mymod/models/block/cell.json",
                br#"{"textures":{"particle":"mymod:block/cell"}}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    assert_eq!(idx.get("mymod:cell").unwrap(), idx.get("mymod:block/cell").unwrap());
}

/// KubeJS filesystem models override the same model shipped in a mod jar.
#[test]
fn kubejs_model_overrides_mod() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/items/gadget.png", &fake_png(5)),
            (
                "assets/mymod/models/item/gadget.json",
                br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/gadget"}}"#,
            ),
        ],
    );
    let kjs_tex = instance.join("kubejs").join("assets").join("mymod").join("textures").join("items");
    fs::create_dir_all(&kjs_tex).unwrap();
    fs::write(kjs_tex.join("gadget.png"), fake_png(6)).unwrap();
    let kjs_model = instance.join("kubejs").join("assets").join("mymod").join("models").join("item");
    fs::create_dir_all(&kjs_model).unwrap();
    fs::write(
        kjs_model.join("gadget.json"),
        br#"{"parent":"minecraft:item/generated","textures":{"layer0":"mymod:items/gadget"}}"#,
    )
    .unwrap();

    let idx = scan_instance_textures(&instance);
    let winner = idx.get("mymod:gadget").unwrap();
    assert!(winner.contains("kubejs"), "got {winner}");
    let out = resolve_texture_urls(&instance, &["mymod:gadget".to_string()]);
    assert_eq!(decoded(out.get("mymod:gadget").unwrap().as_deref().unwrap()), fake_png(6));
}

/// When the model cannot resolve (no texture anywhere in the chain), the
/// PNG-derived bare key stays untouched.
#[test]
fn unresolvable_model_keeps_png_bare_key() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/item/widget.png", &fake_png(7)),
            (
                "assets/mymod/models/item/widget.json",
                br#"{"parent":"builtin/entity"}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    assert_eq!(idx.get("mymod:widget").unwrap(), idx.get("mymod:item/widget").unwrap());
}
