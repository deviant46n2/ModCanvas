// Best-effort reader for CraftTweaker ZenScript recipe calls. Recovers
// `recipes.addShaped/addShapeless`, `furnace.addRecipe/addBlastingRecipe/...`,
// `stonecutter.addRecipe`, `smithing.addRecipe`. Tolerant: unparseable calls
// are skipped so a pack with unusual ZenScript still loads.

use crate::models::{Recipe, RecipeIngredient, RecipeOutput, RecipeType};
use crate::recipes::base_recipe;
use regex::Regex;

/// Parse a ZenScript body and recover every recipe call we can.
pub fn parse_crafttweaker(content: &str) -> Vec<Recipe> {
    let mut recipes = Vec::new();
    let call_re = Regex::new(r"(recipes\.(addShaped|addShapeless)|furnace\.(addRecipe|addBlastingRecipe|addSmokingRecipe|addCampfireRecipe)|stonecutter\.addRecipe|smithing\.addRecipe)\s*\(").unwrap();
    let mut pos = 0;
    while let Some(m) = call_re.find_at(content, pos) {
        let matched = m.as_str();
        let Some(end) = find_balanced_paren(content, m.end()) else {
            break;
        };
        let body = &content[m.start()..end];
        if let Some(recipe) = parse_call(matched, body) {
            recipes.push(recipe);
        }
        pos = end;
    }
    recipes
}

