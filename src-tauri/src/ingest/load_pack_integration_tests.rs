use crate::ingest::{ingest_active_instance, scan_kubejs_assets};
use crate::imports::ftb_quests::{import_ftb_quests, parse_chapter_titles};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tempfile::tempdir;

fn create_test_jar(path: &PathBuf, namespace: &str, texture_path: &str) {
    use zip::write::FileOptions;
    use zip::CompressionMethod;
    
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    
    let full_path = format!("assets/{}/{}", namespace, texture_path);
    zip.start_file(&full_path, FileOptions::default().compression_method(CompressionMethod::Stored)).unwrap();
    zip.write_all(b"fake_png_data").unwrap();
    
    zip.finish().unwrap();
}

fn setup_test_instance() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    
    let mods_dir = dir.path().join("mods");
    fs::create_dir_all(&mods_dir).unwrap();
    
    create_test_jar(&mods_dir.join("test_mod.jar"), "testmod", "textures/item/test_item.png");
    
    let kubejs_dir = dir.path().join("kubejs").join("assets");
    fs::create_dir_all(kubejs_dir.join("atm").join("textures").join("questpics").join("chap3")).unwrap();
    fs::write(kubejs_dir.join("atm").join("textures").join("questpics").join("chap3").join("creative_star.png"), b"fake_png_data").unwrap();
    
    let quests_dir = dir.path().join("config").join("ftbquests").join("quests");
    fs::create_dir_all(quests_dir.join("lang").join("en_us").join("chapters")).unwrap();
    
    let chapter_content = r#"{
        id: "0123456789abcdef"
        title: "Test Chapter"
        images: [
            { image: "atm:textures/questpics/chap3/creative_star.png" x: 0 y: 0 width: 10 height: 10 }
        ]
    }"#;
    fs::create_dir_all(quests_dir.join("chapters")).unwrap();
    fs::write(quests_dir.join("chapters").join("test_chapter.snbt"), chapter_content).unwrap();
    
    let lang_content = r#"{
        chapter.0123456789abcdef.title: "The ATM Star"
    }"#;
    fs::write(quests_dir.join("lang").join("en_us").join("chapter.snbt"), lang_content).unwrap();
    
    dir
}

#[test]
fn test_load_pack_flow_ingests_textures() {
    let instance = setup_test_instance();
    
    let result = ingest_active_instance(instance.path()).unwrap();
    
    assert!(result.textures_indexed > 0);
    assert!(result.asset_registry.by_id.len() > 0);
    
    let atm_keys: Vec<_> = result.asset_registry.by_id.keys()
        .filter(|k| k.starts_with("atm:"))
        .collect();
    assert!(!atm_keys.is_empty());
    
    for key in &atm_keys {
        assert!(!key.contains("atm:textures/atm/textures"));
        assert!(key.starts_with("atm:textures/"));
    }
}

#[test]
fn test_load_pack_flow_imports_quests_with_titles() {
    let instance = setup_test_instance();
    
    let result = import_ftb_quests(instance.path()).unwrap();
    
    assert_eq!(result.chapter_count, 1);
    
    let graph = &result.graph;
    let chapter = graph.chapters.iter().find(|c| c.id == "0123456789abcdef");
    assert!(chapter.is_some());
    assert_eq!(chapter.unwrap().title, "The ATM Star");
}

#[test]
fn test_load_pack_flow_chapter_images_resolve() {
    let instance = setup_test_instance();
    
    let ingest_result = ingest_active_instance(instance.path()).unwrap();
    let import_result = import_ftb_quests(instance.path()).unwrap();
    
    let chapter = import_result.graph.chapters.iter().find(|c| c.id == "0123456789abcdef").unwrap();
    assert_eq!(chapter.images.len(), 1);
    
    let img = &chapter.images[0];
    assert_eq!(img.image, "atm:textures/questpics/chap3/creative_star.png");
    
    let texture_url = ingest_result.asset_registry.by_id.get(&img.image);
    assert!(texture_url.is_some());
    assert!(texture_url.unwrap().starts_with("data:image/png;base64,"));
}

#[test]
fn test_kubejs_scan_key_format() {
    let dir = tempdir().unwrap();
    let kubejs_dir = dir.path().join("kubejs").join("assets");
    fs::create_dir_all(kubejs_dir.join("atm").join("textures").join("questpics")).unwrap();
    
    let png_path = kubejs_dir.join("atm").join("textures").join("questpics").join("test_image.png");
    fs::write(&png_path, b"fake_png").unwrap();
    
    let entries = scan_kubejs_assets(&kubejs_dir).unwrap();
    
    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    
    assert_eq!(entry.namespace, "atm");
    assert_eq!(entry.raw_key, "atm:textures/questpics/test_image.png");
    assert_eq!(entry.canonical_key, "atm:questpics/test_image");
    assert_eq!(entry.clean_key, "atm:textures/questpics/test_image");
    assert!(entry.data_url.starts_with("data:image/png;base64,"));
}

#[test]
fn test_chapter_titles_recursive_scan() {
    let dir = tempdir().unwrap();
    let quests_dir = dir.path().join("quests");
    let lang_dir = quests_dir.join("lang").join("en_us").join("chapters");
    fs::create_dir_all(&lang_dir).unwrap();
    
    fs::write(lang_dir.join("chapter1.snbt"), r#"{ chapter.chap1.title: "Chapter 1" }"#).unwrap();
    fs::write(lang_dir.join("chapter2.snbt"), r#"{ chapter.chap2.title: "Chapter 2" }"#).unwrap();
    
    let nested_dir = lang_dir.join("mods");
    fs::create_dir_all(&nested_dir).unwrap();
    fs::write(nested_dir.join("chapter3.snbt"), r#"{ chapter.chap3.title: "Chapter 3" }"#).unwrap();
    
    let titles = parse_chapter_titles(&quests_dir);
    
    assert_eq!(titles.get("chap1"), Some(&"Chapter 1".to_string()));
    assert_eq!(titles.get("chap2"), Some(&"Chapter 2".to_string()));
    assert_eq!(titles.get("chap3"), Some(&"Chapter 3".to_string()));
}

#[test]
fn test_cache_version_invalidation() {
    let instance = setup_test_instance();
    
    let result1 = ingest_active_instance(instance.path()).unwrap();
    assert!(result1.textures_indexed > 0);
    
    let result2 = ingest_active_instance(instance.path()).unwrap();
    assert_eq!(result2.textures_indexed, result1.textures_indexed);
}