// KubeJS recipe script generation. Split into: `emitters` (per-recipe-type
// event call writers), `helpers` (ingredient -> KubeJS literal), and the two
// orchestrators + their tests below. Output is byte-identical to the original
// monolithic file.

mod emitters;
mod helpers;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_disable;

use std::collections::HashMap;
use std::path::PathBuf;

use emitters::generate_kubejs_for_type;
use helpers::ingredient_to_kubejs;

/// Generate KubeJS recipe scripts from recipes. `disabled_ids` are resource ids
/// (`ns:file`) of vanilla/mod-jar recipes to remove; they are emitted as
/// `event.remove({ id })` calls before the adds.
pub fn generate_kubejs_scripts(
    scripts_dir: &PathBuf,
    recipes: &[crate::models::Recipe],
    disabled_ids: &[String],
) -> Vec<(PathBuf, String)> {
    let mut output = Vec::new();
    
    // Group recipes by type for better organization
    let mut by_type: HashMap<crate::models::RecipeType, Vec<&crate::models::Recipe>> = HashMap::new();
    for recipe in recipes {
        by_type.entry(recipe.r#type.clone())
            .or_default()
            .push(recipe);
    }
    
    // Drop stale ids (not present in the passed recipes' id set) so a disabled
    // recipe that no longer exists never errors.
    let known: std::collections::HashSet<&String> = recipes.iter().map(|r| &r.id).collect();
    let live: Vec<&String> = disabled_ids.iter().filter(|id| known.contains(id)).collect();
    
    // Generate one file per recipe type
    for (recipe_type, recipes) in by_type {
        let content = generate_kubejs_for_type(&recipe_type, recipes, &live);
        let filename = format!("recipes-{:?}.js", recipe_type).to_lowercase();
        output.push((scripts_dir.join(filename), content));
    }
    
    output
}

pub fn generate_full_startup_script(
    recipes: &[crate::models::Recipe],
    pack_name: &str,
) -> String {
    let mut lines = vec![
        "// ModCanvas Generated KubeJS Startup Script".to_string(),
        format!("// Pack: {}", pack_name),
        "// Generated on: ".to_string() + &chrono::Utc::now().to_rfc3339(),
        "".to_string(),
        "ServerEvents.recipes(event => {".to_string(),
        "".to_string(),
    ];
    
    for recipe in recipes {
        lines.push(format!("  // {}", recipe.name));
        
        match recipe.r#type {
            crate::models::RecipeType::Shaped => {
                if let (Some(pattern), Some(key)) = (&recipe.pattern, &recipe.key) {
                    let pattern_str = pattern.iter()
                        .map(|row| format!("\"{}\"", row))
                        .collect::<Vec<_>>()
                        .join(", ");
                    
                    let key_entries: Vec<String> = key.iter()
                        .map(|(k, v)| format!("  {}: {}", k, ingredient_to_kubejs(v)))
                        .collect();
                    
                    lines.push("  event.shaped(".to_string());
                    lines.push(format!("    '{}',", recipe.output.item));
                    lines.push(format!("    [{}],", pattern_str));
                    lines.push("    {".to_string());
                    for entry in key_entries {
                        lines.push(format!("      {},", entry));
                    }
                    lines.push("    }".to_string());
                    lines.push("  )".to_string());
                }
            }
            crate::models::RecipeType::Shapeless => {
                if let Some(ingredients) = &recipe.ingredients {
                    let ing_strs: Vec<String> = ingredients.iter()
                        .map(ingredient_to_kubejs)
                        .collect();
                    
                    lines.push("  event.shapeless(".to_string());
                    lines.push(format!("    '{}',", recipe.output.item));
                    lines.push(format!("    [{}],", ing_strs.join(", ")));
                    lines.push("  )".to_string());
                }
            }
            crate::models::RecipeType::Smithing => {
                if let Some(ingredients) = &recipe.ingredients {
                    if ingredients.len() >= 2 {
                        let base = ingredient_to_kubejs(&ingredients[0]);
                        let addition = ingredient_to_kubejs(&ingredients[1]);

                        lines.push("  event.smithing(".to_string());
                        lines.push(format!("    '{}',", recipe.output.item));
                        lines.push(format!("    {},", base));
                        lines.push(format!("    {}", addition));
                        lines.push("  )".to_string());
                    }
                }
            }
            crate::models::RecipeType::Stonecutting => {
                if let Some(ingredients) = &recipe.ingredients {
                    if !ingredients.is_empty() {
                        let input = ingredient_to_kubejs(&ingredients[0]);
                        lines.push("  event.stonecutting(".to_string());
                        lines.push(format!("    '{}',", recipe.output.item));
                        lines.push(format!("    {}", input));
                        lines.push("  )".to_string());
                    }
                }
            }
            crate::models::RecipeType::Smelting |
            crate::models::RecipeType::Blasting |
            crate::models::RecipeType::Smoking |
            crate::models::RecipeType::Campfire => {
                if let Some(ingredients) = &recipe.ingredients {
                    if !ingredients.is_empty() {
                        let input = ingredient_to_kubejs(&ingredients[0]);
                        let experience = recipe.experience.unwrap_or(0.0);
                        let cooking_time = recipe.cooking_time.unwrap_or(200);

                        let method = match recipe.r#type {
                            crate::models::RecipeType::Smelting => "smelting",
                            crate::models::RecipeType::Blasting => "blasting",
                            crate::models::RecipeType::Smoking => "smoking",
                            crate::models::RecipeType::Campfire => "campfireCooking",
                            _ => "smelting",
                        };

                        lines.push(format!("  event.{}(", method));
                        lines.push(format!("    '{}',", recipe.output.item));
                        lines.push(format!("    {}", input));
                        let mut close = "  )".to_string();
                        if experience > 0.0 {
                            close.push_str(&format!(".experience({})", experience));
                        }
                        if cooking_time != 200 {
                            close.push_str(&format!(".cookingTime({})", cooking_time));
                        }
                        lines.push(close);
                    }
                }
            }
            _ => {}
        }

        lines.push("".to_string());
    }

    lines.push("})".to_string());
    lines.join("\n")
}
