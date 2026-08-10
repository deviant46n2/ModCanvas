//! Regression tests for the CurseForge zip exporter (s34 finding).
//!
//! `CurseForgeExporter::export` collected non-CurseForge (Modrinth/local) mods
//! into a vector that was never written to the zip — the exported pack
//! silently lacked every non-CF mod even though the function's own doc comment
//! promised "Mods with Modrinth IDs are included as jar files in the
//! overrides/mods/ folder." These tests lock the two required behaviors:
//! non-CF jars travel in `overrides/mods/`, and an unresolvable non-CF mod
//! fails the export loudly instead of being dropped.

use crate::imports::curseforge::CurseForgeExporter;
use crate::models::{ModEntry, ModLoader, ModSource, PackFormat, Project};
use std::io::Read;
use std::path::Path;

fn make_project(root: &Path) -> Project {
    let now = chrono::Utc::now();
    Project {
        id: uuid::Uuid::new_v4(),
        name: "Test Pack".to_string(),
        description: String::new(),
        minecraft_version: "1.21.1".to_string(),
        mod_loader: ModLoader::NeoForge,
        pack_format: PackFormat::CurseForge,
        pack_version: "1.0.0".to_string(),
        author: String::new(),
        created_at: now,
        updated_at: now,
        path: root.to_string_lossy().to_string(),
        source: "modcanvas".to_string(),
    }
}

fn make_mod(project: &Project, mod_id: &str, name: &str, file_name: Option<&str>) -> ModEntry {
    ModEntry {
        id: uuid::Uuid::new_v4(),
        project_id: project.id,
        mod_id: mod_id.to_string(),
        slug: name.to_lowercase().replace(' ', "-"),
        name: name.to_string(),
        version: "1.0.0".to_string(),
        description: String::new(),
        author: String::new(),
        source: if mod_id.starts_with("curseforge:") {
            ModSource::CurseForge
        } else {
            ModSource::Modrinth
        },
        enabled: true,
        added_at: chrono::Utc::now(),
        icon: None,
        file_name: file_name.map(str::to_string),
    }
}

fn temp_zip_path() -> std::path::PathBuf {
    std::env::temp_dir().join(format!("cf-export-test-{}.zip", uuid::Uuid::new_v4()))
}

#[test]
fn mixed_export_ships_non_cf_jars_in_overrides_mods() {
    let root = tempfile::tempdir().unwrap();
    let mods_dir = root.path().join("mods");
    std::fs::create_dir_all(&mods_dir).unwrap();
    let jar_bytes = b"PK\x03\x04 fake jar bytes for the Modrinth mod";
    std::fs::write(mods_dir.join("FakeMod-1.0.0.jar"), jar_bytes).unwrap();

    let project = make_project(root.path());
    let mods = vec![
        make_mod(&project, "curseforge:12345", "CF Mod", None),
        make_mod(&project, "sodium", "Sodium", Some("FakeMod-1.0.0.jar")),
    ];

    let out = temp_zip_path();
    let path = CurseForgeExporter::export(&project, &mods, &[], &out).unwrap();

    let file = std::fs::File::open(&path).unwrap();
    let mut archive = zip::ZipArchive::new(file).unwrap();

    // The Modrinth jar travels in overrides/mods, byte-identical.
    let shipped_bytes = {
        let mut shipped = archive.by_name("overrides/mods/FakeMod-1.0.0.jar").unwrap();
        let mut buf = Vec::new();
        shipped.read_to_end(&mut buf).unwrap();
        buf
    };
    assert_eq!(shipped_bytes, jar_bytes);

    // The manifest lists only the CurseForge mod — non-CF mods have no
    // manifest entry by design (their jar in overrides is the carrier).
    let mut manifest = archive.by_name("manifest.json").unwrap();
    let mut text = String::new();
    manifest.read_to_string(&mut text).unwrap();
    let manifest_json: serde_json::Value = serde_json::from_str(&text).unwrap();
    let files = manifest_json["files"].as_array().unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["projectID"], 12345);
    assert_eq!(files[0]["fileID"], 0); // version string was not a parseable fileID

    std::fs::remove_file(&path).unwrap();
}

#[test]
fn export_fails_loudly_when_non_cf_jar_missing_on_disk() {
    let root = tempfile::tempdir().unwrap();
    let project = make_project(root.path());
    // file_name claims a jar exists, but the instance has no mods/ file.
    let mods = vec![make_mod(&project, "sodium", "Sodium", Some("FakeMod-1.0.0.jar"))];

    let out = temp_zip_path();
    let err = CurseForgeExporter::export(&project, &mods, &[], &out).unwrap_err();
    let msg = format!("{err:#}");
    assert!(msg.contains("Sodium"), "error must name the mod: {msg}");
    assert!(msg.contains("FakeMod-1.0.0.jar"), "error must name the jar: {msg}");
    assert!(!out.exists(), "no partial zip should be left behind");
}

#[test]
fn export_fails_loudly_when_non_cf_mod_has_no_file_record() {
    let root = tempfile::tempdir().unwrap();
    let project = make_project(root.path());
    // Legacy / toggle-as-add rows carry file_name = None.
    let mods = vec![make_mod(&project, "sodium", "Sodium", None)];

    let out = temp_zip_path();
    let err = CurseForgeExporter::export(&project, &mods, &[], &out).unwrap_err();
    let msg = format!("{err:#}");
    assert!(msg.contains("Sodium"), "error must name the mod: {msg}");
    assert!(!out.exists(), "no partial zip should be left behind");
}
