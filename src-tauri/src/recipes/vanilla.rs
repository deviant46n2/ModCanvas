// Parse vanilla data-pack recipe JSON files into the app's `Recipe` model.
// Handles both pre-1.20.5 (`item`/`result` string) and 1.20.5+ (`id`/`result`
// object) field spellings. Unknown types yield an error message instead of a
// hard failure so one bad file never blocks the whole scan.

use crate::models::{Recipe, RecipeIngredient, RecipeType};
use crate::recipes::{base_recipe, first_ingredient, ingredient_from_item_or_tag, result_from_output};
use serde_json::Value;

/// Parse a vanilla `data/<ns>/recipes/<name>.json` document into a `Recipe`.
/// `name` is the file stem (the recipe's resource id last segment).
pub fn parse_vanilla_recipe(name: &str, json: &Value) -> Result<Recipe, String> {
    let obj = json.as_object().ok_or_else(|| "recipe JSON is not an object".to_string())?;
    let raw_type = obj
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "recipe JSON is missing a `type`".to_string())?;

    let group = obj.get("group").and_then(|v| v.as_str()).map(|s| s.to_string());

    let result = match obj.get("result") {
        Some(v) => result_from_output(v).ok_or_else(|| "result has no item/id".to_string())?,
        None => {
            // smithing_trim has no result; not representable as an output recipe.
            return Err("recipe type has no `result` (smithing_trim?)".to_string());
        }
    };

    let mut recipe = base_recipe(map_type(raw_type)?, result, group);
    recipe.name = name.to_string();

    match raw_type {
        "minecraft:crafting_shaped" => {
            let pattern = obj
                .get("pattern")
                .and_then(|v| v.as_array())
                .ok_or_else(|| "shaped recipe missing `pattern`".to_string())?
                .iter()
                .map(|r| r.as_str().map(|s| s.to_string()))
                .collect::<Option<Vec<_>>>()
                .ok_or_else(|| "pattern rows must be strings".to_string())?;
            let key = obj
                .get("key")
                .and_then(|v| v.as_object())
                .ok_or_else(|| "shaped recipe missing `key`".to_string())?;
            let mut key_map = std::collections::HashMap::new();
            for (letter, ing_v) in key {
                if let Some(ing) = ingredient_from_item_or_tag(ing_v) {
                    key_map.insert(letter.clone(), ing);
                }
            }
            recipe.pattern = Some(pattern);
            recipe.key = Some(key_map);
        }
        "minecraft:crafting_shapeless" => {
            let raw = obj
                .get("ingredients")
                .and_then(|v| v.as_array())
                .ok_or_else(|| "shapeless recipe missing `ingredients`".to_string())?;
            let mut ings = Vec::new();
            for v in raw {
                if let Some(ing) = first_ingredient(v) {
                    ings.push(ing);
                }
            }
            recipe.ingredients = Some(ings);
        }
        "minecraft:smelting" | "minecraft:blasting" | "minecraft:smoking" | "minecraft:campfire_cooking" => {
            let ing = obj
                .get("ingredient")
                .and_then(first_ingredient)
                .ok_or_else(|| "cooking recipe missing `ingredient`".to_string())?;
            recipe.ingredients = Some(vec![ing]);
            recipe.experience = obj.get("experience").and_then(|v| v.as_f64()).map(|v| v as f32);
            recipe.cooking_time = obj.get("cookingtime").and_then(|v| v.as_u64()).map(|v| v as i32);
        }
        "minecraft:stonecutting" => {
            let ing = obj
                .get("ingredient")
                .and_then(first_ingredient)
                .ok_or_else(|| "stonecutting recipe missing `ingredient`".to_string())?;
            recipe.ingredients = Some(vec![ing]);
        }
        "minecraft:smithing_transform" => {
            let base = obj
                .get("base")
                .and_then(first_ingredient)
                .ok_or_else(|| "smithing recipe missing `base`".to_string())?;
            let addition = obj
                .get("addition")
                .and_then(first_ingredient)
                .ok_or_else(|| "smithing recipe missing `addition`".to_string())?;
            recipe.ingredients = Some(vec![base, addition]);
        }
        _ => return Err(format!("unsupported recipe type: {raw_type}")),
    }

    Ok(recipe)
}

