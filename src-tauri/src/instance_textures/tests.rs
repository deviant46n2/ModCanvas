use super::*;
use base64::Engine;
use std::fs;
use std::path::Path;
use base64::engine::general_purpose::STANDARD;
use std::io::Write;
use tempfile::tempdir;

/// Write a jar with one PNG texture. Used where a single texture suffices.
fn write_jar(path: &Path, namespace: &str, texture_path: &str, data: &[u8]) {
    write_jar_multi(path, &[(format!("assets/{}/textures/{}.png", namespace, texture_path), data)]);
}

/// Write a jar with multiple entries (PNGs AND models) in ONE zip pass —
/// appending to an existing zip corrupts it (the central directory cannot be
/// extended by a second writer; the appended entries become unreadable).
fn write_jar_multi(path: &Path, entries: &[(String, &[u8])]) {
    use zip::CompressionMethod;
    use zip::write::FileOptions;
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
    for (full_path, data) in entries {
        zip.start_file(full_path, options).unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap();
}

fn fake_png(seed: u8) -> Vec<u8> {
    vec![0x89, b'P', b'N', b'G', seed, seed, seed, seed]
}

fn decoded(url: &str) -> Vec<u8> {
    STANDARD.decode(url.strip_prefix("data:image/png;base64,").unwrap()).unwrap()
}

fn materialized(instance: &Path, key: &str) -> Vec<u8> {
    let out = resolve_texture_urls(instance, &[key.to_string()]);
    decoded(out.get(key).and_then(|u| u.as_deref()).expect("texture resolves"))
}

/// mods/ supplies the base texture, resourcepacks/ overrides it.
#[test]
fn resource_pack_overrides_mod() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    write_jar(&dir.path().join("mods").join("a_mod.jar"), "minecraft", "item/diamond", &fake_png(1));
    write_jar(&dir.path().join("resourcepacks").join("retro_pack.zip"), "minecraft", "item/diamond", &fake_png(2));

    let idx = scan_instance_textures(dir.path());
    let winner = idx.get("minecraft:item/diamond").unwrap();
    // Winner source points at the higher-priority pack archive.
    assert!(winner.contains("retro_pack.zip"), "got {winner}");
    // Materialization yields the pack's bytes, not the mod's.
    assert_eq!(materialized(dir.path(), "minecraft:item/diamond"), fake_png(2));
    assert_ne!(materialized(dir.path(), "minecraft:item/diamond"), fake_png(1));
    // Short and full keys stay consistent with the pack winner.
    assert_eq!(idx.get("minecraft:diamond").unwrap(), winner);
    assert_eq!(idx.get("minecraft:textures/item/diamond").unwrap(), winner);
}

/// Vanilla-only items resolve from the shared client jar.
#[test]
fn vanilla_jar_textures_are_indexed() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    // Instance-local versions dir acts as the vanilla jar location.
    let vdir = dir.path().join("versions").join("1.21.1");
    fs::create_dir_all(&vdir).unwrap();
    // stone's model parents cube_all which parents cube (with 3D elements) —
    // write the vanilla model chain so the bake decision is hermetic instead
    // of depending on a real vanilla jar found via host HOME layouts (s57).
    // PNG + models in ONE zip pass (append corrupts the archive).
    write_jar_multi(
        &vdir.join("1.21.1.jar"),
        &[
            (format!("assets/minecraft/textures/block/stone.png"), &fake_png(3)),
            (
                "assets/minecraft/models/block/cube.json".to_string(),
                br##"{"textures":{"particle":"#all"},"elements":[{"from":[0,0,0],"to":[16,16,16]}]}"##,
            ),
            (
                "assets/minecraft/models/block/cube_all.json".to_string(),
                br##"{"parent":"minecraft:block/cube","textures":{"all":"#all"}}"##,
            ),
            (
                "assets/minecraft/models/item/stone.json".to_string(),
                br#"{"parent":"minecraft:block/cube_all","textures":{"all":"minecraft:block/stone"}}"#,
            ),
        ],
    );

    let idx = scan_instance_textures(dir.path());
    assert!(idx.contains_key("minecraft:block/stone"));
    assert!(idx.contains_key("minecraft:stone"));
    // Stone's item model carries its own texture ref, so it resolves FLAT —
    // bake is only for item models with no texture over a 3D block chain
    // (see models/tests/resolve.rs::item_parent_block_model).
    assert_eq!(idx.get("minecraft:stone").unwrap(), idx.get("minecraft:block/stone").unwrap());
    assert_eq!(materialized(dir.path(), "minecraft:block/stone"), fake_png(3));
}

