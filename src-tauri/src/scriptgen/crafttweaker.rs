use crate::models::{Recipe, RecipeIngredient, RecipeType};
use std::collections::HashMap;

/// Generate CraftTweaker ZenScript from recipes. `disabled_ids` are resource
/// ids (`ns:file`) of vanilla/mod-jar recipes to remove; they are emitted as
/// `recipes.removeByRecipeName(...)` before the adds.
pub fn generate_crafttweaker_scripts(
    recipes: &[Recipe],
    disabled_ids: &[String],
    pack_name: &str,
) -> String {
    let mut lines = vec![
        "// ModCanvas Generated CraftTweaker Scripts".to_string(),
        format!("// Pack: {}", pack_name),
        "// Generated on: ".to_string() + &chrono::Utc::now().to_rfc3339(),
        "".to_string(),
        "// Import necessary classes".to_string(),
        "import crafttweaker.api.item.IItemStack;".to_string(),
        "import crafttweaker.api.item.IIngredient;".to_string(),
        "import crafttweaker.api.ingredient.IIngredient;".to_string(),
        "import crafttweaker.api.recipe.manager.RecipeManager;".to_string(),
        "".to_string(),
    ];
    
    // Drop stale ids (not present in the passed recipes' id set).
    let known: std::collections::HashSet<&String> = recipes.iter().map(|r| &r.id).collect();
    let live: Vec<&String> = disabled_ids.iter().filter(|id| known.contains(id)).collect();
    if !live.is_empty() {
        lines.push("// Disabled by ModCanvas".to_string());
        for id in &live {
            lines.push(format!("recipes.removeByRecipeName(\"{}\");", id));
        }
        lines.push("".to_string());
    }
    
    // Group recipes by type
    let mut by_type: HashMap<RecipeType, Vec<&Recipe>> = HashMap::new();
    for recipe in recipes {
        by_type.entry(recipe.r#type.clone()).or_default().push(recipe);
    }
    
    for (recipe_type, recipes) in by_type {
        lines.push(format!("// ==== {:?} Recipes ====", recipe_type).to_uppercase());
        lines.push("".to_string());
        
        for recipe in recipes {
            lines.push(format!("// {}", recipe.name));
            
            match recipe.r#type {
                crate::models::RecipeType::Shaped => {
                    if let (Some(pattern), Some(key)) = (&recipe.pattern, &recipe.key) {
                        lines.push(generate_ct_shaped_recipe(recipe, pattern, key));
                    }
                }
                crate::models::RecipeType::Shapeless => {
                    if let Some(ingredients) = &recipe.ingredients {
                        lines.push(generate_ct_shapeless_recipe(recipe, ingredients));
                    }
                }
                crate::models::RecipeType::Smelting | 
                crate::models::RecipeType::Blasting | 
                crate::models::RecipeType::Smoking | 
                crate::models::RecipeType::Campfire => {
                    if let Some(ingredients) = &recipe.ingredients {
                        if !ingredients.is_empty() {
                            lines.push(generate_ct_cooking_recipe(recipe, &recipe_type, &ingredients[0]));
                        }
                    }
                }
                crate::models::RecipeType::Smithing => {
                    if let Some(ingredients) = &recipe.ingredients {
                        if ingredients.len() >= 2 {
                            lines.push(generate_ct_smithing_recipe(recipe, &ingredients[0], &ingredients[1]));
                        }
                    }
                }
                crate::models::RecipeType::Stonecutting => {
                    if let Some(ingredients) = &recipe.ingredients {
                        if !ingredients.is_empty() {
                            lines.push(generate_ct_stonecutting_recipe(recipe, &ingredients[0]));
                        }
                    }
                }
                _ => {}
            }
            lines.push("".to_string());
        }
    }
    
    lines.join("\n")
}

fn ingredient_to_zen(ing: &RecipeIngredient) -> String {
    let mut parts = Vec::new();
    
    if ing.tag.unwrap_or(false) {
        parts.push(format!("<tag:items:{}>", ing.item.trim_start_matches("forge:").trim_start_matches("minecraft:")));
    } else {
        parts.push(format!("<item:{}>", ing.item));
    }
    
    if let Some(count) = ing.count {
        if count > 1 {
            parts.push(format!("* {}", count));
        }
    }
    
    if let Some(nbt) = &ing.nbt {
        if !nbt.is_empty() {
            let nbt_str = serde_json::to_string(nbt).unwrap_or_default();
            parts.push(format!(".withTag({})", nbt_str));
        }
    }
    
    parts.join(" ")
}

