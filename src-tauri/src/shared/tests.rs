// Unit tests for the shared helpers: jar metadata extraction and config
// format detection.

use super::*;
use std::io::Write;
use tempfile::tempdir;
use zip::{write::FileOptions, CompressionMethod, ZipWriter};

fn write_test_mod_jar(path: &Path) {
    let file = std::fs::File::create(path).unwrap();
    let mut zip = ZipWriter::new(file);
    let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file("META-INF/mods.toml", options).unwrap();
    zip.write_all(
        br#"modLoader = "javafml"
loaderVersion = "[47,)"

[[mods]]
modId = "example_mod"
version = "1.2.3"
displayName = "Example Mod"
description = "Adds example things to the game."
icon = "logo.png"
"#,
    )
    .unwrap();
    zip.start_file("logo.png", options).unwrap();
    zip.write_all(b"\x89PNG\r\n\x1a\nfakepng").unwrap();
    zip.finish().unwrap();
}

#[test]
fn extracts_description_and_icon_from_jar() {
    let dir = tempdir().unwrap();
    let jar = dir.path().join("example.jar");
    write_test_mod_jar(&jar);

    let info = extract_mod_info_from_jar(&jar).unwrap().expect("mod info");
    assert_eq!(info.mod_id.as_deref(), Some("example_mod"));
    assert_eq!(info.version.as_deref(), Some("1.2.3"));
    assert_eq!(info.description.as_deref(), Some("Adds example things to the game."));
    let icon = info.icon_data_url.expect("icon data url");
    assert!(icon.starts_with("data:image/png;base64,"), "got {icon}");
    assert!(icon.len() > 30);
}

#[test]
fn returns_none_for_jar_without_mod_metadata() {
    let dir = tempdir().unwrap();
    let jar = dir.path().join("junk.jar");
    let file = std::fs::File::create(&jar).unwrap();
    let mut zip = ZipWriter::new(file);
    let junk_options: FileOptions<'_, ()> = FileOptions::default();
    zip.start_file("assets/foo/textures/item/x.png", junk_options).unwrap();
    zip.write_all(b"data").unwrap();
    zip.finish().unwrap();
    assert!(extract_mod_info_from_jar(&jar).unwrap().is_none());
}
