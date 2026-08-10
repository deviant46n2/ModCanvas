// JSON value -> app `Recipe` model converters shared by the vanilla, KubeJS,
// and CraftTweaker readers. Pure functions: no I/O, no IPC.

use crate::models::{Recipe, RecipeIngredient, RecipeOutput, RecipeType};

pub(crate) fn ingredient_from_item_or_tag(v: &serde_json::Value) -> Option<RecipeIngredient> {
    match v {
        serde_json::Value::String(s) => {
            if let Some(tag) = s.strip_prefix('#') {
                Some(RecipeIngredient {
                    item: tag.to_string(),
                    count: None,
                    tag: Some(true),
                    nbt: None,
                })
            } else {
                Some(RecipeIngredient {
                    item: s.clone(),
                    count: None,
                    tag: Some(false),
                    nbt: None,
                })
            }
        }
        serde_json::Value::Object(o) => {
            let id = o
                .get("item")
                .and_then(|v| v.as_str())
                .or_else(|| o.get("id").and_then(|v| v.as_str()))
                .or_else(|| o.get("tag").and_then(|v| v.as_str()));
            let item = id?;
            let is_tag = o.contains_key("tag");
            let count = o.get("count").and_then(|c| c.as_u64()).map(|c| c as i32);
            Some(RecipeIngredient {
                item: item.to_string(),
                count: if is_tag { None } else { count },
                tag: Some(is_tag),
                nbt: None,
            })
        }
        _ => None,
    }
}

pub(crate) fn result_from_output(v: &serde_json::Value) -> Option<RecipeOutput> {
    match v {
        serde_json::Value::String(s) => Some(RecipeOutput {
            item: s.clone(),
            count: 1,
            nbt: None,
        }),
        serde_json::Value::Object(o) => {
            let item = o
                .get("item")
                .and_then(|v| v.as_str())
                .or_else(|| o.get("id").and_then(|v| v.as_str()))?
                .to_string();
            let count = o.get("count").and_then(|c| c.as_u64()).map(|c| c as i32).unwrap_or(1);
            Some(RecipeOutput {
                item,
                count,
                nbt: None,
            })
        }
        _ => None,
    }
}

pub(crate) fn first_ingredient(v: &serde_json::Value) -> Option<RecipeIngredient> {
    match v {
        serde_json::Value::Array(arr) => arr
            .iter()
            .find_map(ingredient_from_item_or_tag),
        other => ingredient_from_item_or_tag(other),
    }
}

fn tmp_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("discovered_{nanos}")
}

/// Emit the app recipe fields shared by every type.
pub(crate) fn base_recipe(
    r#type: RecipeType,
    output: RecipeOutput,
    group: Option<String>,
) -> Recipe {
    Recipe {
        id: tmp_id(),
        name: output.item.clone(),
        r#type,
        group,
        pattern: None,
        key: None,
        ingredients: None,
        output,
        experience: None,
        cooking_time: None,
        category: None,
    }
}
