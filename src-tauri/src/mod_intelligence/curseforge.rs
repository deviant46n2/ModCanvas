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

    /// Resolve the newest downloadable file for a CurseForge project matching
    /// the given Minecraft version + loader, returning its file id.
    ///
    /// CurseForge files are listed newest-first; we skip early-access and
    /// unavailable files and prefer one whose `gameVersions` contains the
    /// target MC version (falling back to the newest file overall).
    pub async fn resolve_curseforge_file(
        &self,
        project_id: u64,
        api_key: &str,
        mc_version: &str,
        loader: &str,
    ) -> anyhow::Result<u64> {
        let mut url = format!("{}/mods/{}/files", CURSEFORGE_API, project_id);
        let params: Vec<String> = std::iter::empty()
            .chain(if mc_version.is_empty() {
                None
            } else {
                Some(format!("gameVersion={}", urlencoding::encode(mc_version)))
            })
            .chain(match loader {
                "NeoForge" => Some("modLoaderType=6".to_string()),
                "Fabric" => Some("modLoaderType=4".to_string()),
                "Quilt" => Some("modLoaderType=5".to_string()),
                _ => Some("modLoaderType=1".to_string()), // Forge
            })
            .chain(Some("pageSize=50".to_string()))
            .collect();
        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        let resp = self.client.get(&url)
            .header("x-api-key", api_key)
            .header("Accept", "application/json")
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("CurseForge API returned {} for project files", resp.status());
        }

        let list: CurseForgeFileListResponse = resp.json().await?;
        let eligible: Vec<&CurseForgeFileInfo> = list.data.iter()
            .filter(|f| f.isEarlyAccess != Some(true))
            .filter(|f| f.isAvailable != Some(false))
            .collect();

        // Prefer a file that explicitly lists the target MC version, then fall
        // back to the newest eligible file (API returns newest-first).
        if let Some(f) = eligible.iter().find(|f| !mc_version.is_empty() && f.gameVersions.iter().any(|v| v == mc_version)) {
            return Ok(f.id);
        }
        eligible.first()
            .map(|f| f.id)
            .ok_or_else(|| anyhow::anyhow!("No downloadable files for CurseForge project {}", project_id))
    }

    /// Download the best-matching CurseForge file for a project into `dest`.
    /// Combines `resolve_curseforge_file` + `download_curseforge_mod`.
    pub async fn download_curseforge_mod_for_version(
        &self,
        project_id: u64,
        api_key: &str,
        mc_version: &str,
        loader: &str,
        dest_path: &Path,
    ) -> anyhow::Result<String> {
        let file_id = self.resolve_curseforge_file(project_id, api_key, mc_version, loader).await?;
        self.download_curseforge_mod(project_id, file_id, api_key, dest_path).await
    }
    
    /// Search CurseForge mods by query
    pub async fn search_curseforge(
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
