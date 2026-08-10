// Best-effort reader for recipes declared in KubeJS `ServerEvents.recipes`
// blocks. This is intentionally tolerant: it scans for `event.<type>(...)`
// calls and recovers output + inputs, never failing on exotic DSL. Unparseable
// lines are skipped silently so a pack with hand-written helpers still loads.


use crate::models::{Recipe, RecipeOutput, RecipeType};
use crate::recipes::base_recipe;
use crate::recipes::scan::{line_of, line_starts, OpaqueRegions};
use crate::recipes::{LineSpan, ParsedRecipe};
use regex::Regex;
use super::kubejs_helpers::{
    array_literals, body_after_output, capture_number, first_string_literal, object_key_map,
    pattern_from_body, string_literals, string_to_ingredient,
};

/// Parse a KubeJS script body, returning every recipe call we can recover with
/// its 1-based line span. Calls inside `//` / `/* */` comments or string
/// literals are skipped, so commented-out calls no longer re-surface as active
/// recipes. `file` is a label for provenance/debug.
pub fn parse_kubejs_scripts(content: &str) -> Vec<ParsedRecipe> {
    let mut recipes = Vec::new();
    let call_re = Regex::new(r"event\.(shaped|shapeless|smelting|blasting|smoking|campfireCooking|stonecutting|smithing)\s*\(").unwrap();
    let opaque = OpaqueRegions::scan(content, &[('\'', '\''), ('"', '"'), ('`', '`')]);
    let starts = line_starts(content);
    // Split into `event.<fn>( ... )` chunks by scanning balanced parens.
    let mut pos = 0;
    while let Some(m) = call_re.find_at(content, pos) {
        // A match inside a comment or string literal is not a real call.
        if opaque.overlaps(m.start(), m.end()) {
            let Some(next) = opaque.advance_past(m.start()) else { break };
            pos = next;
            continue;
        }
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
            recipes.push(ParsedRecipe {
                recipe,
                lines: Some(LineSpan {
                    start: line_of(&starts, m.start()),
                    end: line_of(&starts, end.saturating_sub(1)),
                }),
            });
        }
        pos = end;
    }
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
        assert_eq!(recipes[0].recipe.r#type, RecipeType::Shaped);
        assert_eq!(recipes[0].recipe.output.item, "minecraft:diamond_block");
        assert_eq!(recipes[0].recipe.key.as_ref().unwrap()["A"].item, "minecraft:diamond");
        assert_eq!(recipes[0].lines.unwrap().start, 3);
        assert_eq!(recipes[0].lines.unwrap().end, 3);
    }

    #[test]
    fn reads_smelting_with_flags() {
        let script = r#"event.smelting('minecraft:iron_ingot', 'minecraft:iron_ore').experience(0.7).cookingTime(200)"#;
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 1);
        assert_eq!(recipes[0].recipe.r#type, RecipeType::Smelting);
        assert_eq!(recipes[0].recipe.experience, Some(0.7));
        assert_eq!(recipes[0].recipe.cooking_time, Some(200));
    }

    #[test]
    fn ignores_non_recipe_code() {
        let script = "const x = 1; event.shaped('a:b', ['A'], { A: 'c:d' }); console.log('hi')";
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 1);
    }

    #[test]
    fn skips_commented_out_calls() {
        let script = r#"
ServerEvents.recipes(event => {
  // event.shaped('minecraft:oak_planks', ['A'], { A: 'minecraft:oak_log' })
  event.shapeless('minecraft:stick', ['minecraft:oak_planks', 'minecraft:oak_planks'])
})
"#;
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 1);
        assert_eq!(recipes[0].recipe.r#type, RecipeType::Shapeless);
    }

    #[test]
    fn skips_block_commented_calls() {
        let script = r#"
/* event.smelting('minecraft:iron_ingot', 'minecraft:iron_ore')
   event.blasting('minecraft:iron_ingot', 'minecraft:iron_ore') */
event.smoking('minecraft:cooked_chicken', 'minecraft:chicken')
"#;
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 1);
        assert_eq!(recipes[0].recipe.r#type, RecipeType::Smoking);
    }

    #[test]
    fn string_literals_containing_event_are_untouched() {
        let script = r#"
const tooltip = "event.shaped('fake:out', ['A'], { A: 'fake:in' }) // not a call";
event.shaped('minecraft:real', ['A'], { A: 'minecraft:diamond' })
"#;
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 1);
        assert_eq!(recipes[0].recipe.output.item, "minecraft:real");
    }

    #[test]
    fn spans_cover_multiline_chained_calls() {
        let script = "event.shaped(\n  'minecraft:diamond_block',\n  ['AAA'],\n  { A: 'minecraft:diamond' }\n).experience(0.0)";
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 1);
        let span = recipes[0].lines.unwrap();
        assert_eq!(span.start, 1);
        assert_eq!(span.end, 5);
    }

    #[test]
    fn span_covers_multiple_calls_on_one_line() {
        let script = "event.shapeless('a:b', ['c:d']); event.smelting('e:f', 'g:h')";
        let recipes = parse_kubejs_scripts(script);
        assert_eq!(recipes.len(), 2);
        assert_eq!(recipes[0].lines.unwrap(), LineSpan { start: 1, end: 1 });
        assert_eq!(recipes[1].lines.unwrap(), LineSpan { start: 1, end: 1 });
    }
}
