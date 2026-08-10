// Unit tests for the recipe comment-out / uncomment helpers. Split out of
// mod.rs to keep every recipe_disable file under the 300-line ceiling.

    use super::*;
    use std::path::Path;

    #[test]
    fn comment_uncomment_round_trip_preserves_other_lines() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("kubejs/server_scripts/recipes.js");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        let original = "ServerEvents.recipes(event => {\n  event.shaped('minecraft:a', ['A'], { A: 'minecraft:b' })\n  event.smelting('minecraft:c', 'minecraft:d')\n})\n";
        std::fs::write(&file, original).unwrap();

        let fp = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 2, 2).unwrap();
        let commented = std::fs::read_to_string(&file).unwrap();
        assert_eq!(
            commented,
            "ServerEvents.recipes(event => {\n//   event.shaped('minecraft:a', ['A'], { A: 'minecraft:b' })\n  event.smelting('minecraft:c', 'minecraft:d')\n})\n"
        );

        uncomment_recipe_call_impl(dir.path(), file.to_str().unwrap(), 2, 2, &fp).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), original);
    }

    #[test]
    fn comment_out_multiline_call_with_crlf_preserved() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("scripts/recipes.zs");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        let original = "import x;\r\nfurnace.addRecipe(\"iron\",\r\n    <item:minecraft:iron_ingot>,\r\n    <item:minecraft:iron_ore>,\r\n    0.7, 200);\r\n";
        std::fs::write(&file, original).unwrap();

        comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 2, 5).unwrap();
        let commented = std::fs::read_to_string(&file).unwrap();
        let lines: Vec<&str> = commented.split("\r\n").collect();
        assert_eq!(lines[0], "import x;", "first line untouched");
        for l in &lines[1..=4] {
            assert!(l.starts_with("// "), "line should be commented: {l:?}");
        }
        // CRLF line endings survive on every line (no bare `\n` mid-line).
        assert!(lines.len() == 6 && lines[5].is_empty());
    }

    #[test]
    fn off_root_file_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let file = outside.path().join("secret.js");
        std::fs::write(&file, "event.shaped('a:b', ['A'], { A: 'c:d' })").unwrap();
        let err = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 1)
            .err()
            .expect("must reject off-root file");
        assert!(err.contains("Access denied") || err.contains("outside"), "{err}");
    }

    #[test]
    fn traversal_path_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let err = comment_out_recipe_call_impl(dir.path(), "../escape.js", 1, 1)
            .err()
            .expect("must reject traversal");
        assert!(!err.is_empty());
    }

    #[test]
    fn out_of_range_lines_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("scripts/recipes.zs");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "a\nb\nc\n").unwrap();
        let err = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 99)
            .err()
            .expect("must reject out-of-range end");
        assert!(err.contains("out of bounds"), "{err}");
        let err = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 3, 2)
            .err()
            .expect("must reject inverted range");
        assert!(err.contains("invalid line range"), "{err}");
    }

    #[test]
    fn fingerprint_mismatch_refuses() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("kubejs/server_scripts/recipes.js");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(
            &file,
            "event.shaped('minecraft:a', ['A'], { A: 'minecraft:b' })",
        )
        .unwrap();
        let fp = comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 1).unwrap();

        // Hand-edit the commented file (e.g. change the ingredient).
        let commented = std::fs::read_to_string(&file).unwrap();
        std::fs::write(&file, commented.replace("minecraft:b", "minecraft:c")).unwrap();

        let err = uncomment_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 1, &fp)
            .err()
            .expect("must refuse when file changed");
        assert!(err.contains("edited since"), "{err}");
        // The hand-edit is left untouched.
        assert!(std::fs::read_to_string(&file).unwrap().contains("minecraft:c"));
    }

    #[test]
    fn uncomment_with_stale_fingerprint_refuses() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("scripts/recipes.zs");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "furnace.addRecipe(\"x\", <item:minecraft:a>);\n").unwrap();
        comment_out_recipe_call_impl(dir.path(), file.to_str().unwrap(), 1, 1).unwrap();
        // Wrong fingerprint (all-zero) must refuse even though lines are intact.
        let err = uncomment_recipe_call_impl(
            dir.path(),
            file.to_str().unwrap(),
            1,
            1,
            "0000000000000000000000000000000000000000000000000000000000000000",
        )
        .err()
        .expect("must refuse wrong fingerprint");
        assert!(err.contains("edited since"), "{err}");
    }

    #[test]
    fn missing_file_errors() {
        let dir = tempfile::tempdir().unwrap();
        let err = comment_out_recipe_call_impl(dir.path(), "kubejs/server_scripts/nope.js", 1, 1)
            .err()
            .expect("must error on missing file");
        assert!(err.contains("Failed to read"), "{err}");
    }

    #[test]
    fn hex_hash_is_stable_hex() {
        let h = hex_hash("event.shaped('a')");
        assert_eq!(h.len(), 64);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(h, hex_hash("event.shaped('a')"));
        assert_ne!(h, hex_hash("event.shaped('b')"));
    }

    #[test]
    fn path_must_be_nonempty() {
        let dir = tempfile::tempdir().unwrap();
        let err = comment_out_recipe_call_impl(Path::new(dir.path()), "", 1, 1)
            .err()
            .expect("must reject empty path");
        assert_eq!(err, "empty file path");
    }
