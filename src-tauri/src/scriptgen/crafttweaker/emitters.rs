// Per-recipe-type ZenScript call writers + the ingredient literal serializer.
// Emitted text is verbatim from the pre-split file (byte-identical output).

use crate::models::{Recipe, RecipeIngredient};
use std::collections::HashMap;

pub(crate) fn ingredient_to_zen(ing: &RecipeIngredient) -> String {
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

pub(crate) fn generate_ct_shaped_recipe(recipe: &Recipe, pattern: &[String], key: &HashMap<String, RecipeIngredient>) -> String {
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

pub(crate) fn generate_ct_shapeless_recipe(recipe: &Recipe, ingredients: &[RecipeIngredient]) -> String {
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

pub(crate) fn generate_ct_cooking_recipe(recipe: &Recipe, recipe_type: &crate::models::RecipeType, input: &RecipeIngredient) -> String {
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

pub(crate) fn generate_ct_smithing_recipe(recipe: &Recipe, base: &RecipeIngredient, addition: &RecipeIngredient) -> String {
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

pub(crate) fn generate_ct_stonecutting_recipe(recipe: &Recipe, input: &RecipeIngredient) -> String {
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
