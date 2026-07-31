use super::*;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use std::io::Write;
use tempfile::tempdir;

fn write_jar(path: &Path, namespace: &str, texture_path: &str, data: &[u8]) {
    use zip::CompressionMethod;
    use zip::write::FileOptions;
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let full_path = format!("assets/{}/textures/{}.png", namespace, texture_path);
    let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file(&full_path, options).unwrap();
    zip.write_all(data).unwrap();
    zip.finish().unwrap();
}

fn fake_png(seed: u8) -> Vec<u8> {
    vec![0x89, b'P', b'N', b'G', seed, seed, seed, seed]
}

fn decoded(url: &str) -> Vec<u8> {
    STANDARD.decode(url.strip_prefix("data:image/png;base64,").unwrap()).unwrap()
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
    assert_eq!(decoded(winner), fake_png(2));
    assert_ne!(decoded(winner), fake_png(1));
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
    write_jar(&vdir.join("1.21.1.jar"), "minecraft", "block/stone", &fake_png(3));

    let idx = scan_instance_textures(dir.path());
    assert!(idx.contains_key("minecraft:block/stone"));
    assert!(idx.contains_key("minecraft:stone"));
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
    assert_eq!(decoded(winner), fake_png(5));
    assert_ne!(decoded(winner), fake_png(4));
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
