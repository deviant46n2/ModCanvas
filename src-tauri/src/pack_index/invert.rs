// Pure inversion + dead-reference detection for the Pack Index (the thinking
// room). `invert` builds back-references from flat source item lists; `audit`
// resolves every reference against the item registry and reports dead ones
// as named findings — the "never silently miss" rule at index scale (§8.3.1).

use crate::pack_index::models::{ItemReference, PackIndex, ReferenceFinding};

/// Build `recipe → item` references from (recipe_id, item_ids) pairs.
pub fn recipe_item_references<'a>(
    pairs: impl IntoIterator<Item = (&'a str, impl IntoIterator<Item = impl AsRef<str>>)>,
) -> Vec<ItemReference> {
    let mut out = Vec::new();
    for (recipe_id, items) in pairs {
        for item in items {
            out.push(ItemReference {
                source_kind: "recipe".into(),
                source_id: recipe_id.to_string(),
                item_id: item.as_ref().to_string(),
            });
        }
    }
    out
}

/// Build `quest → item` references from (node_id, item_ids) pairs.
pub fn quest_item_references<'a>(
    pairs: impl IntoIterator<Item = (&'a str, impl IntoIterator<Item = impl AsRef<str>>)>,
) -> Vec<ItemReference> {
    let mut out = Vec::new();
    for (node_id, items) in pairs {
        for item in items {
            out.push(ItemReference {
                source_kind: "quest".into(),
                source_id: node_id.to_string(),
                item_id: item.as_ref().to_string(),
            });
        }
    }
    out
}

/// Build `tag → item` references from (tag_id, member_item_ids) pairs.
pub fn tag_item_references<'a>(
    pairs: impl IntoIterator<Item = (&'a str, impl IntoIterator<Item = impl AsRef<str>>)>,
) -> Vec<ItemReference> {
    let mut out = Vec::new();
    for (tag_id, items) in pairs {
        for item in items {
            out.push(ItemReference {
                source_kind: "tag".into(),
                source_id: tag_id.to_string(),
                item_id: item.as_ref().to_string(),
            });
        }
    }
    out
}

/// Resolve every reference against the item registry. A reference whose item
/// id is absent becomes a dead finding — never dropped silently.
pub fn audit_references(
    index: &mut PackIndex,
    item_registry: &std::collections::HashSet<String>,
) {
    let mut dead = Vec::new();
    for r in &index.references {
        let resolved = item_registry.contains(&r.item_id);
        dead.push(ReferenceFinding {
            source_kind: r.source_kind.clone(),
            source_id: r.source_id.clone(),
            referenced_id: r.item_id.clone(),
            resolved,
        });
    }
    index.dead_references = dead;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recipe_item_refs_are_inverted() {
        let refs = recipe_item_references([
            ("minecraft:crafting_table", vec!["minecraft:oak_planks", "minecraft:oak_planks"]),
            ("minecraft:diamond_block", vec!["minecraft:diamond"]),
        ]);
        assert_eq!(refs.len(), 3); // duplicates kept — a recipe lists the item twice
        assert_eq!(refs[0].source_kind, "recipe");
        assert_eq!(refs[0].source_id, "minecraft:crafting_table");
        assert_eq!(refs[0].item_id, "minecraft:oak_planks");
    }

    #[test]
    fn quest_item_refs_are_inverted() {
        let refs = quest_item_references([
            ("node-1", vec!["minecraft:iron_ingot", "minecraft:diamond"]),
            ("node-2", vec!["minecraft:diamond"]),
        ]);
        assert_eq!(refs.len(), 3);
        assert_eq!(refs[1].item_id, "minecraft:diamond");
        assert_eq!(refs[2].source_id, "node-2");
    }

    #[test]
    fn tag_refs_keep_hash_prefix() {
        let refs = tag_item_references([("#minecraft:logs", vec!["minecraft:oak_log"])]);
        assert_eq!(refs[0].source_id, "#minecraft:logs");
        assert_eq!(refs[0].source_kind, "tag");
    }

    #[test]
    fn audit_reports_dead_references_named() {
        let mut index = PackIndex {
            references: vec![
                ItemReference { source_kind: "recipe".into(), source_id: "a:b".into(), item_id: "minecraft:diamond".into() },
                ItemReference { source_kind: "quest".into(), source_id: "n1".into(), item_id: "missing:item".into() },
            ],
            ..Default::default()
        };
        let registry: std::collections::HashSet<String> =
            ["minecraft:diamond".into()].into_iter().collect();
        audit_references(&mut index, &registry);
        assert_eq!(index.dead_references.len(), 2);
        assert!(index.dead_references[0].resolved);
        assert!(!index.dead_references[1].resolved);
        assert_eq!(index.dead_references[1].referenced_id, "missing:item");
    }
}
