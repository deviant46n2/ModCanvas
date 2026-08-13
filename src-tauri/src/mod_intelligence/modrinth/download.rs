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
                        return self
                            .download_first_working(&ver, dest_path)
                            .await;
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

        self.download_first_working(ver, dest_path).await
    }

    /// Download one resolved version: the counted endpoint first (author
    /// attribution), then the version's primary CDN file URL. s49: Modrinth
    /// removed `/version/{id}/download` from its OpenAPI spec and it now 404s
    /// for every id — downloads must fall back to the CDN file, which still
    /// serves. Attribution is best-effort, never a hard dependency.
    async fn download_first_working(
        &self,
        ver: &ModrinthVersion,
        dest_path: &Path,
    ) -> anyhow::Result<String> {
        let urls = download_url_order(ver);
        let refs: Vec<&str> = urls.iter().map(|u| u.as_str()).collect();
        self.download_file_first_working(&refs, dest_path).await
    }
}

/// The download URL order for one resolved version: the counted endpoint
/// FIRST (author attribution when it works), then the primary CDN file URL as
/// the fallback (s49: Modrinth removed the counted endpoint from its spec and
/// it 404s for every id). Kept pure so the fallback ordering is testable.
fn download_url_order(ver: &ModrinthVersion) -> Vec<String> {
    let mut urls = vec![modrinth_download_url(&ver.id)];
    if let Some(file) = ver.files.iter().find(|f| f.primary).or_else(|| ver.files.first()) {
        urls.push(file.url.clone());
    }
    urls
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counted_download_url_is_the_endpoint_not_the_cdn() {
        assert_eq!(
            modrinth_download_url("abc123"),
            "https://api.modrinth.com/v2/version/abc123/download",
            "downloads must route through the counting endpoint when it works"
        );
    }

    #[test]
    fn download_urls_prefer_counted_then_cdn_fallback() {
        // s49: the counted endpoint 404s for every id (removed from Modrinth's
        // OpenAPI spec), so the primary CDN file URL must be the fallback —
        // same order, every time, so attribution is best-effort not fatal.
        let ver = ModrinthVersion {
            id: "Tbomhybz".to_string(),
            name: "test".to_string(),
            version_number: "1.0.0".to_string(),
            loaders: None,
            game_versions: None,
            dependencies: None,
            files: vec![
                ModrinthVersionFile {
                    url: "https://cdn.modrinth.com/data/x/versions/Tbomhybz/jei.jar".to_string(),
                    _filename: "jei.jar".to_string(),
                    primary: true,
                },
                ModrinthVersionFile {
                    url: "https://cdn.modrinth.com/data/x/versions/Tbomhybz/alt.jar".to_string(),
                    _filename: "alt.jar".to_string(),
                    primary: false,
                },
            ],
        };
        let urls = download_url_order(&ver);
        assert_eq!(
            urls,
            vec![
                "https://api.modrinth.com/v2/version/Tbomhybz/download",
                "https://cdn.modrinth.com/data/x/versions/Tbomhybz/jei.jar",
            ],
            "counted first, primary CDN file second"
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
