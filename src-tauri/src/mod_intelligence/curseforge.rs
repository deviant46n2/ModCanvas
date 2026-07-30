use std::path::Path;

use serde::Deserialize;

use crate::models::{ModMetadata, ModpackMetadata};

use super::types::*;
use super::ModIntelligence;

impl ModIntelligence {
    /// Download a CurseForge mod by projectID and fileID
    pub async fn download_curseforge_mod(
        &self,
        project_id: u64,
        file_id: u64,
        api_key: &str,
        dest_path: &Path,
    ) -> anyhow::Result<String> {
        // First, try to get the file info from the API
        let url = format!("{}/mods/{}/files/{}", CURSEFORGE_API, project_id, file_id);
        let resp = self.client.get(&url)
            .header("x-api-key", api_key)
            .header("Accept", "application/json")
            .send()
            .await?;

        if resp.status().is_success() {
            let file_resp: CurseForgeFileResponse = resp.json().await?;
            let file_info = file_resp.data;

            if let Some(download_url) = &file_info.downloadUrl {
                return self.download_file(download_url, dest_path).await;
            }
        }

        // Fallback: construct CDN URL from projectID and fileID
        // CurseForge CDN URL pattern: https://mediafilez.forgecdn.net/files/{prefix}/{remainder}/{filename}
        let prefix = file_id / 1000;
        let remainder = file_id % 1000;
        // We don't know the filename without API, so just try with a placeholder
        let cdn_url = format!("{}/{}/{}/mod-{}.jar", CURSEFORGE_CDN, prefix, remainder, file_id);

        // Try the CDN URL
        if let Ok(path) = self.download_file(&cdn_url, dest_path).await {
            return Ok(path);
        }

        anyhow::bail!("Failed to download CurseForge mod {}:{} - API key may be required", project_id, file_id)
    }

    /// Get CurseForge mod metadata by project ID
    pub async fn get_curseforge_mod_metadata(
        &self,
        project_id: u64,
        api_key: &str,
    ) -> anyhow::Result<ModMetadata> {
        let url = format!("{}/mods/{}", CURSEFORGE_API, project_id);
        let resp = self.client.get(&url)
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
            categories: vec![],
            dependencies: vec![],
            supported_loaders: vec![],
            supported_versions: vec![],
            downloads: info.downloadCount.unwrap_or(0),
            source_url: info.links.as_ref().and_then(|l| l.websiteUrl.clone()),
            issues_url: info.links.as_ref().and_then(|l| l.issuesUrl.clone()),
            documentation_url: info.links.as_ref().and_then(|l| l.wiki_url.clone()),
        })
    }
    
    /// Search CurseForge mods by query
    pub async fn search_curseforge(
        &self,
        query: &str,
        api_key: &str,
    ) -> anyhow::Result<Vec<ModMetadata>> {
        let url = format!("{}/mods/search?searchFilter={}", CURSEFORGE_API, urlencoding::encode(query));
        let resp = self.client.get(&url)
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
            ModMetadata {
                mod_id: info.id.to_string(),
                slug: info.slug,
                name: info.name,
                description: info.summary.unwrap_or_default(),
                author,
                categories: vec![],
                dependencies: vec![],
                supported_loaders: vec![],
                supported_versions: vec![],
                downloads: info.downloadCount.unwrap_or(0),
                source_url: info.links.as_ref().and_then(|l| l.websiteUrl.clone()),
                issues_url: info.links.as_ref().and_then(|l| l.issuesUrl.clone()),
                documentation_url: None,
            }
        }).collect())
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
            "{}/mods/search?classId=4471&searchFilter={}",
            CURSEFORGE_API,
            urlencoding::encode(query)
        );
        
        if let Some(version) = mc_version {
            url.push_str(&format!("&gameVersion={}", urlencoding::encode(version)));
        }
        
        if let Some(loader) = loader {
            url.push_str(&format!("&modLoaderType={}", urlencoding::encode(loader)));
        }

        let resp = self.client.get(&url)
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
