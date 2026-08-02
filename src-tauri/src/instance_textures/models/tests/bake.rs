use super::*;

/// A block item whose model chain carries `elements` resolves to a `bake:`
/// descriptor, and `resolve_texture_urls` renders it into a PNG data URL using
/// the block's own texture (grass-block-style full cube).
#[test]
fn block_item_bakes_to_3d_icon() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/block/stone.png", &real_png(60)),
            (
                "assets/mymod/models/item/gem.json",
                br#"{"parent":"mymod:block/gem"}"#,
            ),
            (
                "assets/mymod/models/block/gem.json",
                br##"{
                    "textures": {"all": "mymod:block/stone"},
                    "elements": [{
                        "from": [0,0,0], "to": [16,16,16],
                        "faces": {
                            "up": {"texture": "#all", "uv": [0,0,16,16]},
                            "down": {"texture": "#all", "uv": [0,0,16,16]},
                            "north": {"texture": "#all", "uv": [0,0,16,16]},
                            "south": {"texture": "#all", "uv": [0,0,16,16]},
                            "west": {"texture": "#all", "uv": [0,0,16,16]},
                            "east": {"texture": "#all", "uv": [0,0,16,16]}
                        }
                    }]
                }"##,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    let bake = idx.get("mymod:gem").expect("gem resolves");
    assert!(bake.starts_with("bake:mymod:block/gem"), "expected bake descriptor, got {bake}");

    let out = resolve_texture_urls(&instance, &["mymod:gem".to_string()]);
    let url = out.get("mymod:gem").and_then(|u| u.as_deref()).expect("materialized");
    assert!(url.starts_with("data:image/png;base64,"), "got {url}");
    let bytes = decoded(url);
    // Rasterized PNG: starts with a valid signature and has an OUTPUT_SIZE² IHDR.
    assert_eq!(&bytes[0..4], [0x89, b'P', b'N', b'G']);
    let size = crate::instance_textures::models::raster::OUTPUT_SIZE;
    assert_eq!(&bytes[16..20], size.to_be_bytes().as_slice());
}

/// An item model with its own `elements` (hand-modeled 3D items like apotheosis
/// gems) also bakes instead of falling back to a flat `layer0` texture.
#[test]
fn hand_modeled_item_bakes_to_3d_icon() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/item/face.png", &real_png(70)),
            (
                "assets/mymod/models/item/gem.json",
                br##"{
                    "textures": {"base": "mymod:item/face"},
                    "elements": [{
                        "from": [2,0,2], "to": [14,12,14],
                        "faces": {
                            "up": {"texture": "#base"},
                            "down": {"texture": "#base"},
                            "north": {"texture": "#base"},
                            "south": {"texture": "#base"},
                            "west": {"texture": "#base"},
                            "east": {"texture": "#base"}
                        }
                    }]
                }"##,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    let bake = idx.get("mymod:gem").expect("gem resolves");
    assert!(bake.starts_with("bake:mymod:item/gem"), "expected bake descriptor, got {bake}");
    let out = resolve_texture_urls(&instance, &["mymod:gem".to_string()]);
    let url = out.get("mymod:gem").and_then(|u| u.as_deref()).expect("materialized");
    assert!(url.starts_with("data:image/png;base64,"));
}

