//! Modrinth metadata fetch: single/batch project metadata with dependency
//! resolution, plus the id-form dispatch (`curseforge:` prefix vs plain
//! Modrinth slugs) used by the batch path.

use reqwest::Client;

use crate::models::ModMetadata;

use crate::mod_intelligence::types::*;
use crate::mod_intelligence::ModIntelligence;

use super::version_url;

impl ModIntelligence {
    pub async fn get_mod_metadata(&self, mod_id: &str) -> anyhow::Result<Option<ModMetadata>> {
        let url = format!("{}/project/{}", MODRINTH_API, mod_id);
        let resp = self.client.get(&url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;
        if resp.status() == 404 {
            return Ok(None);
        }
        let project: ModrinthProject = resp.json().await?;
        Ok(Some(project.into()))
    }

    pub async fn get_mod_metadata_with_deps(
        &self,
        mod_id: &str,
        loader: &str,
        mc_version: &str,
    ) -> anyhow::Result<ModMetadata> {
        let loader_str = match loader {
            "Fabric" => "fabric",
            "Quilt" => "quilt",
            "Forge" => "forge",
            "NeoForge" => "neoforge",
            _ => "fabric",
        };

        let url = format!("{}/project/{}", MODRINTH_API, mod_id);
        let resp = self.client.get(&url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("Modrinth API returned {} for project {}", resp.status(), mod_id);
        }

        let project: ModrinthProject = resp.json().await?;
        let mut metadata: ModMetadata = project.into();

        let versions_url = version_url(MODRINTH_API, mod_id, loader_str, mc_version);
        let versions_resp = self.client.get(&versions_url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;

        if versions_resp.status().is_success() {
            if let Ok(versions) = versions_resp.json::<Vec<ModrinthVersion>>().await {
                if let Some(ver) = versions.first() {
                    if let Some(deps) = &ver.dependencies {
                        metadata.dependencies = deps.iter()
                            .filter_map(|d| d.to_model())
                            .collect();
                    }
                }
            }
        }

        Ok(metadata)
    }

    /// Fetch one mod's metadata, dispatching on the id form: `curseforge:{id}`
    /// goes to the CurseForge API (needs a key), everything else to Modrinth.
    /// CurseForge results are re-keyed to the `curseforge:{id}` form so the
    /// frontend's `mod_id` map lookup matches the DB row.
    async fn fetch_metadata_any(
        client: &Client,
        mod_id: &str,
        loader: &str,
        mc_version: &str,
        curseforge_api_key: Option<&str>,
    ) -> anyhow::Result<ModMetadata> {
        if let Some(cf_id) = mod_id.strip_prefix("curseforge:") {
            let project_id = cf_id
                .parse::<u64>()
                .map_err(|_| anyhow::anyhow!("invalid CurseForge project id: {cf_id}"))?;
            let key = curseforge_api_key
                .ok_or_else(|| anyhow::anyhow!("no CurseForge API key for {mod_id}"))?;
            let mut meta = Self::fetch_curseforge_metadata_static(client, project_id, key).await?;
            meta.mod_id = mod_id.to_string();
            Ok(meta)
        } else {
            Self::fetch_metadata_with_deps_static(client, mod_id, loader, mc_version).await
        }
    }

    pub async fn batch_get_metadata(
        &self,
        mod_ids: &[String],
        loader: &str,
        mc_version: &str,
        curseforge_api_key: Option<&str>,
    ) -> Vec<ModMetadata> {
        use std::sync::Arc;
        use tokio::sync::Semaphore;

        let concurrency_limit = 8;
        let semaphore = Arc::new(Semaphore::new(concurrency_limit));
        let client = self.client.clone();
        let loader = loader.to_string();
        let mc_version = mc_version.to_string();
        let cf_api_key = curseforge_api_key.map(|s| s.to_string());

        let handles: Vec<_> = mod_ids.iter().map(|mod_id| {
            let sem = semaphore.clone();
            let client = client.clone();
            let loader = loader.clone();
            let mc_version = mc_version.clone();
            let cf_api_key = cf_api_key.clone();
            let mod_id = mod_id.clone();

            tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                let result = Self::fetch_metadata_any(
                    &client,
                    &mod_id,
                    &loader,
                    &mc_version,
                    cf_api_key.as_deref(),
                )
                .await;
                match result {
                    Ok(meta) => Some(meta),
                    Err(e) => {
                        eprintln!("[ModCanvas] Failed to fetch metadata for {}: {}", mod_id, e);
                        Self::fetch_project_basic_static(&client, &mod_id).await.ok().map(|p| p.into())
                    }
                }
            })
        }).collect();

        let mut results = Vec::with_capacity(mod_ids.len());
        for handle in handles {
            if let Ok(Some(meta)) = handle.await {
                results.push(meta);
            }
        }
        results
    }

    pub(crate) async fn fetch_metadata_with_deps_static(
        client: &Client,
        mod_id: &str,
        loader: &str,
        mc_version: &str,
    ) -> anyhow::Result<ModMetadata> {
        let loader_str = match loader {
            "Fabric" => "fabric",
            "Quilt" => "quilt",
            "Forge" => "forge",
            "NeoForge" => "neoforge",
            _ => "fabric",
        };

        let url = format!("{}/project/{}", MODRINTH_API, mod_id);
        let resp = client.get(&url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("Modrinth API returned {} for project {}", resp.status(), mod_id);
        }

        let project: ModrinthProject = resp.json().await?;
        let mut metadata: ModMetadata = project.into();

        let versions_url = version_url(MODRINTH_API, mod_id, loader_str, mc_version);
        let versions_resp = client.get(&versions_url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;

        if versions_resp.status().is_success() {
            if let Ok(versions) = versions_resp.json::<Vec<ModrinthVersion>>().await {
                if let Some(ver) = versions.first() {
                    if let Some(deps) = &ver.dependencies {
                        metadata.dependencies = deps.iter()
                            .filter_map(|d| d.to_model())
                            .collect();
                    }
                }
            }
        }

        Ok(metadata)
    }

    pub(crate) async fn fetch_project_basic_static(client: &Client, mod_id: &str) -> anyhow::Result<ModMetadata> {
        let url = format!("{}/project/{}", MODRINTH_API, mod_id);
        let resp = client.get(&url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;
        if !resp.status().is_success() {
            anyhow::bail!("Modrinth API returned {}", resp.status());
        }
        let project = resp.json::<ModrinthProject>().await?;
        let meta: ModMetadata = project.into();
        Ok(meta)
    }

    pub async fn fetch_project_basic(&self, mod_id: &str) -> anyhow::Result<ModMetadata> {
        let url = format!("{}/project/{}", MODRINTH_API, mod_id);
        let resp = self.client.get(&url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;
        if !resp.status().is_success() {
            anyhow::bail!("Modrinth API returned {}", resp.status());
        }
        let project = resp.json::<ModrinthProject>().await?;
        let meta: ModMetadata = project.into();
        Ok(meta)
    }
}
