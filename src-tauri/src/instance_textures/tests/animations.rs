
use super::*;
use std::io::Write;
use std::path::Path;
use tempfile::tempdir;

fn write_jar_animated(path: &Path, namespace: &str, texture_path: &str, data: &[u8], mcmeta: &str) {
    use zip::CompressionMethod;
    use zip::write::FileOptions;
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file(&format!("assets/{}/textures/{}.png", namespace, texture_path), options).unwrap();
    zip.write_all(data).unwrap();
    zip.start_file(&format!("assets/{}/textures/{}.png.mcmeta", namespace, texture_path), options).unwrap();
    zip.write_all(mcmeta.as_bytes()).unwrap();
    zip.finish().unwrap();
}

/// `.png.mcmeta` animation files are detected and exposed keyed by the same
/// key forms as the texture index, including the short `ns:id` form.
#[test]
fn animation_metadata_is_indexed() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    write_jar_animated(
        &dir.path().join("mods").join("water.jar"),
        "minecraft",
        "block/water_flow",
        &fake_png(20),
        r#"{"animation":{"frametime":3,"interpolate":true,"frames":[0,1,2,3]}}"#,
    );

    let anims = build_animation_index(dir.path());
    assert_eq!(
        anims.get("minecraft:block/water_flow").map(|s| s.as_str()),
        Some(r#"{"animation":{"frametime":3,"interpolate":true,"frames":[0,1,2,3]}}"#)
    );
    // Short key form mirrors the texture index short key.
    assert!(anims.contains_key("minecraft:water_flow"));
    // Textures without an mcmeta are absent.
    write_jar(&dir.path().join("mods").join("plain.jar"), "minecraft", "item/coal", &fake_png(21));
    let anims2 = build_animation_index(dir.path());
    assert!(!anims2.contains_key("minecraft:item/coal"));
    assert!(!anims2.contains_key("minecraft:coal"));
}

/// A resource pack that overrides both the PNG and its `.mcmeta` supplies the
/// winning animation metadata for the shared keys.
#[test]
fn animation_follows_the_winning_source() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    write_jar_animated(
        &dir.path().join("mods").join("a.jar"),
        "minecraft",
        "block/lava",
        &fake_png(30),
        r#"{"animation":{"frametime":2}}"#,
    );
    // Pack overrides PNG+mcmeta: its animation wins for the shared keys.
    write_jar_animated(
        &dir.path().join("resourcepacks").join("animated.zip"),
        "minecraft",
        "block/lava",
        &fake_png(31),
        r#"{"animation":{"frametime":4,"interpolate":true}}"#,
    );

    let anims = build_animation_index(dir.path());
    let json = anims.get("minecraft:block/lava").expect("animated block keyed");
    assert!(json.contains("frametime"), "got {json}");
    assert!(json.contains("interpolate"), "got {json}");
}

/// KubeJS assets can carry animation metadata too.
#[test]
fn kubejs_animation_metadata_is_indexed() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    let tex = dir.path().join("kubejs").join("assets").join("atm").join("textures").join("questpics");
    fs::create_dir_all(&tex).unwrap();
    fs::write(tex.join("star.png"), fake_png(40)).unwrap();
    fs::write(tex.join("star.png.mcmeta"), r#"{"animation":{"frametime":1}}"#).unwrap();

    let anims = build_animation_index(dir.path());
    assert_eq!(
        anims.get("atm:questpics/star").map(|s| s.as_str()),
        Some(r#"{"animation":{"frametime":1}}"#)
    );
}

/// Animation metadata survives the disk cache round trip.
#[test]
fn animation_cache_round_trip_is_stable() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    write_jar_animated(
        &dir.path().join("mods").join("x.jar"),
        "examplemod",
        "item/spinner",
        &fake_png(50),
        r#"{"animation":{"frametime":2,"frames":[0,1,0]}}"#,
    );

    let first = build_animation_index(dir.path());
    let second = build_animation_index(dir.path());
    assert_eq!(first.len(), second.len());
    assert_eq!(
        first.get("examplemod:item/spinner").unwrap(),
        second.get("examplemod:item/spinner").unwrap()
    );
}
