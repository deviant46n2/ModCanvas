//! Modrinth API client: search, metadata, download, and compatibility checks.
//!
//! The client logic is split across the [`search`], [`metadata`],
//! [`download`], and [`compat`] submodules (each under 300 lines). This module
//! file keeps the shared [`search_url`] helper, the submodule declarations,
//! and the re-export that keeps `modrinth::search_modrinth` resolving for
//! external callers (`mod_intelligence::search_modrinth` re-exports it).

mod compat;
mod download;
mod metadata;
mod search;

pub use search::search_modrinth;

/// Build the Modrinth v2 search URL. The param is `query=` — NOT `q=` —
/// Modrinth silently ignores unknown params, so `q=` returned the unfiltered
/// popularity ranking regardless of what was typed (29b92c6: 'refined
/// storage' never surfaced). Locked by tests; used by every search path so
/// the param can never drift per call site.
fn search_url(mc_api: &str, encoded_query: &str, encoded_facets: &str) -> String {
    format!("{mc_api}/search?query={encoded_query}&facets={encoded_facets}&limit=20")
}

/// Build the Modrinth v2 version-list URL for one project, filtered by loader
/// and MC version. The filters are JSON arrays Modrinth parses from the
/// `loaders=` / `game_versions=` params, so the JSON MUST be percent-encoded
/// before it goes into the URL (s49: raw `["neoforge"]` made `url` encode
/// only the quotes and leave the brackets, and Modrinth returned 404 for
/// every version fetch — downloads and dependency resolution silently broke).
/// Same discipline as the search facets; shared so no call site can drift.
fn version_url(mc_api: &str, project_id: &str, loader: &str, mc_version: &str) -> String {
    let loaders_json = format!("[\"{loader}\"]");
    let versions_json = format!("[\"{mc_version}\"]");
    let loaders = urlencoding::encode(&loaders_json).into_owned();
    let versions = urlencoding::encode(&versions_json).into_owned();
    format!(
        "{mc_api}/project/{project_id}/version?loaders={loaders}&game_versions={versions}"
    )
}

#[cfg(test)]
mod tests {
    use super::search_url;
    use super::version_url;

    #[test]
    fn search_url_uses_query_param_not_q() {
        // The 29b92c6 regression: `q=` was silently ignored by Modrinth's v2
        // API. The URL must carry `query=`.
        let url = search_url(
            "https://api.modrinth.com/v2",
            "refined%20storage",
            "%5B%5D",
        );
        assert_eq!(
            url,
            "https://api.modrinth.com/v2/search?query=refined%20storage&facets=%5B%5D&limit=20"
        );
        assert!(!url.contains("q="), "q= is not a Modrinth v2 search param");
    }

    #[test]
    fn version_url_percent_encodes_the_json_filters() {
        // s49 regression lock: raw `["neoforge"]` in the query made `url`
        // encode only the quotes, leaving raw brackets Modrinth rejects with
        // 404 — every version fetch (downloads, dependency resolution) broke.
        // The JSON arrays must be fully percent-encoded like search facets.
        let url = version_url(
            "https://api.modrinth.com/v2",
            "kubejs",
            "neoforge",
            "1.21.1",
        );
        assert_eq!(
            url,
            "https://api.modrinth.com/v2/project/kubejs/version?loaders=%5B%22neoforge%22%5D&game_versions=%5B%221.21.1%22%5D"
        );
        assert!(
            !url.contains('[') && !url.contains(']') && !url.contains('"'),
            "no raw brackets or quotes in the query: {url}"
        );
    }
}
