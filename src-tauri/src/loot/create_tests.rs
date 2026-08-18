    use crate::loot::create::*;

    const TABLE: &str = r#"{"type":"minecraft:chest","pools":[{"rolls":1,"entries":[{"type":"minecraft:item","name":"minecraft:stick"}]}]}"#;

    fn root(tmp: &std::path::Path) -> std::path::PathBuf {
        let root = tmp.join("pack");
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn creates_new_table_in_version_dir_and_returns_row() {
        let tmp = std::env::temp_dir().join(format!("loot_create_{}", std::process::id()));
        let root = root(&tmp);

        let row = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "minecraft".to_string(),
            "chests/my_dungeon".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap();
        assert_eq!(row.id, "minecraft:chests/my_dungeon");
        assert!(row.editable);
        assert_eq!(row.pools, 1);

        let on_disk = root.join("data/minecraft/loot_table/chests/my_dungeon.json");
        assert!(on_disk.is_file(), "file exists at {}", on_disk.display());
        assert_eq!(std::fs::read_to_string(&on_disk).unwrap(), TABLE, "written verbatim");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn create_uses_the_passed_dir_name_not_hardcoded() {
        let tmp = std::env::temp_dir().join(format!("loot_create_old_{}", std::process::id()));
        let root = root(&tmp);

        let row = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "oldmod".to_string(),
            "chest".to_string(),
            "loot_tables".to_string(),
            TABLE.to_string(),
        )
        .unwrap();
        assert_eq!(row.id, "oldmod:chest");
        let on_disk = root.join("data/oldmod/loot_tables/chest.json");
        assert!(on_disk.is_file(), "pre-1.21 dir name honored: {}", on_disk.display());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn create_refuses_clobber_unknown_dir_and_traversal() {
        let tmp = std::env::temp_dir().join(format!("loot_create_bad_{}", std::process::id()));
        let root = root(&tmp);

        // Unknown dir name (frontend bug must not corrupt the path).
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "a".to_string(),
            "../../evil".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Unknown loot dir"), "got: {e}");

        // Traversal in namespace.
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "../outside".to_string(),
            "a".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Namespace"), "got: {e}");

        // Traversal in name.
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "../escape".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("traversal"), "got: {e}");

        // Name must be the extension-less resource path.
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "a.json".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("without .json"), "got: {e}");

        // Clobber refusal: create, then create again.
        create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "a".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap();
        let e = create_loot_table_cmd(
            root.to_string_lossy().into_owned(),
            "m".to_string(),
            "a".to_string(),
            "loot_table".to_string(),
            TABLE.to_string(),
        )
        .unwrap_err();
        assert!(e.contains("overwrite"), "got: {e}");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Build a jar carrying one loot table, return (jar path, jar source).
    fn make_jar(tmp: &std::path::Path) -> (std::path::PathBuf, String) {
        use std::io::Write as _;
        use zip::write::SimpleFileOptions;
        let jar_path = tmp.join("source.jar");
        let file = std::fs::File::create(&jar_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts = SimpleFileOptions::default();
        zip.start_file("data/minecraft/loot_table/chests/simple_dungeon.json", opts).unwrap();
        zip.write_all(b"{\"type\":\"minecraft:chest\",\"pools\":[{\"rolls\":1,\"entries\":[{\"type\":\"minecraft:item\",\"name\":\"minecraft:stick\"}]}]}").unwrap();
        zip.finish().unwrap();
        let source = format!("jar:{}!data/minecraft/loot_table/chests/simple_dungeon.json", jar_path.display());
        (jar_path, source)
    }

    #[test]
    fn copy_pulls_a_jar_table_into_pack_data_verbatim() {
        let tmp = std::env::temp_dir().join(format!("loot_copy_{}", std::process::id()));
        let root = root(&tmp);
        let (_jar, source) = make_jar(&tmp);

        let row = copy_loot_table_to_pack_cmd(
            root.to_string_lossy().into_owned(),
            source,
            "loot_table".to_string(),
        )
        .unwrap();
        assert_eq!(row.id, "minecraft:chests/simple_dungeon");
        assert!(row.editable, "copied table is editable pack data");

        let on_disk = root.join("data/minecraft/loot_table/chests/simple_dungeon.json");
        assert!(on_disk.is_file(), "copied to {}", on_disk.display());
        let content = std::fs::read_to_string(&on_disk).unwrap();
        assert!(content.contains("minecraft:stick"), "content copied from the jar, not a stub");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn copy_refuses_clobber_bad_source_and_traversal_id() {
        let tmp = std::env::temp_dir().join(format!("loot_copy_bad_{}", std::process::id()));
        let root = root(&tmp);
        let (_jar, source) = make_jar(&tmp);

        // Copy twice → second must refuse (no-clobber).
        copy_loot_table_to_pack_cmd(
            root.to_string_lossy().into_owned(),
            source.clone(),
            "loot_table".to_string(),
        )
        .unwrap();
        let e = copy_loot_table_to_pack_cmd(
            root.to_string_lossy().into_owned(),
            source.clone(),
            "loot_table".to_string(),
        )
        .unwrap_err();
        assert!(e.contains("overwrite"), "no-clobber, got: {e}");

        // Not a jar source.
        let e = copy_loot_table_to_pack_cmd(
            root.to_string_lossy().into_owned(),
            "/plain/path.json".to_string(),
            "loot_table".to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Not a jar source"), "got: {e}");

        // Unknown dir name.
        let e = copy_loot_table_to_pack_cmd(
            root.to_string_lossy().into_owned(),
            source.clone(),
            "../../evil".to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Unknown loot dir"), "got: {e}");

        // A jar entry that is not a loot-table path (traversal-shaped id). The
        // entry exists in the jar verbatim — the id-parser must refuse it.
        let evil_jar = tmp.join("evil.jar");
        {
            use std::io::Write as _;
            use zip::write::SimpleFileOptions;
            let file = std::fs::File::create(&evil_jar).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            zip.start_file("data/evil/../../loot_table/x.json", SimpleFileOptions::default()).unwrap();
            zip.write_all(b"{\"type\":\"minecraft:chest\",\"pools\":[]}").unwrap();
            zip.finish().unwrap();
        }
        let evil = format!("jar:{}!data/evil/../../loot_table/x.json", evil_jar.display());
        let e = copy_loot_table_to_pack_cmd(
            root.to_string_lossy().into_owned(),
            evil,
            "loot_table".to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Not a loot-table path"), "traversal-shaped entry refused: {e}");

        // Missing jar file.
        let missing = format!("jar:{}!data/minecraft/loot_table/a.json", tmp.join("nope.jar").display());
        let e = copy_loot_table_to_pack_cmd(
            root.to_string_lossy().into_owned(),
            missing,
            "loot_table".to_string(),
        )
        .unwrap_err();
        assert!(e.contains("Failed to open jar"), "got: {e}");

        let _ = std::fs::remove_dir_all(&tmp);
    }