/// s57 regression: Prism/MultiMC keep the vanilla client jar in the launcher's
/// shared `libraries/net/minecraft/client/` dir — a SIBLING of `instances/`,
/// not inside the instance. The texture index used to miss this entirely (its
/// own vanilla discovery only knew instance-local `versions/`), so every
/// Prism-launched pack had an empty vanilla layer and zero vanilla item
/// textures. The walk-up is OS-agnostic: the launcher-relative layout is
/// identical on Linux, Windows and macOS.
#[test]
fn prism_libraries_layout_vanilla_jars_are_indexed() {
    let launcher = tempdir().unwrap();
    // .../PrismLauncher/instances/monster/minecraft
    let instance = launcher
        .path()
        .join("PrismLauncher")
        .join("instances")
        .join("monster")
        .join("minecraft");
    fs::create_dir_all(instance.join("mods")).unwrap();
    fs::create_dir_all(instance.join("kubejs").join("assets")).unwrap();
    // Vanilla client jar in the launcher-level libraries dir (the `-extra` jar
    // carries the item textures on 1.21.x; slim/srg carry none).
    let lib = launcher
        .path()
        .join("PrismLauncher")
        .join("libraries")
        .join("net")
        .join("minecraft")
        .join("client")
        .join("1.21.1-20240808.144430");
    fs::create_dir_all(&lib).unwrap();
    write_jar(&lib.join("client-1.21.1-20240808.144430-extra.jar"), "minecraft", "item/paper", &fake_png(4));
    write_jar(&lib.join("client-1.21.1-20240808.144430-slim.jar"), "minecraft", "item/paper", &fake_png(5));
    write_jar(&lib.join("client-1.21.1-20240808.144430-srg.jar"), "minecraft", "item/paper", &fake_png(6));

    let idx = scan_instance_textures(&instance);
    assert!(
        idx.contains_key("minecraft:item/paper"),
        "vanilla item texture must resolve from the Prism libraries layout, got keys: {:?}",
        idx.keys().take(5).collect::<Vec<_>>()
    );
    // The winner is a jar source — and with the s57 `.ftba` check gone, the
    // fake Prism library jar is the only possible vanilla source, so the
    // resolve is deterministic on every host.
    let src = idx.get("minecraft:item/paper").unwrap();
    assert!(src.starts_with("jar:"), "winner must be a jar source, got {src}");
    // Fake jar content must be materializable when nothing shadows it.
    let _ = materialized(&instance, "minecraft:item/paper");
}

/// KubeJS generated assets are highest priority.
#[test]
fn kubejs_assets_override_packs() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    write_jar(&dir.path().join("resourcepacks").join("pack.zip"), "atm", "questpics/star", &fake_png(4));
    let kjs = dir.path().join("kubejs").join("assets").join("atm").join("textures").join("questpics");
    fs::create_dir_all(&kjs).unwrap();
    fs::write(kjs.join("star.png"), fake_png(5)).unwrap();

    let idx = scan_instance_textures(dir.path());
    let winner = idx.get("atm:questpics/star").unwrap();
    // Winner is the filesystem source under kubejs/assets.
    assert!(winner.contains("kubejs"), "got {winner}");
    assert!(winner.ends_with("star.png"), "got {winner}");
    assert_eq!(materialized(dir.path(), "atm:questpics/star"), fake_png(5));
    assert_ne!(materialized(dir.path(), "atm:questpics/star"), fake_png(4));
}

/// Result is stable across calls via the disk cache.
#[test]
fn cache_round_trip_is_stable() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    write_jar(&dir.path().join("mods").join("x.jar"), "examplemod", "item/widget", &fake_png(6));

    let first = scan_instance_textures(dir.path());
    let second = scan_instance_textures(dir.path());
    assert_eq!(first.len(), second.len());
    assert_eq!(first.get("examplemod:item/widget").unwrap(), second.get("examplemod:item/widget").unwrap());
}

/// Item short keys win over block variants of the same bare name. A matching
/// item model (higher layer than the vanilla one) reinforces the item winner
/// regardless of whether a real vanilla jar is present on this machine.
#[test]
fn item_short_key_beats_block() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    write_jar(&dir.path().join("mods").join("a.jar"), "minecraft", "block/cobblestone", &fake_png(7));
    let b_jar = dir.path().join("mods").join("b.jar");
    {
        use std::io::Write;
        use zip::write::FileOptions;
        use zip::CompressionMethod;
        let file = fs::File::create(&b_jar).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file("assets/minecraft/textures/item/cobblestone.png", options).unwrap();
        zip.write_all(&fake_png(8)).unwrap();
        zip.start_file("assets/minecraft/models/item/cobblestone.json", options).unwrap();
        zip.write_all(br#"{"parent":"minecraft:item/generated","textures":{"layer0":"minecraft:item/cobblestone"}}"#).unwrap();
        zip.finish().unwrap();
    }

    let idx = scan_instance_textures(dir.path());
    assert_eq!(idx.get("minecraft:cobblestone").unwrap(), idx.get("minecraft:item/cobblestone").unwrap());
    assert_ne!(idx.get("minecraft:cobblestone").unwrap(), idx.get("minecraft:block/cobblestone").unwrap());
}

/// Batch materialization opens each jar once and returns all requested keys.
#[test]
fn resolve_texture_urls_batches_by_jar() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("mods")).unwrap();
    fs::create_dir_all(dir.path().join("resourcepacks")).unwrap();
    fs::create_dir_all(dir.path().join("kubejs").join("assets")).unwrap();
    fs::create_dir_all(dir.path().join("versions")).unwrap();

    {
        use std::io::Write;
        use zip::write::FileOptions;
        use zip::CompressionMethod;
        let file = fs::File::create(dir.path().join("mods").join("a.jar")).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file("assets/a/textures/item/one.png", options).unwrap();
        zip.write_all(&fake_png(10)).unwrap();
        zip.start_file("assets/a/textures/item/two.png", options).unwrap();
        zip.write_all(&fake_png(11)).unwrap();
        zip.finish().unwrap();
    }
    write_jar(&dir.path().join("mods").join("b.jar"), "b", "item/three", &fake_png(12));

    let keys = vec![
        "a:item/one".to_string(),
        "a:item/two".to_string(),
        "b:item/three".to_string(),
        "nope:missing".to_string(),
    ];
    let out = resolve_texture_urls(dir.path(), &keys);
    assert_eq!(decoded(out.get("a:item/one").unwrap().as_deref().unwrap()), fake_png(10));
    assert_eq!(decoded(out.get("a:item/two").unwrap().as_deref().unwrap()), fake_png(11));
    assert_eq!(decoded(out.get("b:item/three").unwrap().as_deref().unwrap()), fake_png(12));
    assert!(out.get("nope:missing").is_none());
}

mod animations;
mod tags;