fn find_balanced_paren(s: &str, from: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_str = false;
    let mut escaped = false;
    for (i, ch) in s.char_indices() {
        if i < from {
            continue;
        }
        if in_str {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' || ch == '\'' || ch == '<' {
                in_str = false;
            }
            continue;
        }
        match ch {
            '"' | '\'' | '<' => in_str = true,
            '(' => depth += 1,
            ')' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some(i + 1);
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_call(matched: &str, body: &str) -> Option<Recipe> {
    let method = matched.trim();
    let zen_literals = zen_string_literals(body);
    if zen_literals.is_empty() {
        return None;
    }
    // The output is the first `<item:...>` literal (the leading string arg is
    // the recipe name, not the output).
    let item_literals = zen_literals
        .iter()
        .filter(|s| s.contains("<item:"))
        .collect::<Vec<_>>();
    let output_lit = item_literals
        .first()
        .map(|s| *s)
        .or_else(|| zen_literals.first())?;
    let output = RecipeOutput {
        item: zen_to_id(output_lit)?,
        count: 1,
        nbt: None,
    };
    let mut recipe = base_recipe(kind_for(method)?, output, None);
    recipe.name = recipe.output.item.clone();

    let remaining = zen_literals
        .iter()
        .skip(1)
        .filter(|s| s.contains("<"))
        .map(|s| s.as_str())
        .collect::<Vec<_>>();
    match kind_for(method)? {
        RecipeType::Shaped => {
            // addShaped(name, output, [pattern rows], { A: <ing> })
            let (pattern, key) = shaped_pattern_and_key(body);
            recipe.pattern = Some(pattern);
            recipe.key = Some(key);
            // Also gather the ingredient literals used in key entries.
            let ings = remaining.iter().filter_map(|s| zen_to_ingredient(s)).collect::<Vec<_>>();
            if !ings.is_empty() {
                recipe.ingredients = Some(ings);
            }
        }
        RecipeType::Shapeless => {
            let ings = remaining.iter().filter_map(|s| zen_to_ingredient(s)).collect::<Vec<_>>();
            recipe.ingredients = Some(ings);
        }
        RecipeType::Smelting
        | RecipeType::Blasting
        | RecipeType::Smoking
        | RecipeType::Campfire => {
            // addRecipe(name, output, input, xp, time)
            let ings = remaining
                .iter()
                .filter_map(|s| zen_to_ingredient(s))
                .take(1)
                .collect::<Vec<_>>();
            recipe.ingredients = Some(ings);
            // experience/cookingTime are trailing numerics in the call body.
            let nums = numeric_literals(body);
            recipe.experience = nums.first().copied();
            recipe.cooking_time = nums.get(1).map(|v| *v as i32);
        }
        RecipeType::Stonecutting => {
            let ings = remaining.iter().filter_map(|s| zen_to_ingredient(s)).take(1).collect::<Vec<_>>();
            recipe.ingredients = Some(ings);
        }
        RecipeType::Smithing => {
            let ings = remaining.iter().filter_map(|s| zen_to_ingredient(s)).take(2).collect::<Vec<_>>();
            recipe.ingredients = Some(ings);
        }
        _ => {}
    }

    Some(recipe)
}

fn kind_for(matched: &str) -> Option<RecipeType> {
    if matched.contains("addShaped") {
        Some(RecipeType::Shaped)
    } else if matched.contains("addShapeless") {
        Some(RecipeType::Shapeless)
    } else if matched.contains("addBlastingRecipe") {
        Some(RecipeType::Blasting)
    } else if matched.contains("addSmokingRecipe") {
        Some(RecipeType::Smoking)
    } else if matched.contains("addCampfireRecipe") {
        Some(RecipeType::Campfire)
    } else if matched.contains("furnace.addRecipe") {
        Some(RecipeType::Smelting)
    } else if matched.contains("stonecutter.addRecipe") {
        Some(RecipeType::Stonecutting)
    } else if matched.contains("smithing.addRecipe") {
        Some(RecipeType::Smithing)
    } else {
        None
    }
}

fn zen_string_literals(s: &str) -> Vec<String> {
    let re = Regex::new(r#"<[^>]+>|'[^']+'|"[^"]+""#).unwrap();
    re.captures_iter(s).map(|c| c[0].to_string()).collect()
}

fn numeric_literals(s: &str) -> Vec<f32> {
    let re = Regex::new(r"([0-9]+(?:\.[0-9]+)?)").unwrap();
    re.captures_iter(s)
        .filter_map(|c| c[1].parse::<f32>().ok())
        .collect()
}

fn zen_to_id(lit: &str) -> Option<String> {
    let inner = lit.trim_matches(['<', '>', '\'', '"']);
    if let Some(rest) = inner.strip_prefix("item:") {
        Some(rest.to_string())
    } else if let Some(rest) = inner.strip_prefix("tag:items:") {
        // A bare tag isn't an item id; keep the caller from emitting a bogus
        // output. Represent tags distinctly by returning the tag body.
        Some(rest.to_string())
    } else {
        Some(inner.to_string())
    }
}

fn zen_to_ingredient(lit: &str) -> Option<RecipeIngredient> {
    let inner = lit.trim_matches(['<', '>', '\'', '"']);
    if let Some(rest) = inner.strip_prefix("item:") {
        let base = rest.split('.').next().unwrap_or(rest);
        Some(RecipeIngredient {
            item: base.to_string(),
            count: None,
            tag: Some(false),
            nbt: None,
        })
    } else if let Some(rest) = inner.strip_prefix("tag:items:") {
        Some(RecipeIngredient {
            item: rest.to_string(),
            count: None,
            tag: Some(true),
            nbt: None,
        })
    } else {
        None
    }
}

fn shaped_pattern_and_key(body: &str) -> (Vec<String>, std::collections::HashMap<String, RecipeIngredient>) {
    let re = Regex::new("['\"]([ A-Za-z0-9]+)['\"]").unwrap();
    let rows = re
        .captures_iter(body)
        .filter_map(|c| {
            let s = c[1].to_string();
            if s.chars().all(|ch| ch.is_ascii_uppercase() || ch == ' ' || ch.is_ascii_lowercase() || ch.is_ascii_digit()) && !s.is_empty() {
                Some(s)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    // Key map: A: <ing> entries.
    let key_re = Regex::new("['\"]?([A-Za-z0-9])['\"]?\\s*:\\s*(<[^>]+>)").unwrap();
    let mut key = std::collections::HashMap::new();
    for cap in key_re.captures_iter(body) {
        if let Some(ing) = zen_to_ingredient(&cap[2]) {
            key.insert(cap[1].to_string(), ing);
        }
    }
    (rows, key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::RecipeType;

    #[test]
    fn reads_shaped_zen() {
        let script = r#"
recipes.addShaped("diamond_block", <item:minecraft:diamond_block>,
    [["AAA"],["AAA"],["AAA"]], {
        "A": <item:minecraft:diamond>
    });
"#;
        let recipes = parse_crafttweaker(script);
        assert_eq!(recipes.len(), 1);
        assert_eq!(recipes[0].r#type, RecipeType::Shaped);
        assert_eq!(recipes[0].output.item, "minecraft:diamond_block");
        assert_eq!(recipes[0].key.as_ref().unwrap()["A"].item, "minecraft:diamond");
    }

    #[test]
    fn reads_furnace() {
        let script = r#"furnace.addRecipe("iron", <item:minecraft:iron_ingot>, <item:minecraft:iron_ore>, 0.7, 200);"#;
        let recipes = parse_crafttweaker(script);
        assert_eq!(recipes.len(), 1);
        assert_eq!(recipes[0].r#type, RecipeType::Smelting);
        assert_eq!(recipes[0].experience, Some(0.7));
        assert_eq!(recipes[0].cooking_time, Some(200));
    }
}
