use crate::models::ModMetadata;

use super::types::*;
use super::ModIntelligence;

impl ModIntelligence {
    /// Get CurseForge mod metadata by project ID
    pub async fn get_curseforge_mod_metadata(
        &self,
        project_id: u64,
        api_key: &str,
    ) -> anyhow::Result<ModMetadata> {
        Self::fetch_curseforge_metadata_static(&self.client, project_id, api_key).await
    }

    /// Static variant of `get_curseforge_mod_metadata` usable from spawned
    /// batch tasks that only hold a `&Client`.
    ///
    /// The returned `mod_id` is the raw numeric CurseForge project id. Callers
    /// that need to match DB rows keyed as `curseforge:{id}` must re-prefix it.
    pub(crate) async fn fetch_curseforge_metadata_static(
        client: &reqwest::Client,
        project_id: u64,
        api_key: &str,
    ) -> anyhow::Result<ModMetadata> {
        let url = format!("{}/mods/{}", CURSEFORGE_API, project_id);
        let resp = client.get(&url)
            .header("x-api-key", api_key)
            .header("Accept", "application/json")
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("CurseForge API returned {}", resp.status());
        }

        let mod_resp: CurseForgeResponse = resp.json().await?;
        let info = mod_resp.data;

        let author = info.authors.first().map(|a| a.name.clone()).unwrap_or_default();

        Ok(ModMetadata {
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
            documentation_url: info.links.as_ref().and_then(|l| l.wiki_url.clone()),
            icon: info.logo.as_ref().and_then(|l| l.thumbnail_url.clone()),
            source: "curseforge".to_string(),
            mismatch: None,
        })
    }
}
