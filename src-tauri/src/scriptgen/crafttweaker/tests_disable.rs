// Disable-manifest ordering + ingredient-literal tests for the CraftTweaker
// generator. Body verbatim from the pre-split file.

    use super::*;
    use super::emitters::ingredient_to_zen;
    use crate::models::{Recipe, RecipeIngredient, RecipeOutput, RecipeType};
    use std::collections::HashMap;

    #[test]
    fn test_ct_emits_removes_before_adds() {
        let recipe = Recipe {
            id: "minecraft:stick".to_string(),
            r#type: RecipeType::Shapeless,
            name: "Sticks".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:oak_planks".to_string(), count: Some(2), tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:stick".to_string(), count: 4, nbt: None },
            experience: None,
            cooking_time: None,
            category: None,
        };
        let script = generate_crafttweaker_scripts(
            &[recipe],
            &["minecraft:stick".to_string(), "minecraft:ghost".to_string()],
            "Test Pack",
        );
        let remove_pos = script.find("removeByRecipeName").expect("remove present");
        let add_pos = script.find("recipes.addShapeless").expect("add present");
        assert!(remove_pos < add_pos, "removes must precede adds");
        assert!(script.contains("// Disabled by ModCanvas"));
        assert!(script.contains("recipes.removeByRecipeName(\"minecraft:stick\");"));
        assert!(!script.contains("minecraft:ghost"), "stale id must be dropped");
    }

    #[test]
    fn test_ct_empty_disabled_emits_no_removes() {
        let recipe = Recipe {
            id: "minecraft:stick".to_string(),
            r#type: RecipeType::Shapeless,
            name: "Sticks".to_string(),
            group: None,
            pattern: None,
            key: None,
            ingredients: Some(vec![
                RecipeIngredient { item: "minecraft:oak_planks".to_string(), count: Some(2), tag: Some(false), nbt: None },
            ]),
            output: RecipeOutput { item: "minecraft:stick".to_string(), count: 4, nbt: None },
            experience: None,
            cooking_time: None,
            category: None,
        };
        let script = generate_crafttweaker_scripts(&[recipe], &[], "Test Pack");
        assert!(!script.contains("removeByRecipeName"));
        assert!(!script.contains("Disabled by ModCanvas"));
        assert!(script.contains("recipes.addShapeless"));
    }

    #[test]
    fn test_ingredient_to_zen() {
        let ing = RecipeIngredient {
            item: "minecraft:diamond".to_string(),
            count: Some(1),
            tag: Some(false),
            nbt: None,
        };
        assert_eq!(ingredient_to_zen(&ing), "<item:minecraft:diamond>");
        
        let ing_tag = RecipeIngredient {
            item: "forge:ingots/iron".to_string(),
            count: None,
            tag: Some(true),
            nbt: None,
        };
        assert_eq!(ingredient_to_zen(&ing_tag), "<tag:items:ingots/iron>");
        
        let ing_count = RecipeIngredient {
            item: "minecraft:diamond".to_string(),
            count: Some(3),
            tag: Some(false),
            nbt: None,
        };
        assert_eq!(ingredient_to_zen(&ing_count), "<item:minecraft:diamond> * 3");
    }
