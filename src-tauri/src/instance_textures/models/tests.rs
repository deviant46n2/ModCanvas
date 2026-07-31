use super::*;
use crate::instance_textures::scan_instance_textures;
use std::io::Write;
use tempfile::tempdir;

fn write_jar_entries(path: &Path, entries: &[(&str, &[u8])]) {
    use zip::write::FileOptions;
    use zip::CompressionMethod;
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
    for (name, data) in entries {
        zip.start_file(*name, options).unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap();
}

fn fake_png(seed: u8) -> Vec<u8> {
    vec![0x89, b'P', b'N', b'G', seed, seed, seed, seed]
}

fn decoded(url: &str) -> Vec<u8> {
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    STANDARD.decode(url.strip_prefix("data:image/png;base64,").unwrap()).unwrap()
}

fn new_instance() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();
    let instance = dir.path().to_path_buf();
    (dir, instance)
}

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
/// textures before walking the block parent chain.
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

    let idx = scan_instance_textures(&instance);
    assert_eq!(idx.get("mymod:crate").unwrap(), idx.get("mymod:block/crate").unwrap());
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
    assert_eq!(decoded(idx.get("mymod:gadget").unwrap()), fake_png(6));
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
    assert_eq!(decoded(idx.get("mymod:gadget").unwrap()), fake_png(9));
    assert_eq!(idx.get("mymod:gadget").unwrap(), idx.get("mymod:items/gadget").unwrap());
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
    assert_eq!(decoded(second.get("mymod:gadget").unwrap()), fake_png(15));
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
