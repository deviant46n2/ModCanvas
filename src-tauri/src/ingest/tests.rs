//! Unit tests for the ingest module.

    use super::*;
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    use crate::ingest::cache::load_ingest_cache;
    use crate::ingest::resolve::texture_data_url_for_key;
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
        let options: FileOptions<'_, ()> = FileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file(&full_path, options).unwrap();
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
    fn test_scan_kubejs_assets_key_format() {
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
        assert!(entry.file_path.ends_with("test_image.png"));
    }

    #[test]
    fn test_scan_kubejs_assets_no_double_namespace() {
        let dir = tempdir().unwrap();
        let kubejs_dir = dir.path().join("kubejs").join("assets");
        fs::create_dir_all(kubejs_dir.join("atm").join("textures").join("questpics")).unwrap();
        fs::write(kubejs_dir.join("atm").join("textures").join("questpics").join("test.png"), b"fake").unwrap();
        
        let entries = scan_kubejs_assets(&kubejs_dir).unwrap();
        
        for entry in &entries {
            assert!(!entry.raw_key.contains("atm:textures/atm/textures"));
            assert!(entry.raw_key.starts_with("atm:textures/"));
        }
    }

    #[test]
    fn test_ingest_cache_version_invalidation() {
        let instance = setup_test_instance();
        
        let result1 = ingest_active_instance(instance.path());
        assert!(result1.textures_indexed > 0);
        
        let result2 = ingest_active_instance(instance.path());
        assert_eq!(result2.textures_indexed, result1.textures_indexed);
        
        // Check cache version
        let cache_files: Vec<_> = fs::read_dir(instance.path().join("mods")).unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("ingest_"))
            .collect();
        // Cache is stored in system cache dir, not in instance
    }

    #[test]
    fn test_force_reindex_discards_valid_cache() {
        let instance = setup_test_instance();
        let mods_dir = instance.path().join("mods");

        let result1 = ingest_active_instance(instance.path());
        assert!(result1.textures_indexed > 0);

        let cp = cache_path(&mods_dir);
        assert!(cp.exists(), "cache must be written after first ingest");
        let mtime = |p: &std::path::Path| {
            fs::metadata(p)
                .and_then(|m| m.modified())
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos())
                .unwrap()
        };
        let mtime1 = mtime(&cp);

        // A normal re-ingest on an unchanged pack is a cache hit: identical
        // result and the cache file is NOT rewritten.
        let result2 = ingest_active_instance(instance.path());
        assert_eq!(result2.textures_indexed, result1.textures_indexed);
        assert_eq!(mtime(&cp), mtime1, "cache hit must not rewrite the cache file");

        // A forced re-index discards the valid cache and rescans from scratch
        // (the cache file is rewritten), so in-place same-size/same-mtime
        // replacements are still picked up.
        let result3 = ingest_active_instance_with_progress(instance.path(), true, &mut |_| {});
        assert_eq!(result3.textures_indexed, result1.textures_indexed);
        assert!(
            mtime(&cp) > mtime1,
            "force must discard and rewrite the cache"
        );
    }

    #[test]
    fn test_texture_data_url_for_key_serves_jar_and_kubejs() {
        let instance = setup_test_instance();
        let result = ingest_active_instance(instance.path());
        let mods_dir = instance.path().join("mods");

        let cache = load_ingest_cache(&mods_dir).expect("cache written after ingest");

        // JAR-backed entry resolves to a PNG base64 data URL
        let jar_url = texture_data_url_for_key(&cache, "testmod:item/test_item")
            .expect("jar texture resolves");
        assert!(jar_url.starts_with("data:image/png;base64,"));
        let decoded = STANDARD.decode(jar_url.strip_prefix("data:image/png;base64,").unwrap()).unwrap();
        assert_eq!(decoded, b"fake_png_data");

        // Raw key form resolves too
        assert!(texture_data_url_for_key(&cache, "testmod:textures/item/test_item.png").is_some());
        // Unknown key does not resolve
        assert!(texture_data_url_for_key(&cache, "testmod:item/nope").is_none());

        // KubeJS filesystem-backed entry resolves via canonical key
        let kjs_url = texture_data_url_for_key(&cache, "atm:questpics/chap3/creative_star")
            .expect("kubejs texture resolves");
        assert!(kjs_url.starts_with("data:image/png;base64,"));

        // Batch command resolves the same set through the cache
        assert!(result.textures_indexed >= 2);
    }

    #[test]
    fn test_get_texture_files_batch_resolution() {
        let instance = setup_test_instance();
        let _ = ingest_active_instance(instance.path());

        let out = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(get_texture_files(
                vec![
                    "testmod:textures/item/test_item.png".to_string(),
                    "atm:questpics/chap3/creative_star".to_string(),
                    "testmod:item/missing".to_string(),
                ],
                instance.path().to_string_lossy().to_string(),
            ));

        assert!(out.get("testmod:textures/item/test_item.png").unwrap().is_some());
        assert!(out.get("atm:questpics/chap3/creative_star").unwrap().is_some());
        assert!(out.get("testmod:item/missing").is_none());
    }
