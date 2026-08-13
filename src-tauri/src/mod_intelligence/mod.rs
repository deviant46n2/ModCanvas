use std::path::Path;

use reqwest::Client;

use types::MODCANVAS_USER_AGENT;

mod types;
mod modrinth;
mod curseforge;
mod curseforge_search;

pub use modrinth::search_modrinth;
pub(crate) use curseforge_search::normalize_slug;
pub use types::{CurseForgeResponse, CurseForgeModInfo, CurseForgeCategory, CurseForgeAuthor, CurseForgeLinks, CurseForgeFileResponse, CurseForgeFileInfo};

pub struct ModIntelligence {
    pub(crate) client: Client,
}

impl ModIntelligence {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub(crate) async fn download_file(&self, url: &str, dest_dir: &Path) -> anyhow::Result<String> {
        let resp = self.client.get(url)
            .header("User-Agent", MODCANVAS_USER_AGENT)
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("Failed to download {}: HTTP {}", url, resp.status());
        }

        // Capture the FINAL url (after redirects) before consuming the body:
        // the Modrinth counted-download endpoint (`/version/{id}/download`)
        // redirects to the CDN, so the request URL ends in "download" while
        // the final URL carries the real file name. Direct CDN urls
        // (CurseForge downloadUrl) don't redirect, so final == original.
        let final_url = resp.url().clone();
        let bytes = resp.bytes().await?;

        let url_path = final_url.as_str().split('?').next().unwrap_or(final_url.as_str());
        let raw_filename = url_path.rsplit('/').next()
            .filter(|s| !s.is_empty())
            .unwrap_or("mod.jar");
        let filename = sanitize_filename(raw_filename);
        let file_path = dest_dir.join(filename);
        crate::path_safety::atomic_write(&file_path, &bytes)
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        eprintln!("[ModCanvas] Downloaded {} ({} bytes) to {}", url, bytes.len(), file_path.display());

        Ok(file_path.to_string_lossy().to_string())
    }

    /// Try each URL in order, first success wins. The counted-download
    /// endpoint is preferred for author attribution, but if it fails (s49:
    /// Modrinth removed `/version/{id}/download` from their spec and it 404s
    /// for every id) we fall back to the version's CDN file URL, which still
    /// works. All URLs failing is a real error — never silently empty.
    pub(crate) async fn download_file_first_working(
        &self,
        urls: &[&str],
        dest_dir: &Path,
    ) -> anyhow::Result<String> {
        let mut last_err: Option<anyhow::Error> = None;
        for url in urls {
            match self.download_file(url, dest_dir).await {
                Ok(path) => return Ok(path),
                Err(e) => last_err = Some(e),
            }
        }
        Err(last_err.unwrap_or_else(|| anyhow::anyhow!("no download URLs provided")))
    }
}

/// Keep only safe filename characters and reject anything that could traverse
/// the filesystem (`..`, `/`, `\`, NUL). Falls back to `mod.jar`.
pub(crate) fn sanitize_filename(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '.' | '_' | '-' | '(' | ')') { c } else { '_' })
        .collect();
    if cleaned.is_empty() || cleaned == "." || cleaned == ".." || cleaned.contains("..") {
        return "mod.jar".to_string();
    }
    cleaned
}

#[cfg(test)]
mod tests {
    use super::sanitize_filename;

    #[test]
    fn keeps_normal_jar_filename() {
        assert_eq!(sanitize_filename("jei-1.21.1-19.21.0.247.jar"), "jei-1.21.1-19.21.0.247.jar");
    }

    #[test]
    fn strips_path_traversal_and_separators() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "mod.jar");
        assert_eq!(sanitize_filename("../evil.jar"), "mod.jar");
        assert_eq!(sanitize_filename("a/b.jar"), "a_b.jar");
    }

    #[test]
    fn handles_empty_and_dots() {
        assert_eq!(sanitize_filename(""), "mod.jar");
        assert_eq!(sanitize_filename("."), "mod.jar");
        assert_eq!(sanitize_filename(".."), "mod.jar");
    }

    #[test]
    fn allows_parentheses_like_modrinth_filenames() {
        assert_eq!(sanitize_filename("Xaero's Minimap (1.21.1).jar"), "Xaero_s_Minimap_(1.21.1).jar");
    }
}

impl Default for ModIntelligence {
    fn default() -> Self {
        Self::new()
    }
}

pub fn check_compatibility(mods: &[crate::models::ModEntry]) -> crate::models::CompatibilityResult {
    let mut issues = Vec::new();
    let mut warnings = Vec::new();

    let _mod_ids: Vec<&str> = mods.iter().map(|m| m.mod_id.as_str()).collect();

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
                    install: None,
                });
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
