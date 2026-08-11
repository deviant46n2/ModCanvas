// Pack Index assembly (I/O layer — the hands room). Builds the derived index
// from the existing scans: item registry, recipe scan, quest graph. Pure
// inversion lives in `invert.rs`; this module owns WHERE the inputs come
// from, never the reference logic itself (3-layer rule).
//
// MVP scope (s44): items + recipes (output + ingredients) + quests (rewards).
// Tags are PARKED with a written reason: tag expansion needs the tag index
// (`instance_textures/tags.rs`), which has a separate scan lifecycle from the
// recipe/quest path — wiring it in is a deliberate follow-up, not a stub.

use crate::pack_index::models::PackIndex;
use crate::pack_index::invert::{audit_references, quest_item_references, recipe_item_references};

use crate::indexer::scan_instance_items;
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

    // 2. Recipes: output item + every ingredient item.
    let recipes = scan_pack_recipes(project_path);
    let recipe_ids: Vec<String> = recipes.iter().map(|d| d.id.clone()).collect();
    let recipe_refs = recipe_item_references(recipes.iter().map(|d| {
        let mut ids = vec![d.recipe.output.item.clone()];
        if let Some(ing) = &d.recipe.ingredients {
            ids.extend(ing.iter().map(|i| i.item.clone()));
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

    // 4. Dead-reference audit — every reference resolves or is named.
    audit_references(&mut index, &item_registry);

    index
}
