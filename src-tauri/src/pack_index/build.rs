// Pack Index assembly (I/O layer — the hands room). Builds the derived index
// from the existing scans: item registry, recipe scan, quest graph, tag index.
// Pure inversion lives in `invert.rs`; this module owns WHERE the inputs come
// from, never the reference logic itself (3-layer rule).
//
// MVP scope (s44): items + recipes (output + ingredients) + quests (rewards).
// Tags wired in (s67): the tag index (`instance_textures/tags.rs`) has its own
// scan lifecycle + memo — resolve_item_tags expands each tag to member items,
// and the members feed the same dead-reference audit as recipes/quests.

use crate::pack_index::models::PackIndex;
use crate::pack_index::invert::{audit_references, quest_item_references, recipe_item_references, tag_item_references};

use crate::indexer::scan_instance_items;
use crate::instance_textures::{list_item_tags_cmd, resolve_item_tags_cmd};
use crate::recipes::scan_pack_recipes;
use crate::quest_cache;

/// Build the Pack Index for a project. `project_path` is the instance game
/// dir; `project_id` selects the saved quest graph. Deterministic: same
/// instance + same graph → same index.
pub fn build_pack_index(
    project_id: &str,
    project_path: &std::path::Path,
    kubejs_namespace: &str,
) -> PackIndex {    // 1. Item registry — the reference universe. Every reference resolves
    //    against this set; anything absent is a named dead finding.
    let items = scan_instance_items(project_path, kubejs_namespace)
        .map(|entries| entries.into_iter().map(|e| e.id).collect::<Vec<_>>())
        .unwrap_or_default();
    let item_registry: std::collections::HashSet<String> = items.iter().cloned().collect();

    // 2. Recipes: output item + every ingredient item. Shaped recipes carry
    // ingredients in `key` (letter → ingredient); shapeless/smelt in
    // `ingredients`. Read both so shaped-recipe ingredients are indexed.
    let recipes = scan_pack_recipes(project_path);
    let recipe_ids: Vec<String> = recipes.iter().map(|d| d.id.clone()).collect();
    let recipe_refs = recipe_item_references(recipes.iter().map(|d| {
        let mut ids = vec![d.recipe.output.item.clone()];
        if let Some(ing) = &d.recipe.ingredients {
            ids.extend(ing.iter().map(|i| i.item.clone()));
        }
        if let Some(key) = &d.recipe.key {
            ids.extend(key.values().map(|i| i.item.clone()));
        }
        (d.id.as_str(), ids)
    }));

    // 3. Quests: every reward item across the graph.
    let graph_path = crate::path_safety::quest_graph_path(project_path.to_string_lossy().as_ref()).ok();
    let graph = graph_path
        .and_then(|p| quest_cache::load(project_id, &p).ok())
        .and_then(|g| if g.nodes.is_empty() { None } else { Some(g) });
    let (quest_ids, quest_refs) = match graph {
        Some(g) => {
            let ids: Vec<String> = g.nodes.iter().map(|n| n.id.clone()).collect();
            let refs = quest_item_references(g.nodes.iter().map(|n| {
                // Reward item ids live in EITHER `items` (multi) or `item_id`
                // (single) — real FTB quest data uses `item_id` with an empty
                // `items` array (probe-verified on Monster, s44). Read both so
                // the index never silently misses a reward reference.
                let items: Vec<String> = n
                    .rewards
                    .iter()
                    .flat_map(|r| {
                        let mut ids: Vec<String> = r.items.clone();
                        if !r.item_id.is_empty() {
                            ids.push(r.item_id.clone());
                        }
                        ids
                    })
                    .collect();
                (n.id.as_str(), items)
            }));
            (ids, refs)
        }
        None => (Vec::new(), Vec::new()),
    };

    let mut index = PackIndex {
        items,
        recipe_ids,
        quest_ids,
        references: recipe_refs
            .into_iter()
            .chain(quest_refs)
            .collect(),
        ..Default::default()
    };

    // 3.5 Tags: every tag in the instance, expanded to member items. Tag ids
    // are canonicalized to the `#ns:path` form (§8.3.1) so tag→item references
    // resolve through the same audit as recipes/quests.
    let project_path_str = project_path.to_string_lossy().to_string();
    let tag_infos = list_item_tags_cmd(project_path_str.clone()).unwrap_or_default();
    let tag_ids: Vec<String> = tag_infos.iter().map(|t| t.id.clone()).collect();
    let tag_members = resolve_item_tags_cmd(project_path_str, tag_ids).unwrap_or_default();
    index.tags = tag_members.keys().map(|t| format!("#{}", t)).collect();
    let tag_refs = tag_item_references(tag_members.iter().map(|(tag, members)| {
        (tag.as_str(), members.iter().map(|m| m.as_str()))
    }));
    index.references.extend(tag_refs);

    // 4. Dead-reference audit — every reference resolves or is named.
    audit_references(&mut index, &item_registry);

    index
}
