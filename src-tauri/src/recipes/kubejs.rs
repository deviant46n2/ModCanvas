// Best-effort reader for recipes declared in KubeJS `ServerEvents.recipes`
// blocks. This is intentionally tolerant: it scans for `event.<type>(...)`
// calls and recovers output + inputs, never failing on exotic DSL. Unparseable
// lines are skipped silently so a pack with hand-written helpers still loads.

use crate::models::{Recipe, RecipeIngredient, RecipeOutput, RecipeType};
use crate::recipes::base_recipe;
use regex::Regex;

/// Parse a KubeJS script body, returning every recipe call we can recover.
/// `file` is a label for provenance/debug.
pub fn parse_kubejs_scripts(content: &str) -> Vec<Recipe> {
    let mut recipes = Vec::new();
    let call_re = Regex::new(r"event\.(shaped|shapeless|smelting|blasting|smoking|campfireCooking|stonecutting|smithing)\s*\(").unwrap();
    // Split into `event.<fn>( ... )` chunks by scanning balanced parens.
    let mut pos = 0;
    let bytes = content.as_bytes();
    while let Some(m) = call_re.find_at(content, pos) {
        let method = m.as_str().trim_start_matches("event.").trim_end_matches('(');
        let start = m.end();
        let Some(mut end) = find_balanced_paren(content, start) else {
            break;
        };
        // Swallow trailing `.modifier(...)` chains so `.experience(0.7)` etc.
        // stay inside the captured body.
        while let Some(rest) = content.get(end..) {
            let trimmed = rest.trim_start();
            if let Some(chain) = trimmed.strip_prefix('.') {
                let ident_end = chain
                    .find(|c: char| !c.is_ascii_alphanumeric())
                    .unwrap_or(chain.len());
                let after = chain.get(ident_end..).unwrap_or("").trim_start();
                if after.starts_with('(') {
                    let chain_start = end + (trimmed.len() - chain.len()) + 1 + ident_end;
                    let Some(new_end) = find_balanced_paren(content, chain_start) else {
                        break;
                    };
                    end = new_end;
                    continue;
                }
            }
            break;
        }
        let body = &content[m.start()..end];
        if let Some(recipe) = parse_call(method, body) {
            recipes.push(recipe);
        }
        pos = end;
    }
    let _ = bytes;
    recipes
}

