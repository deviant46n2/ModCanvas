// Disable-manifest ordering, ingredient literal, and serde-camelCase tests for
// the KubeJS generator. Body verbatim from the pre-split file.

    use super::*;
    use crate::models::{Recipe, RecipeIngredient, RecipeOutput, RecipeType};
    use std::collections::HashMap;

    #[test]
    fn test_ingredient_to_kubejs() {
        let ing = RecipeIngredient {
            item: "minecraft:diamond".to_string(),
            count: Some(1),
            tag: Some(false),
            nbt: None,
        };
        assert_eq!(ingredient_to_kubejs(&ing), "'minecraft:diamond'");
        
        let ing_tag = RecipeIngredient {
            item: "forge:ingots/iron".to_string(),
            count: None,
            tag: Some(true),
            nbt: None,
        };
        assert_eq!(ingredient_to_kubejs(&ing_tag), "#forge:ingots/iron");
        
        let ing_count = RecipeIngredient {
            item: "minecraft:diamond".to_string(),
            count: Some(3),
            tag: Some(false),
            nbt: None,
        };
        assert_eq!(ingredient_to_kubejs(&ing_count), "{ 'minecraft:diamond', count: 3 }");
    }

    #[test]
    fn test_ingredient_with_nbt() {
        let mut nbt_map = HashMap::new();
        nbt_map.insert("Damage".to_string(), serde_json::json!(0));

        let ing = RecipeIngredient {
            item: "minecraft:diamond_sword".to_string(),
            count: Some(1),
            tag: Some(false),
            nbt: Some(nbt_map),
        };
        let result = ingredient_to_kubejs(&ing);
        assert!(result.contains("nbt:"));
        assert!(result.contains("Damage"));
    }

    #[test]
    fn test_emits_removes_before_adds() {
        let recipe = Recipe {
            id: "minecraft:stick".to_string(),
            name: "Sticks".to_string(),
            r#type: RecipeType::Shapeless,
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
        let disabled = vec!["minecraft:stick".to_string(), "minecraft:ghost".to_string()];
        let scripts = generate_kubejs_scripts(&PathBuf::new(), &[recipe], &disabled);
        let combined = scripts.iter().map(|(_, c)| c.as_str()).collect::<Vec<_>>().join("\n\n");
        let remove_pos = combined.find("event.remove").expect("remove present");
        let add_pos = combined.find("event.shapeless").expect("add present");
        assert!(remove_pos < add_pos, "removes must precede adds");
        assert!(combined.contains("// Disabled by ModCanvas"));
        assert!(combined.contains("event.remove({ id: 'minecraft:stick' })"));
        assert!(!combined.contains("minecraft:ghost"), "stale id must be dropped");
    }

    #[test]
    fn test_empty_disabled_emits_no_removes() {
        let recipe = Recipe {
            id: "minecraft:stick".to_string(),
            name: "Sticks".to_string(),
            r#type: RecipeType::Shapeless,
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
        let scripts = generate_kubejs_scripts(&PathBuf::new(), &[recipe], &[]);
        let combined = scripts.iter().map(|(_, c)| c.as_str()).collect::<Vec<_>>().join("\n\n");
        assert!(!combined.contains("event.remove"));
        assert!(!combined.contains("Disabled by ModCanvas"));
        assert!(combined.contains("event.shapeless"));
    }

    #[test]
    fn test_deserialize_camelcase_cooking_time() {
        // The frontend emits `cookingTime` (camelCase); without serde
        // `rename_all = "camelCase"` on Recipe this value would be dropped.
        let json = r#"{
            "id": "r",
            "name": "Smelt",
            "type": "smelting",
            "output": { "item": "minecraft:iron_ingot", "count": 1 },
            "ingredients": [ { "item": "minecraft:iron_ore", "tag": false } ],
            "experience": 0.7,
            "cookingTime": 300
        }"#;
        let recipe: Recipe = serde_json::from_str(json).unwrap();
        assert_eq!(recipe.cooking_time, Some(300));
        assert_eq!(recipe.experience, Some(0.7));
    }
