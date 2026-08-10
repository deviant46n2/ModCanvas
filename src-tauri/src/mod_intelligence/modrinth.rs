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

#[cfg(test)]
mod tests {
    use super::search_url;

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
}
