// search_merge.rs — cross-source result merging for the mods search tab.
// Split from search.rs when the exact-match lift landed (s33, 300-line trip).
//
// The merge has three jobs, in order:
//   1. Version-mismatched rows sink to the bottom (a stable sort, so each
//      registry's own relevance order survives — the old mod_id sort destroyed
//      it: 'matching results not at top' was that line, not the registries).
//   2. Dedup by mod_id (adjacent after the sort).
//   3. Exact-match lift: a result whose slug equals the normalized query is
//      the single best answer, so it rises above loose matches from ANY
//      registry — the CF slug fallback (curseforge_search.rs) can only put
//      ProjectE at the top of the CF block; this puts it at the top of the
//      merged list, above Modrinth's fuzzy noise.

use crate::models::ModMetadata;
use crate::mod_intelligence::normalize_slug;

/// Sort + dedup + lift. `query` drives the exact-match lift (normalized the
/// same way as the CF slug fallback).
pub fn merge_search_results(mut results: Vec<ModMetadata>, query: &str) -> Vec<ModMetadata> {
    results.sort_by_key(|m| m.mismatch.is_some());
    results.dedup_by(|a, b| a.mod_id == b.mod_id);

    let slug = normalize_slug(query);
    if !slug.is_empty() {
        if let Some(pos) = results.iter().position(|m| m.slug == slug) {
            let exact = results.remove(pos);
            results.insert(0, exact);
        }
    }
    results
}

#[cfg(test)]
mod tests {
    use super::merge_search_results;
    use crate::models::ModMetadata;

    fn meta(mod_id: &str, slug: &str, mismatch: Option<&str>) -> ModMetadata {
        ModMetadata {
            mod_id: mod_id.to_string(),
            slug: slug.to_string(),
            name: slug.to_string(),
            description: String::new(),
            author: String::new(),
            categories: vec![],
            dependencies: vec![],
            supported_loaders: vec![],
            supported_versions: vec![],
            downloads: 0,
            source_url: None,
            issues_url: None,
            documentation_url: None,
            icon: None,
            source: String::new(),
            mismatch: mismatch.map(|s| s.to_string()),
        }
    }

    #[test]
    fn exact_match_rises_above_fuzzy_noise() {
        let results = vec![
            meta("a", "skyblock-advancements", None),
            meta("b", "project-expansion", None),
            meta("c", "projecte", None), // the exact slug hit, deep in the list
        ];
        let merged = merge_search_results(results, "project e");
        assert_eq!(merged[0].slug, "projecte");
        assert_eq!(merged.len(), 3);
    }

    #[test]
    fn stable_sort_preserves_registry_relevance_order() {
        // No mismatch anywhere: order must be exactly the arrival order.
        let results = vec![
            meta("m1", "create", None),
            meta("m2", "jei", None),
            meta("c1", "projecte", None),
        ];
        let merged = merge_search_results(results, "");
        assert_eq!(merged.iter().map(|m| m.mod_id.as_str()).collect::<Vec<_>>(),
                   vec!["m1", "m2", "c1"]);
    }

    #[test]
    fn mismatched_rows_sink_but_keep_relative_order() {
        let results = vec![
            meta("m1", "create", None),
            meta("m2", "badmod", Some("Version: requires 1.20")),
            meta("m3", "jei", None),
            meta("m4", "another-bad", Some("Version: requires 1.19")),
        ];
        let merged = merge_search_results(results, "");
        let ids: Vec<&str> = merged.iter().map(|m| m.mod_id.as_str()).collect();
        assert_eq!(ids, vec!["m1", "m3", "m2", "m4"]);
    }

    #[test]
    fn dedup_by_mod_id_keeps_first_occurrence() {
        let results = vec![
            meta("dup1", "create", None),
            meta("dup1", "create", None), // same mod_id, adjacent after sort
        ];
        let merged = merge_search_results(results, "");
        assert_eq!(merged.len(), 1);
    }
}
