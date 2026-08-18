    use crate::loot::pack_scan::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    /// Build a fake pack dir: `data/<ns>/loot_table/<sub>/<name>.json` +
    /// one mod jar carrying its own loot tables.
    fn make_pack(tmp: &std::path::Path) -> std::path::PathBuf {
        let root = tmp.join("pack");
        let table = root.join("data").join("testmod").join("loot_table").join("chests");
        std::fs::create_dir_all(&table).unwrap();
        std::fs::write(
            table.join("simple.json"),
            r#"{"type":"minecraft:chest","pools":[{"entries":[{"type":"minecraft:item","name":"a:b"}]}]}"#,
        )
        .unwrap();
        // Nested subdir: the s44 regression — the id must be the full path
        // after the loot dir, not the bare filename.
        let nested = root.join("data").join("testmod").join("loot_table").join("blocks");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(
            nested.join("screen_1.json"),
            r#"{"type":"minecraft:block","pools":[{"entries":[]}]}"#,
        )
        .unwrap();

        // A jar with its own table — should be shadowed by the pack's
        // same-id table (editable wins), and kept when ids differ.
        let mods = root.join("mods");
        std::fs::create_dir_all(&mods).unwrap();
        let jar_path = mods.join("testmod.jar");
        let file = std::fs::File::create(&jar_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts = SimpleFileOptions::default();
        zip.start_file("data/testmod/loot_table/chests/simple.json", opts).unwrap();
        zip.write_all(br#"{"type":"minecraft:chest","pools":[{"entries":[{"type":"minecraft:item","name":"jar-only"}]}]}"#).unwrap();
        zip.start_file("data/testmod/loot_table/other/unique.json", opts).unwrap();
        zip.write_all(br#"{"type":"minecraft:chest","pools":[{"entries":[{"type":"minecraft:item","name":"u:v"}]}]}"#).unwrap();
        zip.finish().unwrap();
        root
    }

    #[test]
    fn scans_pack_data_and_jars_with_full_path_ids() {
        let tmp = std::env::temp_dir().join(format!("loot_scan_test_{}", std::process::id()));
        let root = make_pack(&tmp);
        let tables = scan_pack_loot_tables(&root);

        let ids: Vec<&str> = tables.iter().map(|t| t.id.as_str()).collect();
        assert!(ids.contains(&"testmod:chests/simple"), "pack table by full path, got {ids:?}");
        assert!(ids.contains(&"testmod:blocks/screen_1"), "nested table by full path, got {ids:?}");
        assert!(ids.contains(&"testmod:other/unique"), "jar-only table kept, got {ids:?}");
        // The pack's chests/simple must shadow the jar's same-id table:
        // one table with that id, editable, from the pack (2 entries: a:b).
        let simple: Vec<_> = tables.iter().filter(|t| t.id == "testmod:chests/simple").collect();
        assert_eq!(simple.len(), 1, "dedup collapsed same-id sources");
        assert!(simple[0].editable, "pack data shadows jar");
        assert_eq!(simple[0].entries, 1);
        assert_eq!(tables.len(), 3, "2 pack + 2 jar, minus 1 dedup = 3, got {}", tables.len());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn both_loot_dir_names_are_scanned() {
        let tmp = std::env::temp_dir().join(format!("loot_scan_old_{}", std::process::id()));
        let root = tmp.join("pack");
        // Pre-1.21 plural dir.
        std::fs::create_dir_all(root.join("data").join("oldmod").join("loot_tables")).unwrap();
        std::fs::write(
            root.join("data").join("oldmod").join("loot_tables").join("chest.json"),
            r#"{"type":"minecraft:chest","pools":[]}"#,
        )
        .unwrap();
        let tables = scan_pack_loot_tables(&root);
        assert!(tables.iter().any(|t| t.id == "oldmod:chest"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Build a fake instance dir with a `minecraft.jar` at the root carrying
    /// vanilla loot tables (the simplest `find_vanilla_jars` shape — the
    /// instance-root jar, no launcher-library walk needed).
    fn make_instance(tmp: &std::path::Path) -> std::path::PathBuf {
        let instance = tmp.join("instance");
        std::fs::create_dir_all(&instance).unwrap();
        let jar_path = instance.join("minecraft.jar");
        let file = std::fs::File::create(&jar_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts = SimpleFileOptions::default();
        // Same id as the pack's `testmod:chests/simple` — must LOSE to pack data.
        zip.start_file("data/testmod/loot_table/chests/simple.json", opts).unwrap();
        zip.write_all(br#"{"type":"minecraft:chest","pools":[{"rolls":1,"entries":[{"type":"minecraft:item","name":"vanilla-shadowed"}]}]}"#).unwrap();
        // Same id as the mod jar's `testmod:other/unique` — must LOSE to the jar.
        zip.start_file("data/testmod/loot_table/other/unique.json", opts).unwrap();
        zip.write_all(br#"{"type":"minecraft:chest","pools":[{"rolls":1,"entries":[{"type":"minecraft:item","name":"vanilla-shadowed-2"}]}]}"#).unwrap();
        // Vanilla-only table — must survive (the zero-mod value).
        zip.start_file("data/minecraft/loot_table/chests/simple_dungeon.json", opts).unwrap();
        zip.write_all(br#"{"type":"minecraft:chest","pools":[{"rolls":1,"entries":[{"type":"minecraft:item","name":"minecraft:stick"}]}]}"#).unwrap();
        zip.finish().unwrap();
        instance
    }

    #[test]
    fn vanilla_jar_tables_surface_for_a_zero_mod_pack() {
        let tmp = std::env::temp_dir().join(format!("loot_vanilla_{}", std::process::id()));
        // A bare pack: no data/, no mods/ — the s72 zero-mod case.
        let root = tmp.join("pack");
        std::fs::create_dir_all(&root).unwrap();
        let instance = make_instance(&tmp);

        let tables = scan_pack_loot_tables_with_vanilla(&root, Some(&instance));
        let ids: Vec<&str> = tables.iter().map(|t| t.id.as_str()).collect();
        assert!(ids.contains(&"minecraft:chests/simple_dungeon"), "vanilla table surfaced, got {ids:?}");
        assert!(tables.iter().all(|t| !t.editable), "jar tables are read-only");
        assert!(tables.iter().all(|t| t.source.starts_with("jar:")), "jar descriptor source");
        assert_eq!(tables.len(), 3, "no pack/mods → all 3 vanilla tables surface, got {}", tables.len());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn vanilla_loses_dedupe_to_pack_data_and_mod_jars() {
        let tmp = std::env::temp_dir().join(format!("loot_vanilla_dedup_{}", std::process::id()));
        let root = make_pack(&tmp);
        let instance = make_instance(&tmp);

        // Vanilla carries shadowed copies of `testmod:chests/simple` (pack
        // data) and `testmod:other/unique` (mod jar) + the vanilla-only id.
        let tables = scan_pack_loot_tables_with_vanilla(&root, Some(&instance));
        let simple: Vec<_> = tables.iter().filter(|t| t.id == "testmod:chests/simple").collect();
        assert_eq!(simple.len(), 1, "pack data still shadows");
        assert!(simple[0].editable, "editable pack copy wins over vanilla");
        let unique: Vec<_> = tables.iter().filter(|t| t.id == "testmod:other/unique").collect();
        assert_eq!(unique.len(), 1, "mod jar still shadows");
        assert!(!unique[0].editable, "read-only jar copy wins over vanilla");
        assert_eq!(tables.len(), 4, "2 pack + 2 mod-jar + 3 vanilla − 2 dedup = 4, got {}", tables.len());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn no_instance_path_means_no_vanilla_tables() {
        let tmp = std::env::temp_dir().join(format!("loot_vanilla_none_{}", std::process::id()));
        let root = make_pack(&tmp);
        let tables = scan_pack_loot_tables_with_vanilla(&root, None);
        assert!(!tables.iter().any(|t| t.id.starts_with("minecraft:")), "no vanilla without instance");
        let _ = std::fs::remove_dir_all(&tmp);
    }