fn generate_ct_shaped_recipe(recipe: &Recipe, pattern: &[String], key: &HashMap<String, RecipeIngredient>) -> String {
    let pattern_str: Vec<String> = pattern.iter()
        .map(|row| format!("\"{}\"", row))
        .collect();
    
    let mut key_entries = Vec::new();
    for (k, v) in key {
        key_entries.push(format!("'{}': {}", k, ingredient_to_zen(v)));
    }
    
    let output = ingredient_to_zen(&RecipeIngredient {
        item: recipe.output.item.clone(),
        count: Some(recipe.output.count),
        tag: Some(false),
        nbt: recipe.output.nbt.clone(),
    });
    
    format!(
        "recipes.addShaped(\"{}\", {}, [{}] as string[], {{\n{}\n}} as {{[string: IIngredient]}});",
        recipe.name.replace(' ', "_"),
        output,
        pattern_str.join(", "),
        key_entries.join(",\n")
    )
}

fn generate_ct_shapeless_recipe(recipe: &Recipe, ingredients: &[RecipeIngredient]) -> String {
    let ing_strs: Vec<String> = ingredients.iter()
        .map(ingredient_to_zen)
        .collect();
    
    let output = ingredient_to_zen(&RecipeIngredient {
        item: recipe.output.item.clone(),
        count: Some(recipe.output.count),
        tag: Some(false),
        nbt: recipe.output.nbt.clone(),
    });
    
    format!(
        "recipes.addShapeless(\"{}\", {}, [{}])",
        recipe.name.replace(' ', "_"),
        output,
        ing_strs.join(", ")
    )
}

fn generate_ct_cooking_recipe(recipe: &Recipe, recipe_type: &crate::models::RecipeType, input: &RecipeIngredient) -> String {
    let output = ingredient_to_zen(&RecipeIngredient {
        item: recipe.output.item.clone(),
        count: Some(recipe.output.count),
        tag: Some(false),
        nbt: recipe.output.nbt.clone(),
    });
    
    let input_zen = ingredient_to_zen(input);
    let experience = recipe.experience.unwrap_or(0.0);
    let cooking_time = recipe.cooking_time.unwrap_or(200);
    
    let method = match recipe_type {
        crate::models::RecipeType::Smelting => "addRecipe",
        crate::models::RecipeType::Blasting => "addBlastingRecipe",
        crate::models::RecipeType::Smoking => "addSmokingRecipe",
        crate::models::RecipeType::Campfire => "addCampfireRecipe",
        _ => "addRecipe",
    };
    
    format!(
        "furnace.{}(\"{}\", {}, {}, {}, {});",
        method,
        recipe.name.replace(' ', "_"),
        output,
        input_zen,
        experience,
        cooking_time
    )
}

fn generate_ct_smithing_recipe(recipe: &Recipe, base: &RecipeIngredient, addition: &RecipeIngredient) -> String {
    let output = ingredient_to_zen(&RecipeIngredient {
        item: recipe.output.item.clone(),
        count: Some(recipe.output.count),
        tag: Some(false),
        nbt: recipe.output.nbt.clone(),
    });
    
    let base_zen = ingredient_to_zen(base);
    let addition_zen = ingredient_to_zen(addition);
    
    format!(
        "smithing.addRecipe(\"{}\", {}, {}, {});",
        recipe.name.replace(' ', "_"),
        output,
        base_zen,
        addition_zen
    )
}

fn generate_ct_stonecutting_recipe(recipe: &Recipe, input: &RecipeIngredient) -> String {
    let output = ingredient_to_zen(&RecipeIngredient {
        item: recipe.output.item.clone(),
        count: Some(recipe.output.count),
        tag: Some(false),
        nbt: recipe.output.nbt.clone(),
    });
    
    let input_zen = ingredient_to_zen(input);
    
    format!(
        "stonecutter.addRecipe(\"{}\", {}, {});",
        recipe.name.replace(' ', "_"),
        output,
        input_zen
    )
}

#[cfg(test)]
mod tests {
    use super::*;
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
}
