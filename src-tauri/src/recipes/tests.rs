// End-to-end tests for `scan_pack_recipes`: pack dirs, mod jars, cache reuse,
// and span threading. Split out of mod.rs to keep every recipes file <= 300.

    use super::*;

    #[test]
    fn scans_vanilla_jsons() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data/minecraft/recipes");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(
            data.join("diamond_block.json"),
            r#"{"type":"minecraft:crafting_shaped","pattern":["AA","AA"],"key":{"A":{"item":"minecraft:diamond"}},"result":{"item":"minecraft:diamond_block"}}"#,
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].origin, RecipeOrigin::Vanilla);
        assert_eq!(found[0].recipe.output.item, "minecraft:diamond_block");
        assert!(found[0].editable);
    }

    #[test]
    fn scans_kubejs() {
        let dir = tempfile::tempdir().unwrap();
        let kube = dir.path().join("kubejs/server_scripts");
        std::fs::create_dir_all(&kube).unwrap();
        std::fs::write(
            kube.join("recipes.js"),
            "ServerEvents.recipes(event => { event.smelting('minecraft:iron_ingot', 'minecraft:iron_ore') })",
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].origin, RecipeOrigin::Kubejs);
        assert_eq!(found[0].recipe.output.item, "minecraft:iron_ingot");
    }

    #[test]
    fn scans_crafttweaker() {
        let dir = tempfile::tempdir().unwrap();
        let scripts = dir.path().join("scripts");
        std::fs::create_dir_all(&scripts).unwrap();
        std::fs::write(
            scripts.join("recipes.zs"),
            "furnace.addRecipe(\"iron\", <item:minecraft:iron_ingot>, <item:minecraft:iron_ore>, 0.7, 200);",
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].origin, RecipeOrigin::Crafttweaker);
        assert_eq!(found[0].recipe.experience, Some(0.7));
    }

    #[test]
    fn empty_pack_yields_nothing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(scan_pack_recipes(dir.path()).is_empty());
    }

    #[test]
    fn kubejs_span_is_threaded_through_discovery() {
        let dir = tempfile::tempdir().unwrap();
        let kube = dir.path().join("kubejs/server_scripts");
        std::fs::create_dir_all(&kube).unwrap();
        std::fs::write(
            kube.join("recipes.js"),
            "ServerEvents.recipes(event => {\n  // event.shaped('minecraft:ghost', ['A'], { A: 'minecraft:ghost_item' })\n  event.smelting('minecraft:iron_ingot', 'minecraft:iron_ore')\n})",
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1, "commented-out kubejs call must be skipped");
        assert_eq!(found[0].span.unwrap(), LineSpan { start: 3, end: 3 });
    }

    #[test]
    fn crafttweaker_span_is_threaded_through_discovery() {
        let dir = tempfile::tempdir().unwrap();
        let scripts = dir.path().join("scripts");
        std::fs::create_dir_all(&scripts).unwrap();
        std::fs::write(
            scripts.join("recipes.zs"),
            "furnace.addRecipe(\"iron\", <item:minecraft:iron_ingot>, <item:minecraft:iron_ore>, 0.7, 200);",
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].span.unwrap(), LineSpan { start: 1, end: 1 });
    }

    #[test]
    fn vanilla_and_jar_recipes_have_no_span() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data/mc/recipes");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(
            data.join("diamond_block.json"),
            r#"{"type":"minecraft:crafting_shaped","pattern":["A"],"key":{"A":{"item":"minecraft:diamond"}},"result":{"item":"minecraft:diamond_block"}}"#,
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].origin, RecipeOrigin::Vanilla);
        assert_eq!(found[0].span, None);
    }

    #[test]
    fn scans_recipes_inside_mod_jars() {
        use zip::CompressionMethod;
        use zip::write::FileOptions;
        use std::io::Write;

        let dir = tempfile::tempdir().unwrap();
        let mods = dir.path().join("mods");
        std::fs::create_dir_all(&mods).unwrap();

        // Write a jar containing a vanilla recipe.
        let jar_path = mods.join("example.jar");
        let file = std::fs::File::create(&jar_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> =
            FileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file("data/example/recipes/diamond_block.json", options).unwrap();
        zip.write_all(br#"{"type":"minecraft:crafting_shaped","pattern":["A"],"key":{"A":{"item":"minecraft:diamond"}},"result":{"item":"minecraft:diamond_block"}}"#).unwrap();
        zip.finish().unwrap();

        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].origin, RecipeOrigin::Vanilla);
        assert_eq!(found[0].recipe.output.item, "minecraft:diamond_block");
        assert!(!found[0].editable);
        assert!(found[0].source.starts_with("jar:"));
    }

    #[test]
    fn pack_data_override_is_editable_and_kept() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data/mc/recipes");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(
            data.join("iron_ingot.json"),
            r#"{"type":"minecraft:smelting","ingredient":{"item":"minecraft:iron_ore"},"result":{"item":"minecraft:iron_ingot"},"experience":0.7}"#,
        )
        .unwrap();
        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1);
        assert!(found[0].editable);
    }

    #[test]
    fn editable_override_shadows_jar_recipe_with_same_id() {
        use zip::CompressionMethod;
        use zip::write::FileOptions;
        use std::io::Write;

        let dir = tempfile::tempdir().unwrap();
        let mods = dir.path().join("mods");
        let data = dir.path().join("data/minecraft/recipes");
        std::fs::create_dir_all(&mods).unwrap();
        std::fs::create_dir_all(&data).unwrap();

        // Jar provides minecraft:iron_ingot.
        let jar_path = mods.join("example.jar");
        let file = std::fs::File::create(&jar_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> =
            FileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file("data/minecraft/recipes/iron_ingot.json", options).unwrap();
        zip.write_all(br#"{"type":"minecraft:smelting","ingredient":{"item":"minecraft:iron_ore"},"result":{"item":"minecraft:iron_ingot"},"experience":0.7}"#).unwrap();
        zip.finish().unwrap();

        // Pack overrides the same id.
        std::fs::write(
            data.join("iron_ingot.json"),
            r#"{"type":"minecraft:smelting","ingredient":{"item":"minecraft:iron_ore"},"result":{"item":"minecraft:iron_ingot"},"experience":1.0}"#,
        )
        .unwrap();

        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1, "override should collapse the jar duplicate");
        assert!(found[0].editable, "pack override must win");
        assert_eq!(found[0].recipe.experience, Some(1.0));
    }

    #[test]
    fn cache_reuses_result_until_files_change() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data/mc/recipes");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(
            data.join("a.json"),
            r#"{"type":"minecraft:crafting_shapeless","ingredients":[{"item":"minecraft:dirt"}],"result":{"item":"minecraft:stone"}}"#,
        )
        .unwrap();

        let first = scan_pack_recipes(dir.path());
        assert_eq!(first.len(), 1);

        // Second scan should hit the cache and stay consistent.
        let second = scan_pack_recipes(dir.path());
        assert_eq!(second.len(), 1);

        // Editing a recipe file invalidates the cache (length differs).
        std::fs::write(
            data.join("a.json"),
            r#"{"type":"minecraft:crafting_shapeless","ingredients":[{"item":"minecraft:dirt"},{"item":"minecraft:stick"}],"result":{"item":"minecraft:grass_block"}}"#,
        )
        .unwrap();
        let third = scan_pack_recipes(dir.path());
        assert_eq!(third.len(), 1);
        assert_eq!(third[0].recipe.output.item, "minecraft:grass_block");
    }

    #[test]
    fn loads_all_recipes_across_multiple_jars() {
        use zip::CompressionMethod;
        use zip::write::FileOptions;
        use std::io::Write;

        let dir = tempfile::tempdir().unwrap();
        let mods = dir.path().join("mods");
        std::fs::create_dir_all(&mods).unwrap();

        let write_jar = |name: &str, entries: &[(&str, &str)]| {
            let jar_path = mods.join(format!("{name}.jar"));
            let file = std::fs::File::create(&jar_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options: FileOptions<'_, ()> =
                FileOptions::default().compression_method(CompressionMethod::Stored);
            for (path, content) in entries {
                zip.start_file(path, options).unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        };

        write_jar("moda", &[
            ("data/mod_a/recipes/one.json", r#"{"type":"minecraft:crafting_shapeless","ingredients":[{"item":"minecraft:dirt"}],"result":{"item":"minecraft:stone"}}"#),
            ("data/mod_a/recipes/two.json", r#"{"type":"minecraft:smelting","ingredient":{"item":"minecraft:iron_ore"},"result":{"item":"minecraft:iron_ingot"}}"#),
        ]);
        write_jar("modb", &[
            ("data/mod_b/recipes/three.json", r#"{"type":"minecraft:crafting_shaped","pattern":["A"],"key":{"A":{"item":"minecraft:stick"}},"result":{"item":"minecraft:stone_sword"}}"#),
        ]);

        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 3, "all recipes from all jars should load");
    }

    #[test]
    fn loads_recipes_from_121_singular_recipe_folder() {
        use zip::CompressionMethod;
        use zip::write::FileOptions;
        use std::io::Write;

        let dir = tempfile::tempdir().unwrap();
        let mods = dir.path().join("mods");
        std::fs::create_dir_all(&mods).unwrap();

        // MC 1.21+ datapacks use data/<ns>/recipe/ (singular).
        let jar_path = mods.join("moda.jar");
        let file = std::fs::File::create(&jar_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options: FileOptions<'_, ()> =
            FileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file(
            "data/mod_a/recipe/diamond_block.json",
            options,
        )
        .unwrap();
        zip.write_all(
            br#"{"type":"minecraft:crafting_shaped","pattern":["AA","AA"],"key":{"A":{"item":"minecraft:diamond"}},"result":{"id":"minecraft:diamond_block","count":1}}"#,
        )
        .unwrap();
        zip.finish().unwrap();

        let found = scan_pack_recipes(dir.path());
        assert_eq!(found.len(), 1, "1.21 singular `recipe` folder must be scanned");
        assert_eq!(found[0].id, "mod_a:diamond_block");
        assert_eq!(found[0].recipe.output.item, "minecraft:diamond_block");
    }
