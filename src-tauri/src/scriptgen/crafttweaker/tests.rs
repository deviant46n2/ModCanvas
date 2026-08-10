// Generation tests for `generate_crafttweaker_scripts`: one per recipe type plus
// NBT, multiple, and empty cases. Body verbatim from the pre-split file.

    use super::*;
    use crate::models::{Recipe, RecipeIngredient, RecipeOutput, RecipeType};
    use std::collections::HashMap;

    #[test]
    fn test_generate_ct_shaped() {
        let mut key = HashMap::new();
        key.insert("A".to_string(), RecipeIngredient { item: "minecraft:diamond".to_string(), count: Some(1), tag: Some(false), nbt: None });
        key.insert("B".to_string(), RecipeIngredient { item: "forge:ingots/iron".to_string(), count: None, tag: Some(true), nbt: None });

        let recipe = Recipe {
            id: "test".to_string(),
            r#type: RecipeType::Shaped,
            name: "Diamond Sword".to_string(),
            group: None,
            pattern: Some(vec!["AB".to_string(), "AB".to_string(), "A".to_string()]),
            key: Some(key),
            ingredients: None,
            output: RecipeOutput { item: "minecraft:diamond_sword".to_string(), count: 1, nbt: None },
            experience: None,
            cooking_time: None,
            category: None,
        };

        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(script.contains("recipes.addShaped"));
        assert!(script.contains("diamond_sword"));
        assert!(script.contains("<tag:items:ingots/iron>"));
    }

    #[test]
    fn test_generate_ct_shapeless() {
        let recipe = Recipe {
            id: "test_shapeless".to_string(),
            r#type: RecipeType::Shapeless,
            name: "Iron Block".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:iron_ingot".to_string(), count: Some(9), tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:iron_block".to_string(), count: 1, nbt: None },
            experience: None,
            cooking_time: None,
            category: None,
        };

        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(script.contains("recipes.addShapeless"));
        assert!(script.contains("iron_block"));
        assert!(script.contains("<item:minecraft:iron_ingot>"));
    }

    #[test]
    fn test_generate_ct_smelting() {
        let recipe = Recipe {
            id: "test_smelt".to_string(),
            r#type: RecipeType::Smelting,
            name: "Smelt Iron".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:iron_ore".to_string(), count: None, tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:iron_ingot".to_string(), count: 1, nbt: None },
            experience: Some(0.7),
            cooking_time: Some(200),
            category: None,
        };

        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(script.contains("furnace.addRecipe"));
        assert!(script.contains("iron_ingot"));
        assert!(script.contains("0.7"));
        assert!(script.contains("200"));
    }

    #[test]
    fn test_generate_ct_blasting() {
        let recipe = Recipe {
            id: "test_blast".to_string(),
            r#type: RecipeType::Blasting,
            name: "Blast Iron".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:iron_ore".to_string(), count: None, tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:iron_ingot".to_string(), count: 1, nbt: None },
            experience: Some(1.0),
            cooking_time: Some(100),
            category: None,
        };

        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(script.contains("furnace.addBlastingRecipe"));
        assert!(script.contains("iron_ingot"));
    }

    #[test]
    fn test_generate_ct_smithing() {
        let recipe = Recipe {
            id: "test_smith".to_string(),
            r#type: RecipeType::Smithing,
            name: "Smith Sword".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:diamond".to_string(), count: None, tag: Some(false), nbt: None },
                RecipeIngredient { item: "minecraft:stick".to_string(), count: None, tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:diamond_sword".to_string(), count: 1, nbt: None },
            experience: None,
            cooking_time: None,
            category: None,
        };

        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(script.contains("smithing.addRecipe"));
        assert!(script.contains("diamond_sword"));
    }

    #[test]
    fn test_generate_ct_stonecutting() {
        let recipe = Recipe {
            id: "test_cut".to_string(),
            r#type: RecipeType::Stonecutting,
            name: "Cut Stone".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:stone".to_string(), count: None, tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:stone_stairs".to_string(), count: 1, nbt: None },
            experience: None,
            cooking_time: None,
            category: None,
        };

        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(script.contains("stonecutter.addRecipe"));
        assert!(script.contains("stone_stairs"));
    }

    #[test]
    fn test_generate_ct_with_nbt() {
        let mut nbt_map = HashMap::new();
        nbt_map.insert("display".to_string(), serde_json::json!({"Name": "Special"}));

        let recipe = Recipe {
            id: "test_nbt".to_string(),
            r#type: RecipeType::Shapeless,
            name: "NBT Recipe".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient {
                    item: "minecraft:diamond".to_string(),
                    count: Some(1),
                    tag: Some(false),
                    nbt: Some(nbt_map),
                },
            ]),
            output: RecipeOutput { item: "minecraft:diamond_block".to_string(), count: 1, nbt: None },
            experience: None,
            cooking_time: None,
            category: None,
        };

        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(script.contains(".withTag"));
        assert!(script.contains("Special"));
    }

    #[test]
    fn test_generate_ct_multiple_recipes() {
        let recipes = vec![
            Recipe {
                id: "r1".to_string(),
                r#type: RecipeType::Shaped,
                name: "Shaped".to_string(),
                group: None,
                pattern: Some(vec!["A".to_string()]),
                key: Some({
                    let mut m = HashMap::new();
                    m.insert("A".to_string(), RecipeIngredient { item: "minecraft:diamond".to_string(), count: Some(1), tag: Some(false), nbt: None });
                    m
                }),
                ingredients: None,
                output: RecipeOutput { item: "minecraft:diamond_block".to_string(), count: 1, nbt: None },
                experience: None,
                cooking_time: None,
                category: None,
            },
            Recipe {
                id: "r2".to_string(),
                r#type: RecipeType::Shapeless,
                name: "Iron Block".to_string(),
                group: None,
                pattern: None,
                key: None,
                ingredients: Some(vec![
                    RecipeIngredient { item: "minecraft:iron_ingot".to_string(), count: Some(9), tag: Some(false), nbt: None },
                ]),
                output: RecipeOutput { item: "minecraft:iron_block".to_string(), count: 1, nbt: None },
                experience: None,
                cooking_time: None,
                category: None,
            },
        ];

        let script = generate_crafttweaker_scripts(&recipes, &[], "Test Pack");
        assert!(script.contains("recipes.addShaped"));
        assert!(script.contains("recipes.addShapeless"));
        assert!(script.contains("diamond_block"));
        assert!(script.contains("iron_block"));
    }

    #[test]
    fn test_generate_ct_empty_recipes() {
        let script = generate_crafttweaker_scripts(&[], &[], "Empty Pack");
        assert!(script.contains("ModCanvas Generated CraftTweaker Scripts"));
        assert!(script.contains("Empty Pack"));
    }

    #[test]
    fn test_crafttweaker_smoking() {
        let recipe = Recipe {
            id: "test_smoke".to_string(),
            r#type: RecipeType::Smoking,
            name: "Smoke Salmon".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:salmon".to_string(), count: None, tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:cooked_salmon".to_string(), count: 1, nbt: None },
            experience: Some(0.35),
            cooking_time: Some(100),
            category: None,
        };

        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(script.contains("furnace.addSmokingRecipe"));
        assert!(script.contains("cooked_salmon"));
        assert!(script.contains("0.35"));
        assert!(script.contains("100"));
    }

    #[test]
    fn test_crafttweaker_campfire() {
        let recipe = Recipe {
            id: "test_campfire".to_string(),
            r#type: RecipeType::Campfire,
            name: "Campfire Beef".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:beef".to_string(), count: None, tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:cooked_beef".to_string(), count: 1, nbt: None },
            experience: Some(0.35),
            cooking_time: Some(600),
            category: None,
        };

        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(script.contains("furnace.addCampfireRecipe"));
        assert!(script.contains("cooked_beef"));
        assert!(script.contains("0.35"));
        assert!(script.contains("600"));
    }
