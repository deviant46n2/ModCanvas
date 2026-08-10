// Generation tests for `generate_full_startup_script`: one per recipe type plus
// NBT, empty, and multi-recipe cases. Body verbatim from the pre-split file.

    use super::*;
    use crate::models::{Recipe, RecipeIngredient, RecipeOutput, RecipeType};
    use std::collections::HashMap;

    #[test]
    fn test_generate_shaped_recipe() {
        let recipe = Recipe {
            id: "test".to_string(),
            name: "Test Recipe".to_string(),
            r#type: RecipeType::Shaped,
            group: None,
            pattern: Some(vec!["ABC".to_string(), "DEF".to_string(), "GHI".to_string()]),
            key: Some({
                let mut m = HashMap::new();
                m.insert("A".to_string(), RecipeIngredient { item: "minecraft:diamond".to_string(), count: Some(1), tag: Some(false), nbt: None });
                m.insert("B".to_string(), RecipeIngredient { item: "forge:ingots/iron".to_string(), count: None, tag: Some(true), nbt: None });
                m
            }),
            ingredients: None,
            output: RecipeOutput { item: "minecraft:diamond_sword".to_string(), count: 1, nbt: None },
            experience: None,
            cooking_time: None,
            category: None,
        };

        let script = generate_full_startup_script(&[recipe], "Test Pack");
        assert!(script.contains("event.shaped"));
        assert!(script.contains("diamond_sword"));
        assert!(script.contains("#forge:ingots/iron"));
    }

    #[test]
    fn test_generate_shapeless_recipe() {
        let recipe = Recipe {
            id: "test_shapeless".to_string(),
            name: "Test Shapeless".to_string(),
            r#type: RecipeType::Shapeless,
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:iron_ingot".to_string(), count: Some(3), tag: Some(false), nbt: None },
                RecipeIngredient { item: "minecraft:stick".to_string(), count: Some(1), tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:iron_sword".to_string(), count: 1, nbt: None },
            experience: None,
            cooking_time: None,
            category: None,
        };

        let script = generate_full_startup_script(&[recipe], "Test Pack");
        assert!(script.contains("event.shapeless"));
        assert!(script.contains("iron_sword"));
        assert!(script.contains("iron_ingot"));
    }

    #[test]
    fn test_generate_smithing_recipe() {
        let recipe = Recipe {
            id: "test_smithing".to_string(),
            name: "Test Smithing".to_string(),
            r#type: RecipeType::Smithing,
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

        let script = generate_full_startup_script(&[recipe], "Test Pack");
        assert!(script.contains("event.smithing"));
        assert!(script.contains("diamond_sword"));
    }

    #[test]
    fn test_generate_stonecutting_recipe() {
        let recipe = Recipe {
            id: "test_stonecut".to_string(),
            name: "Test Stonecut".to_string(),
            r#type: RecipeType::Stonecutting,
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

        let script = generate_full_startup_script(&[recipe], "Test Pack");
        assert!(script.contains("event.stonecutting"));
        assert!(script.contains("stone_stairs"));
    }

    #[test]
    fn test_generate_smelting_recipe() {
        let recipe = Recipe {
            id: "test_smelt".to_string(),
            name: "Test Smelt".to_string(),
            r#type: RecipeType::Smelting,
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

        let script = generate_full_startup_script(&[recipe], "Test Pack");
        assert!(script.contains("event.smelting"));
        assert!(script.contains("iron_ingot"));
        assert!(script.contains(".experience(0.7)"));
    }

    #[test]
    fn test_generate_recipe_with_nbt() {
        let mut nbt_map = HashMap::new();
        nbt_map.insert("display".to_string(), serde_json::json!({"Name": "{\"text\":\"Special Diamond\"}"}));

        let recipe = Recipe {
            id: "test_nbt".to_string(),
            name: "Test NBT".to_string(),
            r#type: RecipeType::Shapeless,
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

        let script = generate_full_startup_script(&[recipe], "Test Pack");
        assert!(script.contains("event.shapeless"));
        assert!(script.contains("Special Diamond"));
    }

    #[test]
    fn test_generate_empty_recipes() {
        let script = generate_full_startup_script(&[], "Empty Pack");
        assert!(script.contains("ServerEvents.recipes"));
        assert!(script.contains("Empty Pack"));
    }

    #[test]
    fn test_generate_multiple_recipes() {
        let recipes = vec![
            Recipe {
                id: "r1".to_string(),
                name: "Shaped".to_string(),
                r#type: RecipeType::Shaped,
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
                name: "Shapeless".to_string(),
                r#type: RecipeType::Shapeless,
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

        let script = generate_full_startup_script(&recipes, "Multi Pack");
        assert!(script.contains("diamond_block"));
        assert!(script.contains("iron_block"));
        assert!(script.contains("event.shaped"));
        assert!(script.contains("event.shapeless"));
    }

    #[test]
    fn test_generate_blasting() {
        let recipe = Recipe {
            id: "test_blast".to_string(),
            name: "Test Blast".to_string(),
            r#type: RecipeType::Blasting,
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

        let script = generate_full_startup_script(&[recipe], "Test Pack");
        assert!(script.contains("event.blasting"));
        assert!(script.contains("iron_ingot"));
        assert!(script.contains(".experience(1)"));
        assert!(script.contains(".cookingTime(100)"));
    }

    #[test]
    fn test_generate_smoking() {
        let recipe = Recipe {
            id: "test_smoke".to_string(),
            name: "Test Smoke".to_string(),
            r#type: RecipeType::Smoking,
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

        let script = generate_full_startup_script(&[recipe], "Test Pack");
        assert!(script.contains("event.smoking"));
        assert!(script.contains("cooked_salmon"));
        assert!(script.contains(".experience(0.35)"));
    }

    #[test]
    fn test_generate_campfire() {
        let recipe = Recipe {
            id: "test_campfire".to_string(),
            name: "Test Campfire".to_string(),
            r#type: RecipeType::Campfire,
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

        let script = generate_full_startup_script(&[recipe], "Test Pack");
        assert!(script.contains("event.campfireCooking"));
        assert!(script.contains("cooked_beef"));
        assert!(script.contains(".cookingTime(600)"));
    }