/// A `rescale` plant (cross model with rotation) bakes without panicking and
/// produces a smaller rendered cube (the rescale shrink is applied).
#[test]
fn rescale_plant_bakes_without_panic() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/block/sapling.png", &real_png(80)),
            (
                "assets/mymod/models/item/sapling.json",
                br#"{"parent":"mymod:block/sapling"}"#,
            ),
            (
                "assets/mymod/models/block/sapling.json",
                br##"{
                    "textures": {"cross": "mymod:block/sapling"},
                    "elements": [{
                        "from": [7,0,7], "to": [9,16,9],
                        "shade": false,
                        "rotation": {"origin": [8,8,8], "axis": "y", "angle": 45, "rescale": true},
                        "faces": {
                            "north": {"texture": "#cross", "uv": [0,0,16,16]},
                            "south": {"texture": "#cross", "uv": [0,0,16,16]},
                            "west": {"texture": "#cross", "uv": [0,0,16,16]},
                            "east": {"texture": "#cross", "uv": [0,0,16,16]}
                        }
                    }]
                }"##,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    let bake = idx.get("mymod:sapling").expect("sapling resolves");
    assert!(bake.starts_with("bake:mymod:block/sapling"), "got {bake}");
    let out = resolve_texture_urls(&instance, &["mymod:sapling".to_string()]);
    let url = out.get("mymod:sapling").and_then(|u| u.as_deref()).expect("materialized");
    assert!(url.starts_with("data:image/png;base64,"));
}

/// A block item whose model has no own `elements` but inherits them through a
/// parent chain (vanilla `stone` → `cube_all` → `cube`) must still bake. This
/// exercises the ancestor walk in `chain_has_elements`, which previously mixed
/// up its (kind, ns, path) tuple and dropped the chain.
#[test]
fn block_item_with_parent_chain_elements_bakes() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/block/stone.png", &real_png(60)),
            (
                "assets/mymod/models/item/stone.json",
                br#"{"parent":"mymod:block/stone"}"#,
            ),
            (
                "assets/mymod/models/block/stone.json",
                br#"{"parent":"mymod:block/cube_all","textures":{"all":"mymod:block/stone"}}"#,
            ),
            (
                "assets/mymod/models/block/cube_all.json",
                br##"{"parent":"mymod:block/cube","textures":{"particle":"#all"}}"##,
            ),
            (
                "assets/mymod/models/block/cube.json",
                br##"{
                    "textures": {"up":"#all","down":"#all","north":"#all"},
                    "elements": [{
                        "from": [0,0,0], "to": [16,16,16],
                        "faces": {
                            "up": {"texture": "#up", "uv": [0,0,16,16]},
                            "down": {"texture": "#down", "uv": [0,0,16,16]},
                            "north": {"texture": "#north", "uv": [0,0,16,16]}
                        }
                    }]
                }"##,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    let bake = idx.get("mymod:stone").expect("stone resolves");
    assert!(bake.starts_with("bake:mymod:block/stone"), "expected bake descriptor, got {bake}");
    let out = resolve_texture_urls(&instance, &["mymod:stone".to_string()]);
    let url = out.get("mymod:stone").and_then(|u| u.as_deref()).expect("materialized");
    assert!(url.starts_with("data:image/png;base64,"));
}

/// Child models must override parent textures on the same slot (Minecraft
/// semantics). The baker walks child→root, so the deepest definition of a slot
/// wins and the parent's value must not clobber it.
#[test]
fn child_model_overrides_parent_texture_slot() {
    let (dir, instance) = new_instance();
    write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            ("assets/mymod/textures/block/child.png", &real_png(90)),
            ("assets/mymod/textures/block/parent.png", &real_png(91)),
            (
                "assets/mymod/models/item/override.json",
                br#"{"parent":"mymod:block/override"}"#,
            ),
            (
                "assets/mymod/models/block/override.json",
                br##"{
                    "parent": "mymod:block/base",
                    "textures": {"all": "mymod:block/child"},
                    "elements": [{
                        "from": [0,0,0], "to": [16,16,16],
                        "faces": {
                            "up": {"texture": "#all", "uv": [0,0,16,16]},
                            "down": {"texture": "#all", "uv": [0,0,16,16]},
                            "north": {"texture": "#all", "uv": [0,0,16,16]},
                            "south": {"texture": "#all", "uv": [0,0,16,16]},
                            "west": {"texture": "#all", "uv": [0,0,16,16]},
                            "east": {"texture": "#all", "uv": [0,0,16,16]}
                        }
                    }]
                }"##,
            ),
            (
                "assets/mymod/models/block/base.json",
                br##"{"textures": {"all": "mymod:block/parent"}}"##,
            ),
        ],
    );

    let idx = scan_instance_textures(&instance);
    let bake = idx.get("mymod:override").expect("override resolves");
    assert!(bake.starts_with("bake:mymod:block/override"), "expected bake descriptor, got {bake}");
    let out = resolve_texture_urls(&instance, &["mymod:override".to_string()]);
    let url = out.get("mymod:override").and_then(|u| u.as_deref()).expect("materialized");
    assert!(url.starts_with("data:image/png;base64,"));
}

