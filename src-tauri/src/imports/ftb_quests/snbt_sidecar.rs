use std::collections::HashMap;
use crate::imports::snbt::{SnbtValue, CommentedSnbt, parse_snbt};

/// Type alias for the raw-SNBT sidecar map returned by import.
/// Keys are `"chapter:{id}"` or `"quest:{id}"`; values are the original raw SNBT
/// strings.  Export re-parses these to recover comments and merge with updated
/// values.
pub type SnbtSidecar = HashMap<String, String>;

/// Store raw chapter SNBT into the sidecar map.
pub fn store_chapter(sidecar: &mut SnbtSidecar, chapter_id: &str, raw_snbt: &str) {
    sidecar.insert(format!("chapter:{chapter_id}"), raw_snbt.to_string());
}

/// Store raw standalone-quest SNBT into the sidecar map.
pub fn store_quest(sidecar: &mut SnbtSidecar, quest_id: &str, raw_snbt: &str) {
    sidecar.insert(format!("quest:{quest_id}"), raw_snbt.to_string());
}

/// Merge new quest SNBT values into a chapter's original `quests` list,
/// preserving comments on unchanged fields of individual quests.
///
/// Also merges chapter-level fields: if a key in `chapter_compound` matches
/// the original with an equal value, the original entry (with comments) is
/// kept.
///
/// Returns the updated chapter compound with merged quests, or `None` if
/// no sidecar data was found for this chapter.
pub fn merge_quests_in_chapter(
    sidecar: &SnbtSidecar,
    chapter_id: &str,
    chapter_compound: &HashMap<String, CommentedSnbt>,
    new_quests: &[SnbtValue],
) -> Option<HashMap<String, CommentedSnbt>> {
    let raw_chapter = sidecar.get(&format!("chapter:{chapter_id}"))?;

    // Parse the original chapter SNBT to recover comments
    let orig_chapter = parse_snbt(raw_chapter).ok()?;
    let orig_compound = match orig_chapter.value {
        SnbtValue::Compound(m) => m,
        _ => return None,
    };

    // Extract original quests list from the parsed chapter
    let orig_quests = match orig_compound.get("quests") {
        Some(entry) => match &entry.value {
            SnbtValue::List(items) => items.clone(),
            _ => return None,
        },
        _ => return None,
    };

    // Index original quests by ID for matching
    let mut orig_by_id: HashMap<String, &SnbtValue> = HashMap::new();
    for quest in &orig_quests {
        if let Some(id) = quest.get_str("id") {
            orig_by_id.insert(id.to_string(), quest);
        }
    }

    // Merge each new quest: preserve comments on unchanged fields
    let merged_quests: Vec<SnbtValue> = new_quests.iter().map(|new_q| {
        let new_id = new_q.get_str("id").map(|s| s.to_string());
        if let Some(id) = &new_id {
            if let Some(orig_q) = orig_by_id.get(id.as_str()) {
                return merge_compound_comments(orig_q, new_q);
            }
        }
        new_q.clone()
    }).collect();

    // Also merge chapter-level fields: walk the new compound and use original
    // entries (with comments) for keys whose values are unchanged.
    let mut result = HashMap::new();
    for (key, new_entry) in chapter_compound {
        if let Some(orig_entry) = orig_compound.get(key) {
            if values_equal(&orig_entry.value, &new_entry.value) {
                // Value unchanged → use original (preserves comments)
                result.insert(key.clone(), orig_entry.clone());
            } else {
                result.insert(key.clone(), new_entry.clone());
            }
        } else {
            result.insert(key.clone(), new_entry.clone());
        }
    }
    // Keys from original that aren't in the new compound are intentionally
    // skipped — the exporter only emits non-default values.

    result.insert("quests".to_string(), CommentedSnbt::new(SnbtValue::List(merged_quests)));
    Some(result)
}

/// Merge a new SNBT compound into an original, preserving comments on keys
/// whose values have not changed.
fn merge_compound_comments(orig: &SnbtValue, new: &SnbtValue) -> SnbtValue {
    let orig_map = match orig {
        SnbtValue::Compound(m) => m,
        _ => return new.clone(),
    };
    let new_map = match new {
        SnbtValue::Compound(m) => m,
        _ => return new.clone(),
    };

    let mut merged = HashMap::new();

    // Walk original keys — preserve comments on unchanged values
    for (key, orig_entry) in orig_map {
        if let Some(new_entry) = new_map.get(key) {
            if values_equal(&orig_entry.value, &new_entry.value) {
                merged.insert(key.clone(), orig_entry.clone());
            } else {
                merged.insert(key.clone(), CommentedSnbt::new(new_entry.value.clone()));
            }
        }
        // Key absent from new map → field was intentionally removed, don't preserve
    }

    // Add new keys not in original
    for (key, new_entry) in new_map {
        if !orig_map.contains_key(key) {
            merged.insert(key.clone(), new_entry.clone());
        }
    }

    SnbtValue::Compound(merged)
}

