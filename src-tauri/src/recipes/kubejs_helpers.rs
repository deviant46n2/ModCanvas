// Regex/string-literal helpers for the KubeJS recipe reader: recover output
// ids, pattern rows, key maps, and numeric flags from an `event.*(...)` call
// body. Pure functions; `pub(crate)` because the parser in kubejs.rs uses them.

use crate::models::RecipeIngredient;
use regex::Regex;

pub(crate) fn first_string_literal(s: &str) -> Option<String> {
    let re = Regex::new(r#"['"]([^'"]+)['"]"#).unwrap();
    re.captures(s).map(|c| c[1].to_string())
}

pub(crate) fn string_literals(s: &str) -> Vec<String> {
    let re = Regex::new(r#"['"]([^'"]+)['"]"#).unwrap();
    re.captures_iter(s).map(|c| c[1].to_string()).collect()
}

pub(crate) fn array_literals(s: &str) -> Vec<String> {
    string_literals(s)
}

pub(crate) fn object_key_map(body: &str) -> std::collections::HashMap<String, RecipeIngredient> {
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

pub(crate) fn pattern_from_body(body: &str) -> Vec<String> {
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

pub(crate) fn string_to_ingredient(raw: &str) -> Option<RecipeIngredient> {
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

pub(crate) fn body_after_output(s: &str) -> Option<&str> {
    let re = Regex::new(r#"['"][^'"]+['"]\s*,\s*"#).unwrap();
    let m = re.find(s)?;
    Some(&s[m.end()..])
}

pub(crate) fn capture_number(s: &str, key: &str) -> Option<f32> {
    let re = Regex::new(&format!(r"\.{key}\s*\(\s*([0-9.]+)\s*\)")).unwrap();
    re.captures(s)
        .and_then(|c| c[1].parse::<f32>().ok())
}
