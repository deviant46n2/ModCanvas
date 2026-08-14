// curseforge_search.rs — CurseForge search endpoints. Split out of
// curseforge.rs (the 300-line tripwire) when the slug fallback landed (s33).
//
// The fallback exists because CF's fuzzy `searchFilter` can miss an exact-name
// mod entirely: "project e" returned only ProjectE addons while `slug=projecte`
// hits the real mod directly. The slug query is cheap and exact, so every
// search tries it and prepends a hit that the fuzzy pass missed.

use serde::Deserialize;

use crate::models::{ModMetadata, ModpackMetadata};

use super::types::*;
use super::ModIntelligence;

impl ModIntelligence {
    /// Search CurseForge mods by query (fuzzy filter + slug fallback).
    pub async fn search_curseforge(
        &self,
        query: &str,
        api_key: &str,
    ) -> anyhow::Result<Vec<ModMetadata>> {
        let mut results = self.search_curseforge_filter(query, api_key).await?;

        // Slug fallback: only when the fuzzy pass didn't already surface the
        // mod (slug == query normalized) — avoids a redundant call on good hits.
        let slug = normalize_slug(query);
        if !slug.is_empty() && !results.iter().any(|m| m.slug == slug) {
            if let Ok(slug_hits) = self.search_curseforge_by_slug(&slug, api_key).await {
                for hit in slug_hits {
                    // dedup_by in the caller only removes ADJACENT duplicates,
                    // so check the whole list before prepending (s33 lesson).
                    if !results.iter().any(|m| m.mod_id == hit.mod_id) {
                        results.insert(0, hit);
                    }
                }
            }
        }
        Ok(results)
    }

    /// Fuzzy search: CF relevance ranking over name/summary.
    async fn search_curseforge_filter(
        &self,
        query: &str,
        api_key: &str,
    ) -> anyhow::Result<Vec<ModMetadata>> {
        // gameId is required by the API; classId=6 scopes to mods (without it
        // the search returns modpacks and other project types).
        let url = format!(
            "{}/mods/search?gameId={}&classId=6&searchFilter={}",
            CURSEFORGE_API,
            CURSEFORGE_MINECRAFT_GAME_ID,
            urlencoding::encode(query)
        );
        let resp = self
            .client
            .get(&url)
            .header("x-api-key", api_key)
            .header("Accept", "application/json")
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("CurseForge API returned {}", resp.status());
        }

        #[derive(Deserialize)]
        struct SearchResponse {
            data: Vec<CurseForgeModInfo>,
        }

        let search_resp: SearchResponse = resp.json().await?;
        Ok(search_resp.data.into_iter().map(cf_mod_to_metadata).collect())
    }

    /// Exact slug lookup: returns at most one mod, the real ProjectE for "projecte".
    async fn search_curseforge_by_slug(
        &self,
        slug: &str,
        api_key: &str,
    ) -> anyhow::Result<Vec<ModMetadata>> {
        let url = format!(
            "{}/mods/search?gameId={}&classId=6&slug={}",
            CURSEFORGE_API,
            CURSEFORGE_MINECRAFT_GAME_ID,
            urlencoding::encode(slug)
        );
        let resp = self
            .client
            .get(&url)
            .header("x-api-key", api_key)
            .header("Accept", "application/json")
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("CurseForge API returned {}", resp.status());
        }

        #[derive(Deserialize)]
        struct SearchResponse {
            data: Vec<CurseForgeModInfo>,
        }

        let search_resp: SearchResponse = resp.json().await?;
        Ok(search_resp.data.into_iter().map(cf_mod_to_metadata).collect())
    }

    /// Search CurseForge modpacks by query
    pub async fn search_curseforge_modpacks(
        &self,
        query: &str,
        api_key: &str,
        mc_version: Option<&str>,
        loader: Option<&str>,
    ) -> anyhow::Result<Vec<ModpackMetadata>> {
        let mut url = format!(
            "{}/mods/search?gameId={}&classId=4471&searchFilter={}",
            CURSEFORGE_API,
            CURSEFORGE_MINECRAFT_GAME_ID,
            urlencoding::encode(query)
        );

        if let Some(version) = mc_version {
            url.push_str(&format!("&gameVersion={}", urlencoding::encode(version)));
        }

        if let Some(loader) = loader {
            url.push_str(&format!("&modLoaderType={}", urlencoding::encode(loader)));
        }

        let resp = self
            .client
            .get(&url)
            .header("x-api-key", api_key)
            .header("Accept", "application/json")
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("CurseForge API returned {}", resp.status());
        }

        #[derive(Deserialize)]
        struct SearchResponse {
            data: Vec<CurseForgeModInfo>,
        }

        let search_resp: SearchResponse = resp.json().await?;

        Ok(search_resp.data.into_iter().map(|info| {
            let author = info.authors.first().map(|a| a.name.clone()).unwrap_or_default();
            let categories: Vec<String> = info.categories.iter().map(|c| c.name.clone()).collect();
            ModpackMetadata {
                project_id: info.id.to_string(),
                slug: info.slug,
                name: info.name,
                description: info.summary.unwrap_or_default(),
                author,
                categories,
                downloads: info.downloadCount.unwrap_or(0),
                versions: info.gameVersions.clone(),
                project_type: "modpack".to_string(),
            }
        }).collect())
    }
}

/// "project e" / "ProjectE" / "project_e" -> "projecte". CF slugs are
/// lowercase alphanumeric (hyphens are part of the slug itself, not spaces).
/// One normalization rule for the slug fallback; the import resolution path
/// re-exports it (mod.rs) so both query shapes agree.
pub(crate) fn normalize_slug(query: &str) -> String {
    query
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn cf_mod_to_metadata(info: CurseForgeModInfo) -> ModMetadata {
    let author = info.authors.first().map(|a| a.name.clone()).unwrap_or_default();
    ModMetadata {
        mod_id: info.id.to_string(),
        slug: info.slug,
        name: info.name,
        description: info.summary.unwrap_or_default(),
        author,
        categories: info.categories.iter().map(|c| c.name.clone()).collect(),
        dependencies: vec![],
        supported_loaders: vec![],
        supported_versions: info.gameVersions.clone(),
        downloads: info.downloadCount.unwrap_or(0),
        source_url: info.links.as_ref().and_then(|l| l.websiteUrl.clone()),
        issues_url: info.links.as_ref().and_then(|l| l.issuesUrl.clone()),
        documentation_url: None,
        icon: info.logo.as_ref().and_then(|l| l.thumbnail_url.clone()),
        source: "curseforge".to_string(),
        mismatch: None,
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_slug;

    #[test]
    fn slug_normalizes_spaces_and_case() {
        assert_eq!(normalize_slug("project e"), "projecte");
        assert_eq!(normalize_slug("ProjectE"), "projecte");
        assert_eq!(normalize_slug("  Iron Chests "), "ironchests");
    }

    #[test]
    fn slug_drops_punctuation_keeps_alnum() {
        assert_eq!(normalize_slug("project_e!"), "projecte");
        assert_eq!(normalize_slug(""), "");
    }
}