/// Deep equality check for `SnbtValue`. Returns true if values are semantically
/// equal (ignoring comments, number suffixes, formatting).
fn values_equal(a: &SnbtValue, b: &SnbtValue) -> bool {
    match (a, b) {
        (SnbtValue::Byte(a), SnbtValue::Byte(b)) => a == b,
        (SnbtValue::Short(a), SnbtValue::Short(b)) => a == b,
        (SnbtValue::Int(a), SnbtValue::Int(b)) => a == b,
        (SnbtValue::Long(a), SnbtValue::Long(b)) => a == b,
        (SnbtValue::Float(a), SnbtValue::Float(b)) => (a - b).abs() < f32::EPSILON,
        (SnbtValue::Double(a), SnbtValue::Double(b)) => (a - b).abs() < f64::EPSILON,
        (SnbtValue::String(a), SnbtValue::String(b)) => a == b,
        (SnbtValue::ByteArray(a), SnbtValue::ByteArray(b)) => a == b,
        (SnbtValue::IntArray(a), SnbtValue::IntArray(b)) => a == b,
        (SnbtValue::LongArray(a), SnbtValue::LongArray(b)) => a == b,
        (SnbtValue::List(a), SnbtValue::List(b)) => {
            a.len() == b.len() && a.iter().zip(b.iter()).all(|(a, b)| values_equal(a, b))
        }
        (SnbtValue::Compound(a), SnbtValue::Compound(b)) => {
            a.len() == b.len() && a.iter().all(|(k, av)| {
                b.get(k).map_or(false, |bv| values_equal(&av.value, &bv.value))
            })
        }
        // Allow numeric cross-type comparison (Byte(1) == Int(1) etc.)
        (SnbtValue::Byte(a), b) => values_equal(&SnbtValue::Int(*a as i32), b),
        (a, SnbtValue::Byte(b)) => values_equal(a, &SnbtValue::Int(*b as i32)),
        (SnbtValue::Short(a), b) => values_equal(&SnbtValue::Int(*a as i32), b),
        (a, SnbtValue::Short(b)) => values_equal(a, &SnbtValue::Int(*b as i32)),
        (SnbtValue::Long(a), b) => values_equal(&SnbtValue::Int(*a as i32), b),
        (a, SnbtValue::Long(b)) => values_equal(a, &SnbtValue::Int(*b as i32)),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::imports::snbt::{SnbtValue, CommentedSnbt, compound_to_snbt};

    #[test]
    fn store_and_lookup() {
        let mut sidecar = SnbtSidecar::new();
        store_chapter(&mut sidecar, "ch1", "{id: \"ch1\"}");
        assert_eq!(sidecar.get("chapter:ch1").unwrap(), "{id: \"ch1\"}");
        assert!(!sidecar.contains_key("chapter:ch2"));
    }

    #[test]
    fn merge_preserves_comments_on_unchanged_fields() {
        // The parser's `collect_trailing_comment()` grabs the first Comment token
        // after a value as that field's trailing comment.  A comment between two
        // fields is trailing on the *preceding* field, not leading on the next.
        //
        // In this input:
        //   `/* a */` becomes leading comment on `x`
        //   `/* b */` becomes trailing comment on `x` (consumed after x's value)
        //   `y` has no comments.
        //
        // To test: x unchanged → both comments survive. y changed → no comment.

        let raw = r#"{
  /* a */
  x: 100.0d
  /* b */
  y: 200.0d
  quests: []
}"#;
        let mut chapter = HashMap::new();
        chapter.insert("x".to_string(), CommentedSnbt::new(SnbtValue::Double(100.0)));
        chapter.insert("y".to_string(), CommentedSnbt::new(SnbtValue::Double(999.0))); // changed

        let new_quests: Vec<SnbtValue> = vec![];

        let mut sidecar = SnbtSidecar::new();
        store_chapter(&mut sidecar, "merge_test_ch", raw);

        let merged = merge_quests_in_chapter(&sidecar, "merge_test_ch", &chapter, &new_quests).unwrap();
        let s = compound_to_snbt(&merged);

        // x unchanged → original entry preserved (includes leading "/* a */" and trailing "/* b */")
        assert!(s.contains("/* a */"), "x leading comment preserved");
        assert!(s.contains("/* b */"), "x trailing comment preserved");
        // y changed → original entry not used, no comments on y
        assert!(!s.contains("200.0d"), "y uses new value");
        assert!(s.contains("999.0d"), "y uses new value");
    }

    #[test]
    fn values_equal_cross_type() {
        assert!(values_equal(&SnbtValue::Byte(1), &SnbtValue::Int(1)));
        assert!(values_equal(&SnbtValue::Long(42), &SnbtValue::Int(42)));
        assert!(!values_equal(&SnbtValue::Int(1), &SnbtValue::Int(2)));
    }
}
