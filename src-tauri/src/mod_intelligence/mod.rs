use std::path::Path;

use reqwest::Client;

mod types;
mod modrinth;
mod curseforge;

pub use modrinth::{search_modrinth, search_modpacks};
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
            .header("User-Agent", "MMM/0.1.0 (contact@example.com)")
            .send()
            .await?;

        if !resp.status().is_success() {
            anyhow::bail!("Failed to download {}: HTTP {}", url, resp.status());
        }

        let bytes = resp.bytes().await?;

        // Extract filename from URL path
        let url_path = url.split('?').next().unwrap_or(url);
        let filename = url_path.rsplit('/').next()
            .filter(|s| !s.is_empty())
            .unwrap_or("mod.jar");

        let file_path = dest_dir.join(filename);
        crate::path_safety::atomic_write(&file_path, &bytes)
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        eprintln!("[ModCanvas] Downloaded {} ({} bytes) to {}", url, bytes.len(), file_path.display());

        Ok(file_path.to_string_lossy().to_string())
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