fn find_balanced_paren(s: &str, from: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_str = false;
    let mut escaped = false;
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    for (i, ch) in chars {
        if i < from {
            continue;
        }
        if in_str {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' || ch == '\'' {
                in_str = false;
            }
            continue;
        }
        match ch {
            '"' | '\'' => in_str = true,
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

/// Recover a recipe from a single `event.<method>( ... )` call body.
fn parse_call(method: &str, body: &str) -> Option<Recipe> {
    // Extract the first string literal (the output id).
    let output = first_string_literal(body)?;
    let result = RecipeOutput {
        item: output,
        count: 1,
        nbt: None,
    };
    let mut recipe = base_recipe(kind_for(method)?, result, None);
    recipe.name = recipe.output.item.clone();

    match kind_for(method)? {
        RecipeType::Shaped => {
            // event.shaped('out', ['AAA','AAA','AAA'], { A: 'item' })
            // Inputs come from the pattern/key object; we recover the key map.
            let key_map = object_key_map(body);
            recipe.key = Some(key_map);
            recipe.pattern = Some(pattern_from_body(body));
        }
        RecipeType::Shapeless => {
            // event.shapeless('out', ['a','b','c'])
            let ings = array_literals(body)
                .into_iter()
                .filter_map(|s| string_to_ingredient(&s))
                .collect::<Vec<_>>();
            recipe.ingredients = Some(ings);
        }
        other => {
            // Smelting/blasting/smoking/campfire/stonecutting/smithing:
            // inputs appear as string or object literals after the output.
            let rest = body_after_output(body)?;
            let ings = string_literals(rest)
                .into_iter()
                .filter_map(|s| string_to_ingredient(&s))
                .collect::<Vec<_>>();
            recipe.ingredients = Some(match other {
                RecipeType::Smelting
                | RecipeType::Blasting
                | RecipeType::Smoking
                | RecipeType::Campfire
                | RecipeType::Stonecutting => ings.into_iter().take(1).collect(),
                RecipeType::Smithing => ings.into_iter().take(2).collect(),
                _ => ings,
            });
            // Experience / cooking time: `.experience(0.7).cookingTime(200)`
            recipe.experience = capture_number(body, "experience");
            recipe.cooking_time = capture_number(body, "cookingTime").map(|v| v as i32);
        }
    }

    Some(recipe)
}

fn kind_for(method: &str) -> Option<RecipeType> {
    match method {
        "shaped" => Some(RecipeType::Shaped),
        "shapeless" => Some(RecipeType::Shapeless),
        "smelting" => Some(RecipeType::Smelting),
        "blasting" => Some(RecipeType::Blasting),
        "smoking" => Some(RecipeType::Smoking),
        "campfireCooking" => Some(RecipeType::Campfire),
        "stonecutting" => Some(RecipeType::Stonecutting),
        "smithing" => Some(RecipeType::Smithing),
        _ => None,
    }
}

fn first_string_literal(s: &str) -> Option<String> {
    let re = Regex::new(r#"['"]([^'"]+)['"]"#).unwrap();
    re.captures(s).map(|c| c[1].to_string())
}

fn string_literals(s: &str) -> Vec<String> {
    let re = Regex::new(r#"['"]([^'"]+)['"]"#).unwrap();
    re.captures_iter(s).map(|c| c[1].to_string()).collect()
}

fn array_literals(s: &str) -> Vec<String> {
    string_literals(s)
}

fn object_key_map(body: &str) -> std::collections::HashMap<String, RecipeIngredient> {
    let mut map = std::collections::HashMap::new();
    let re = Regex::new(r#"(['"]?([A-Za-z0-9])['"]?\s*:\s*)(['"][^'"]+['"]|#\S+)"#).unwrap();
    for cap in re.captures_iter(body) {
        let letter = cap[2].to_string();
        let raw = cap[3].to_string();
        let clean = raw.trim_matches(['\'', '"']);
        if let Some(ing) = string_to_ingredient(clean) {
            map.insert(letter, ing);
        }
    }
    map
}

fn pattern_from_body(body: &str) -> Vec<String> {
    let re = Regex::new(r#"['"]([ A-Za-z0-9]+)['"]"#).unwrap();
    re.captures_iter(body)
        .filter_map(|c| {
            let s = c[1].to_string();
            // Pattern rows are pure letter/space strings of equal-ish length.
            if s.chars().all(|ch| ch.is_ascii_uppercase() || ch == ' ' || ch.is_ascii_lowercase() || ch.is_ascii_digit()) && s.len() >= 1 {
                Some(s)
            } else {
                None
            }
        })
        .collect()
}

fn string_to_ingredient(raw: &str) -> Option<RecipeIngredient> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(tag) = trimmed.strip_prefix('#') {
        return Some(RecipeIngredient {
            item: tag.to_string(),
            count: None,
            tag: Some(true),
            nbt: None,
        });
    }
    Some(RecipeIngredient {
        item: trimmed.to_string(),
        count: None,
        tag: Some(false),
        nbt: None,
    })
}

fn body_after_output(s: &str) -> Option<&str> {
    let re = Regex::new(r#"['"][^'"]+['"]\s*,\s*"#).unwrap();
    let m = re.find(s)?;
    Some(&s[m.end()..])
}

fn capture_number(s: &str, key: &str) -> Option<f32> {
    let re = Regex::new(&format!(r"\.{key}\s*\(\s*([0-9.]+)\s*\)")).unwrap();
    re.captures(s)
        .and_then(|c| c[1].parse::<f32>().ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::RecipeType;

    #[test]
    fn reads_shaped() {
        let script = r#"
ServerEvents.recipes(event => {
  event.shaped('minecraft:diamond_block', ['AAA','AAA','AAA'], { A: 'minecraft:diamond' })
})
"#;
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 1);
        assert_eq!(recipes[0].r#type, RecipeType::Shaped);
        assert_eq!(recipes[0].output.item, "minecraft:diamond_block");
        assert_eq!(recipes[0].key.as_ref().unwrap()["A"].item, "minecraft:diamond");
    }

    #[test]
    fn reads_smelting_with_flags() {
        let script = r#"event.smelting('minecraft:iron_ingot', 'minecraft:iron_ore').experience(0.7).cookingTime(200)"#;
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 1);
        assert_eq!(recipes[0].r#type, RecipeType::Smelting);
        assert_eq!(recipes[0].experience, Some(0.7));
        assert_eq!(recipes[0].cooking_time, Some(200));
    }

    #[test]
    fn ignores_non_recipe_code() {
        let script = "const x = 1; event.shaped('a:b', ['A'], { A: 'c:d' }); console.log('hi')";
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 1);
    }
}