fn map_type(raw: &str) -> Result<RecipeType, String> {
    match raw {
        "minecraft:crafting_shaped" => Ok(RecipeType::Shaped),
        "minecraft:crafting_shapeless" => Ok(RecipeType::Shapeless),
        "minecraft:smelting" => Ok(RecipeType::Smelting),
        "minecraft:blasting" => Ok(RecipeType::Blasting),
        "minecraft:smoking" => Ok(RecipeType::Smoking),
        "minecraft:campfire_cooking" => Ok(RecipeType::Campfire),
        "minecraft:stonecutting" => Ok(RecipeType::Stonecutting),
        "minecraft:smithing_transform" => Ok(RecipeType::Smithing),
        other => Err(format!("unsupported recipe type: {other}")),
    }
}

/// Parse a vanilla recipe JSON's key entries back to raw ingredient values for
/// round-trip-friendly edits. (Unused currently; kept for symmetry.)
#[allow(dead_code)]
fn key_ingredients(key: &serde_json::Map<String, Value>) -> Vec<(String, RecipeIngredient)> {
    key.iter()
        .filter_map(|(letter, v)| {
            ingredient_from_item_or_tag(v).map(|ing| (letter.clone(), ing))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::RecipeType;

    #[test]
    fn parses_shaped_pre_1205() {
        let json: Value = serde_json::from_str(r#"{
            "type": "minecraft:crafting_shaped",
            "pattern": ["A A", " A ", "A A"],
            "key": { "A": { "item": "minecraft:diamond" } },
            "result": { "item": "minecraft:diamond_block", "count": 1 }
        }"#)
        .unwrap();
        let recipe = parse_vanilla_recipe("diamond_block", &json).unwrap();
        assert_eq!(recipe.r#type, RecipeType::Shaped);
        assert_eq!(recipe.pattern.unwrap(), vec!["A A", " A ", "A A"]);
        assert_eq!(recipe.output.item, "minecraft:diamond_block");
        assert_eq!(recipe.key.unwrap()["A"].item, "minecraft:diamond");
    }

    #[test]
    fn parses_smelting_with_experience() {
        let json: Value = serde_json::from_str(r#"{
            "type": "minecraft:smelting",
            "ingredient": { "item": "minecraft:iron_ore" },
            "result": { "item": "minecraft:iron_ingot" },
            "experience": 0.7,
            "cookingtime": 200
        }"#)
        .unwrap();
        let recipe = parse_vanilla_recipe("iron_ingot", &json).unwrap();
        assert_eq!(recipe.r#type, RecipeType::Smelting);
        assert_eq!(recipe.ingredients.unwrap()[0].item, "minecraft:iron_ore");
        assert_eq!(recipe.experience, Some(0.7));
        assert_eq!(recipe.cooking_time, Some(200));
    }

    #[test]
    fn parses_121_result_object() {
        let json: Value = serde_json::from_str(r#"{
            "type": "minecraft:crafting_shapeless",
            "ingredients": [{ "id": "minecraft:iron_ingot" }],
            "result": { "id": "minecraft:iron_block", "count": 9 }
        }"#)
        .unwrap();
        let recipe = parse_vanilla_recipe("iron_block", &json).unwrap();
        assert_eq!(recipe.r#type, RecipeType::Shapeless);
        assert_eq!(recipe.output.count, 9);
        assert_eq!(recipe.output.item, "minecraft:iron_block");
    }

    #[test]
    fn rejects_missing_type() {
        let json: Value = serde_json::json!({ "result": { "item": "x" } });
        assert!(parse_vanilla_recipe("x", &json).is_err());
    }
}
