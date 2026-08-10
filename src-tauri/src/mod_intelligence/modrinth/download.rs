//! Modrinth mod file download: direct version fetch first, then fall back to
//! the latest version matching the requested loader + MC version.

use std::path::Path;

use crate::mod_intelligence::types::*;
use crate::mod_intelligence::ModIntelligence;

impl ModIntelligence {
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
}
