//! Modrinth mod file download: direct version fetch first, then fall back to
//! the latest version matching the requested loader + MC version.
//!
//! Downloads go through the **counted endpoint** (`/version/{id}/download`),
//! which redirects to the CDN and increments the author's download counter.
//! Fetching the raw CDN `file.url` from version metadata bypasses the count —
//! authors get no credit for the download (s48 attribution fix).

use std::path::Path;

use crate::mod_intelligence::types::*;
use crate::mod_intelligence::ModIntelligence;

use super::version_url;

/// The counted-download endpoint for a Modrinth version: redirects to the
/// CDN and increments the author's counter. Direct CDN url fetches bypass it.
pub(crate) fn modrinth_download_url(version_id: &str) -> String {
    format!("{}/version/{}/download", MODRINTH_API, version_id)
}

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
                    .header("User-Agent", MODCANVAS_USER_AGENT)
                    .send()
                    .await?;
                if resp.status().is_success() {
                    if let Ok(ver) = resp.json::<ModrinthVersion>().await {
                        return self.download_file(&modrinth_download_url(&ver.id), dest_path).await;
                    }
                }
            }
        }

        // Fall back to fetching the latest version for this loader + MC version
        let url = version_url(MODRINTH_API, mod_id, loader_str, mc_version);
        let resp = self.client.get(&url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("Modrinth API returned {} for project {}", resp.status(), mod_id);
        }

        let versions: Vec<ModrinthVersion> = resp.json().await?;
        let ver = versions.first()
            .ok_or_else(|| anyhow::anyhow!("No versions found for {} with loader {} MC {}", mod_id, loader_str, mc_version))?;

        self.download_file(&modrinth_download_url(&ver.id), dest_path).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counted_download_url_is_the_endpoint_not_the_cdn() {
        assert_eq!(
            modrinth_download_url("abc123"),
            "https://api.modrinth.com/v2/version/abc123/download",
            "downloads must route through the counting endpoint, never the CDN file.url"
        );
    }

    #[test]
    fn user_agent_is_real_and_contactable() {
        assert!(MODCANVAS_USER_AGENT.starts_with("ModCanvas/"), "names the app: {MODCANVAS_USER_AGENT}");
        assert!(
            MODCANVAS_USER_AGENT.contains("https://github.com/deviant46n2/ModCanvas"),
            "carries a real contact: {MODCANVAS_USER_AGENT}"
        );
        assert!(
            !MODCANVAS_USER_AGENT.contains("contact@example.com") && !MODCANVAS_USER_AGENT.contains("MMM/"),
            "the prototype placeholder UA is gone: {MODCANVAS_USER_AGENT}"
        );
    }
}