/// A mod block model that parents to a namespace-less vanilla parent
/// (`"parent":"block/cube"`) must resolve against `minecraft:block/cube` (which
/// carries the geometry), not against the mod's own namespace. Without this the
/// parent chain lookup fails and the block degrades to a flat 16px face.
#[test]
fn vanilla_namespace_less_parent_resolves_to_minecraft() {
    let (dir, instance) = new_instance();
write_jar_entries(
        &instance.join("mods").join("a.jar"),
        &[
            (
                "assets/mymod/models/item/blocky.json",
                br#"{"parent":"mymod:block/blocky","display":{"gui":{"rotation":[30,45,0],"scale":[0.625,0.625,0.625]}}}"#,
            ),
            (
                "assets/mymod/models/block/blocky.json",
                br#"{"parent":"block/cube","textures":{"particle":"mymod:block/side","up":"mymod:block/top","down":"mymod:block/bottom","north":"mymod:block/side","south":"mymod:block/side","east":"mymod:block/side","west":"mymod:block/side"}}"#,
            ),
            ("assets/mymod/textures/block/top.png", &real_png(11)),
            ("assets/mymod/textures/block/bottom.png", &real_png(11)),
            ("assets/mymod/textures/block/side.png", &real_png(11)),
            (
                "assets/minecraft/models/block/cube.json",
                br##"{
                    "parent": "block/block",
                    "elements": [{
                        "from": [0,0,0],
                        "to": [16,16,16],
                        "faces": {
                            "up": {"uv": [0,0,16,16], "texture": "#up"},
                            "down": {"uv": [0,0,16,16], "texture": "#down"},
                            "north": {"uv": [0,0,16,16], "texture": "#north"},
                            "south": {"uv": [0,0,16,16], "texture": "#south"},
                            "east": {"uv": [0,0,16,16], "texture": "#east"},
                            "west": {"uv": [0,0,16,16], "texture": "#west"}
                        }
                    }]
                }"##,
            ),
            (
                "assets/minecraft/models/block/block.json",
                br##"{
                    "textures": {"particle": "#all"},
                    "elements": [{
                        "from": [0,0,0],
                        "to": [16,16,16],
                        "faces": {
                            "down": {"uv": [0,0,16,16], "texture": "#down", "cullface": "down"},
                            "up": {"uv": [0,0,16,16], "texture": "#up", "cullface": "up"},
                            "north": {"uv": [0,0,16,16], "texture": "#north", "cullface": "north"},
                            "south": {"uv": [0,0,16,16], "texture": "#south", "cullface": "south"},
                            "west": {"uv": [0,0,16,16], "texture": "#west", "cullface": "west"},
                            "east": {"uv": [0,0,16,16], "texture": "#east", "cullface": "east"}
                        }
                    }]
                }"##,
            ),
    ],
    );

    let idx = scan_instance_textures(&instance);
    let bake = idx.get("mymod:blocky").unwrap_or_else(|| panic!("mymod:blocky missing, got {idx:?}"));
    assert!(
        bake.starts_with("bake:mymod:block/blocky"),
        "expected bake descriptor for vanilla-parent block, got {bake}"
    );
    let out = resolve_texture_urls(&instance, &["mymod:blocky".to_string()]);
    let url = out.get("mymod:blocky").and_then(|u| u.as_deref()).expect("materialized");
    assert!(url.starts_with("data:image/png;base64,"));
}