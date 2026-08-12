//! Modrinth search: build the v2 search URL and run the flat and
//! category-faceted query paths. Both share the locked-down [`search_url`]
//! helper so the `query=` param can never drift per call site.

use reqwest::Client;

use crate::models::{ModLoader, ModMetadata};

use super::search_url;
use crate::mod_intelligence::types::*;
use crate::mod_intelligence::ModIntelligence;

pub async fn search_modrinth(query: &str, loader: &ModLoader, mc_version: &str) -> Result<Vec<ModMetadata>, String> {
    let client = Client::new();

    let loader_str = match loader {
        ModLoader::Forge => "forge",
        ModLoader::NeoForge => "neoforge",
        ModLoader::Fabric => "fabric",
        ModLoader::Quilt => "quilt",
        ModLoader::Vanilla => "vanilla",
    };

    let facets = format!(
        r#"[["project_type:mod"],["categories:{}"],["versions:{}"]]"#,
        loader_str, mc_version
    );

    let url = search_url(MODRINTH_API, &urlencoding::encode(query), &urlencoding::encode(&facets));

    let resp = client
        .get(&url)
        .header("User-Agent", MODCANVAS_USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let data: ModrinthSearchResult = resp
        .json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))?;

    Ok(data
        .hits
        .into_iter()
        .map(|hit| hit.into())
        .collect())
}

impl ModIntelligence {
    pub async fn search_modrinth(&self, query: &str, loader: ModLoader, mc_version: &str, categories: &[String]) -> anyhow::Result<Vec<ModMetadata>> {
        let loader_str = match loader {
            ModLoader::Fabric => "fabric",
            ModLoader::Quilt => "quilt",
            ModLoader::Forge => "forge",
            ModLoader::NeoForge => "neoforge",
            ModLoader::Vanilla => "vanilla",
        };
        
        // Facets: loader and MC version are AND-ed with the query; each
        // category is its own sub-array (Modrinth ORs across sub-arrays), so
        // passing ["magic", "technology"] means magic OR technology — the
        // same mechanism the loader facet already uses.
        let mut facet_parts = vec![
            format!(r#"["project_type:mod"]"#),
            format!(r#"["categories:{}"]"#, loader_str),
            format!(r#"["versions:{}"]"#, mc_version),
        ];
        for c in categories {
            facet_parts.push(format!(r#"["categories:{}"]"#, c));
        }
        let facets = format!("[{}]", facet_parts.join(","));

        let url = search_url(MODRINTH_API, &urlencoding::encode(query), &urlencoding::encode(&facets));
        
        let resp = self.client.get(&url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;
        let result: ModrinthSearchResult = resp.json().await?;
        
        Ok(result.hits.into_iter().map(|h| h.into()).collect())
    }
}
