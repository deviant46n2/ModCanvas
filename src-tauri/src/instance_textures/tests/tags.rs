use super::*;
use tempfile::tempdir;
fn write_data_jar(path: &Path, data_path: &str, contents: &str) {
    use zip::CompressionMethod;
    use zip::write::FileOptions;
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file(data_path, options).unwrap();
    zip.write_all(contents.as_bytes()).unwrap();
    zip.finish().unwrap();
}

/// 1.21+ item tags (`tags/item`) resolve from mod jars, expanding `#tag`
/// references across archives and de-duplicating.
#[test]
fn item_tags_resolve_from_jar_with_reference_expansion() {
    use crate::instance_textures::tags::resolve_item_tags;
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    write_data_jar(
        &dir.path().join("mods").join("a.jar"),
        "data/mytag/tags/item/fancy.json",
        r#"{"values": ["mytag:widget_a", "mytag:widget_b"]}"#,
    );
    write_data_jar(
        &dir.path().join("mods").join("b.jar"),
        "data/mytag/tags/item/tools.json",
        r##"{"values": ["#mytag:fancy", "mytag:widget_c"]}"##,
    );

    let out = resolve_item_tags(
        dir.path(),
        &["mytag:tools".to_string(), "mytag:fancy".to_string()],
    );
    assert_eq!(out["mytag:fancy"], vec!["mytag:widget_a", "mytag:widget_b"]);
    let tools = &out["mytag:tools"];
    assert!(tools.contains(&"mytag:widget_a".to_string()));
    assert!(tools.contains(&"mytag:widget_b".to_string()));
    assert!(tools.contains(&"mytag:widget_c".to_string()));
    assert_eq!(tools.len(), 3);
}

/// Pre-1.20.5 `tags/items` form and slash paths (`forge:ingots/iron`) work,
/// including the instance `data/` directory source.
#[test]
fn item_tags_resolve_from_plural_folder_and_data_dir() {
    use crate::instance_textures::tags::resolve_item_tags;
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    write_data_jar(
        &dir.path().join("mods").join("forge.jar"),
        "data/forge/tags/items/ingots/iron.json",
        r#"{"values": ["minecraft:iron_ingot"]}"#,
    );
    let data_root = dir.path().join("data").join("ftb").join("tags").join("items");
    fs::create_dir_all(&data_root).unwrap();
    fs::write(
        data_root.join("t1seeds.json"),
        r#"{"values": ["ftb:acorn_seed", "ftb:apple_seed"]}"#,
    )
    .unwrap();

    let out = resolve_item_tags(
        dir.path(),
        &["forge:ingots/iron".to_string(), "ftb:t1seeds".to_string()],
    );
    assert_eq!(out["forge:ingots/iron"], vec!["minecraft:iron_ingot"]);
    assert_eq!(out["ftb:t1seeds"], vec!["ftb:acorn_seed", "ftb:apple_seed"]);
}

/// Unknown tags resolve to an empty list rather than erroring.
#[test]
fn unknown_tag_resolves_to_empty() {
    use crate::instance_textures::tags::resolve_item_tags;
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    let out = resolve_item_tags(dir.path(), &["nonexistent:tag".to_string()]);
    assert_eq!(out["nonexistent:tag"], Vec::<String>::new());
}
