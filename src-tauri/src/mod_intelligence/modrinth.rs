use reqwest::Client;

use crate::models::{ModLoader, ModMetadata, ModpackMetadata};

use super::types::*;

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

    let url = format!(
        "{}/search?query={}&facets={}&limit=20",
        MODRINTH_API,
        urlencoding::encode(query),
        urlencoding::encode(&facets)
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "MMM/0.1.0")
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

pub async fn search_modpacks(query: &str, mc_version: &str, loader: &str, sort: &str) -> Result<Vec<ModpackMetadata>, String> {
    let client = Client::new();

    // Build facets - only add version filter if provided
    let mut facet_parts = vec![r#"["project_type:modpack"]"#.to_string()];
    
    if !mc_version.is_empty() {
        facet_parts.push(format!(r#"["versions:{mc_version}"]"#));
    }
    
    // Note: Modrinth search API doesn't support loader filter in facets
    // Results include all loaders - backend handles loader compatibility during download
    // We can filter by categories if they contain explicit loader hints
    
    let facets = format!("[{}]", facet_parts.join(","));

    // Build sort parameter
    let sort_param = match sort {
        "downloads" => "downloads",
        "updated" => "updated",
        "newest" => "new",
        _ => "relevance",
    };

    let url = format!(
        "{}/search?query={}&facets={}&limit=50&index={}",
        MODRINTH_API,
        urlencoding::encode(query),
        urlencoding::encode(&facets),
        sort_param
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "MMM/0.1.0")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let data: ModrinthSearchResult = resp
        .json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))?;

    let mut results: Vec<ModpackMetadata> = data
        .hits
        .into_iter()
        .map(|hit| ModpackMetadata {
            project_id: hit.slug.clone(),
            slug: hit.slug,
            name: hit.title,
            description: hit.description,
            author: hit.author,
            categories: hit.categories.unwrap_or_default(),
            downloads: hit.downloads,
            versions: hit.versions,
            project_type: "modpack".to_string(),
        })
        .collect();

    // Filter by loader if specified
    // Modrinth search doesn't return loader info, so we check if categories contain loader hints
    // or skip filter since most modpacks support multiple loaders anyway
    if loader != "all" {
        let loader_lower = loader.to_lowercase();
        // Filter out packs that explicitly DON'T support this loader
        // by checking if they have loader-specific categories that exclude ours
        results.retain(|pack| {
            // If pack has explicit loader categories, check them
            let has_loader_categories = pack.categories.iter().any(|c| {
                let c_lower = c.to_lowercase();
                c_lower == "fabric" || c_lower == "forge" || c_lower == "neoforge" || c_lower == "quilt"
            });
            
            if has_loader_categories {
                // Pack has explicit loader info - check if it matches
                pack.categories.iter().any(|c| {
                    let c_lower = c.to_lowercase();
                    match loader_lower.as_str() {
                        "fabric" => c_lower.contains("fabric"),
                        "forge" => c_lower.contains("forge"),
                        "neoforge" => c_lower.contains("neoforge") || c_lower.contains("neo"),
                        "quilt" => c_lower.contains("quilt"),
                        _ => true
                    }
                })
            } else {
                // No explicit loader info - keep it (most modpacks support multiple loaders)
                true
            }
        });
    }

    // Sort client-side for downloads/updated if needed (API handles relevance/newest)
    match sort {
        "downloads" => results.sort_by(|a, b| b.downloads.cmp(&a.downloads)),
        "updated" | "newest" => {
            // Modrinth doesn't expose updated date in search results easily
            // Could sort by versions (assuming newer versions = newer)
            let empty = String::new();
            results.sort_by(|a, b| {
                let a_latest = a.versions.last().unwrap_or(&empty);
                let b_latest = b.versions.last().unwrap_or(&empty);
                b_latest.cmp(a_latest)
            });
        }
        _ => {} // relevance - keep API order
    }

    Ok(results)
}

use std::path::Path;

use super::ModIntelligence;

impl ModIntelligence {
    pub async fn get_mod_metadata(&self, mod_id: &str) -> anyhow::Result<Option<ModMetadata>> {
        let url = format!("{}/project/{}", MODRINTH_API, mod_id);
        let resp = self.client.get(&url)
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
            .send()
            .await?;
        if resp.status() == 404 {
            return Ok(None);
        }
        let project: ModrinthProject = resp.json().await?;
        Ok(Some(project.into()))
    }
    
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
        
        let url = format!(
            "{}/search?query={}&facets={}&limit=20",
            MODRINTH_API,
            urlencoding::encode(query),
            urlencoding::encode(&facets)
        );
        
        let resp = self.client.get(&url)
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
            .send()
            .await?;
        let result: ModrinthSearchResult = resp.json().await?;
        
        Ok(result.hits.into_iter().map(|h| h.into()).collect())
    }

    pub async fn download_mod(
        &self,
        mod_id: &str,
        version: Option<&str>,
        loader: &str,
        mc_version: &str,
        dest_path: &Path,
    ) -> anyhow::Result<String> {
        let loader_str = match loader {
            "Fabric" => "fabric",
            "Quilt" => "quilt",
            "Forge" => "forge",
            "NeoForge" => "neoforge",
            _ => "fabric",
        };

        // If a specific version is given, try to fetch it directly
        if let Some(v) = version {
            if !v.is_empty() {
                let url = format!("{}/project/{}/version/{}", MODRINTH_API, mod_id, v);
                let resp = self.client.get(&url)
                    .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
                    .send()
                    .await?;
                if resp.status().is_success() {
                    if let Ok(ver) = resp.json::<ModrinthVersion>().await {
                        if let Some(file) = ver.files.iter().find(|f| f.primary).or(ver.files.first()) {
                            return self.download_file(&file.url, dest_path).await;
                        }
                    }
                }
            }
        }

        // Fall back to fetching latest version for this loader + MC version
        let url = format!(
            "{}/project/{}/version?loaders=[\"{}\"]&game_versions=[\"{}\"]",
            MODRINTH_API, mod_id, loader_str, mc_version
        );
        eprintln!("[ModCanvas] download_mod version-list URL: {url}");
        let resp = self.client.get(&url)
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
            .send()
            .await?;
        eprintln!("[ModCanvas] download_mod version-list status: {}", resp.status());

        if !resp.status().is_success() {
            anyhow::bail!("Modrinth API returned {} for project {}", resp.status(), mod_id);
        }

        let versions: Vec<ModrinthVersion> = resp.json().await?;
        let ver = versions.first()
            .ok_or_else(|| anyhow::anyhow!("No versions found for {} with loader {} MC {}", mod_id, loader_str, mc_version))?;

        let file = ver.files.iter().find(|f| f.primary).or(ver.files.first())
            .ok_or_else(|| anyhow::anyhow!("No files in version {} for {}", ver.id, mod_id))?;

        self.download_file(&file.url, dest_path).await
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
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("Modrinth API returned {} for project {}", resp.status(), mod_id);
        }

        let project: ModrinthProject = resp.json().await?;
        let mut metadata: ModMetadata = project.into();

        let versions_url = format!(
            "{}/project/{}/version?loaders=[\"{}\"]&game_versions=[\"{}\"]",
            MODRINTH_API, mod_id, loader_str, mc_version
        );
        let versions_resp = self.client.get(&versions_url)
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
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
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("Modrinth API returned {} for project {}", resp.status(), mod_id);
        }

        let project: ModrinthProject = resp.json().await?;
        let mut metadata: ModMetadata = project.into();

        let versions_url = format!(
            "{}/project/{}/version?loaders=[\"{}\"]&game_versions=[\"{}\"]",
            MODRINTH_API, mod_id, loader_str, mc_version
        );
        let versions_resp = client.get(&versions_url)
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
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
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
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
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
            .send()
            .await?;
        if !resp.status().is_success() {
            anyhow::bail!("Modrinth API returned {}", resp.status());
        }
        let project = resp.json::<ModrinthProject>().await?;
        let meta: ModMetadata = project.into();
        Ok(meta)
    }

    pub async fn check_compatibility_async(
        &self,
        mods: &[crate::models::ModEntry],
        loader: &str,
        mc_version: &str,
        curseforge_api_key: Option<&str>,
    ) -> crate::models::CompatibilityResult {
        use crate::models::DependencyType;
        let mut issues = Vec::new();
        let mut warnings = Vec::new();

        let mod_ids: Vec<String> = mods.iter().map(|m| m.mod_id.clone()).collect();
        eprintln!("[ModCanvas] check_compatibility_async: {} mods, loader={}, mc={}", mod_ids.len(), loader, mc_version);
        let metadata_list = self.batch_get_metadata(&mod_ids, loader, mc_version, curseforge_api_key).await;
        eprintln!("[ModCanvas] Got metadata for {}/{} mods", metadata_list.len(), mod_ids.len());
        for m in &metadata_list {
            eprintln!("[ModCanvas]   {} (id={}, deps={})", m.name, m.mod_id, m.dependencies.len());
        }

        let mut mod_ids_set = std::collections::HashSet::new();
        for m in mods.iter() {
            mod_ids_set.insert(m.mod_id.clone());
        }

        let mut metadata_map = std::collections::HashMap::new();
        for meta in &metadata_list {
            metadata_map.insert(meta.mod_id.clone(), meta.clone());
        }

        let mut missing_dep_ids = std::collections::HashSet::new();
        for meta in &metadata_list {
            for dep in &meta.dependencies {
                if dep.mod_id == meta.mod_id {
                    continue;
                }
                if !mod_ids_set.contains(&dep.mod_id) && !metadata_map.contains_key(&dep.mod_id) {
                    missing_dep_ids.insert(dep.mod_id.clone());
                }
            }
        }

        if !missing_dep_ids.is_empty() {
            let missing_ids: Vec<String> = missing_dep_ids.into_iter().collect();
            eprintln!("[ModCanvas] Fetching metadata for {} missing dep IDs: {:?}", missing_ids.len(), missing_ids);
            let missing_metadata = self.batch_get_metadata(&missing_ids, loader, mc_version, curseforge_api_key).await;
            for (i, meta) in missing_metadata.iter().enumerate() {
                eprintln!("[ModCanvas] Resolved dep: '{}' (slug={}, id={})", meta.name, meta.slug, missing_ids.get(i).unwrap_or(&String::new()));
                metadata_map.insert(meta.slug.clone(), meta.clone());
                metadata_map.insert(missing_ids[i].clone(), meta.clone());
            }
        }

        eprintln!("[ModCanvas] metadata_map has {} entries", metadata_map.len());

        for (i, a) in mods.iter().enumerate() {
            for b in mods.iter().skip(i + 1) {
                if a.name.to_lowercase() == b.name.to_lowercase() && a.mod_id != b.mod_id {
                    issues.push(crate::models::CompatibilityIssue {
                        severity: crate::models::IssueSeverity::Warning,
                        message: format!(
                            "Possible duplicate: '{}' and '{}' may be the same mod",
                            a.name, b.name
                        ),
                        affected_mods: vec![a.mod_id.clone(), b.mod_id.clone()],
                        affected_mod_names: vec![a.name.clone(), b.name.clone()],
                    });
                }
            }
        }

        for meta in &metadata_list {
            for dep in &meta.dependencies {
                if dep.mod_id == meta.mod_id {
                    continue;
                }
                let dep_name = metadata_map.get(&dep.mod_id)
                    .map(|m| m.name.as_str())
                    .unwrap_or(&dep.mod_id);
                match dep.dependency_type {
                    DependencyType::Required => {
                        if !mod_ids_set.contains(&dep.mod_id) {
                            let dep_name_resolved = metadata_map.get(&dep.mod_id)
                                .map(|m| m.name.clone())
                                .unwrap_or(dep.mod_id.clone());
                            issues.push(crate::models::CompatibilityIssue {
                                severity: crate::models::IssueSeverity::Warning,
                                message: format!(
                                    "'{}' requires '{}' which is not in the project",
                                    meta.name, dep_name
                                ),
                                affected_mods: vec![meta.mod_id.clone(), dep.mod_id.clone()],
                                affected_mod_names: vec![meta.name.clone(), dep_name_resolved],
                            });
                        }
                    }
                    DependencyType::Incompatible => {
                        if mod_ids_set.contains(&dep.mod_id) {
                            let dep_name_resolved = metadata_map.get(&dep.mod_id)
                                .map(|m| m.name.clone())
                                .unwrap_or(dep.mod_id.clone());
                            issues.push(crate::models::CompatibilityIssue {
                                severity: crate::models::IssueSeverity::Error,
                                message: format!(
                                    "'{}' is incompatible with '{}'",
                                    meta.name, dep_name
                                ),
                                affected_mods: vec![meta.mod_id.clone(), dep.mod_id.clone()],
                                affected_mod_names: vec![meta.name.clone(), dep_name_resolved],
                            });
                        }
                    }
                    _ => {}
                }
            }

            if !meta.supported_loaders.is_empty() {
                let loader_enum = match loader {
                    "Fabric" => ModLoader::Fabric,
                    "Quilt" => ModLoader::Quilt,
                    "NeoForge" => ModLoader::NeoForge,
                    "Forge" => ModLoader::Forge,
                    _ => ModLoader::Fabric,
                };
                if !meta.supported_loaders.contains(&loader_enum) {
                    warnings.push(format!(
                        "'{}' may not support {} loader",
                        meta.name, loader
                    ));
                }
            }
        }

        if mods.len() > 150 {
            warnings.push(format!(
                "Pack has {} mods. Large packs may have performance issues.",
                mods.len()
            ));
        }

        crate::models::CompatibilityResult {
            compatible: issues.is_empty(),
            issues,
            warnings,
        }
    }
}
