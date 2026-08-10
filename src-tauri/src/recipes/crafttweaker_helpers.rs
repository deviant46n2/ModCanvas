// Regex/literal helpers for the CraftTweaker reader: split ZenScript string and
// `<item:...>`/`<tag:items:...>` bracket literals, map them to ingredients, and
// recover shaped pattern/key entries. `pub(crate)` for crafttweaker.rs.

use crate::models::RecipeIngredient;
use regex::Regex;

pub(crate) fn zen_string_literals(s: &str) -> Vec<String> {
    let re = Regex::new(r#"<[^>]+>|'[^']+'|"[^"]+""#).unwrap();
    re.captures_iter(s).map(|c| c[0].to_string()).collect()
}

pub(crate) fn numeric_literals(s: &str) -> Vec<f32> {
    let re = Regex::new(r"([0-9]+(?:\.[0-9]+)?)").unwrap();
    re.captures_iter(s)
        .filter_map(|c| c[1].parse::<f32>().ok())
        .collect()
}

pub(crate) fn zen_to_id(lit: &str) -> Option<String> {
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

pub(crate) fn zen_to_ingredient(lit: &str) -> Option<RecipeIngredient> {
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

pub(crate) fn shaped_pattern_and_key(body: &str) -> (Vec<String>, std::collections::HashMap<String, RecipeIngredient>) {
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
