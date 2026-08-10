// CraftTweaker ZenScript generation. Split into: `emitters` (per-recipe-type
// call writers + the ingredient literal serializer) and this file's
// orchestrator + tests. Generated output is byte-identical to the pre-split
// file.

mod emitters;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_disable;

use crate::models::{Recipe, RecipeType};
use std::collections::HashMap;

use emitters::{
    generate_ct_cooking_recipe, generate_ct_shaped_recipe, generate_ct_shapeless_recipe,
    generate_ct_smithing_recipe, generate_ct_stonecutting_recipe,
};

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
