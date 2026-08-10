use serde::Deserialize;

use crate::models::{DependencyType, ModDependency, ModLoader};

pub(crate) const MODRINTH_API: &str = "https://api.modrinth.com/v2";
pub(crate) const CURSEFORGE_API: &str = "https://api.curseforge.com/v1";
pub(crate) const CURSEFORGE_CDN: &str = "https://mediafilez.forgecdn.net/files";
/// Minecraft's game id on CurseForge. `/mods/search` rejects requests that
/// omit `gameId`, so every search must pass it.
pub(crate) const CURSEFORGE_MINECRAFT_GAME_ID: u32 = 432;

#[derive(Debug, Deserialize)]
pub(crate) struct ModrinthSearchResult {
    pub(crate) hits: Vec<ModrinthHit>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(crate) struct ModrinthHit {
    pub(crate) slug: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) author: String,
    pub(crate) downloads: u64,
    pub(crate) categories: Option<Vec<String>>,
    pub(crate) versions: Vec<String>,
    pub(crate) project_type: String,
    #[serde(default)]
    pub(crate) icon_url: Option<String>,
}

impl From<ModrinthHit> for crate::models::ModMetadata {
    fn from(hit: ModrinthHit) -> Self {
        Self {
            mod_id: hit.slug.clone(),
            slug: hit.slug,
            name: hit.title,
            description: hit.description,
            author: hit.author,
            categories: hit.categories.unwrap_or_default(),
            dependencies: vec![],
            supported_loaders: vec![],
            supported_versions: hit.versions,
            downloads: hit.downloads,
            source_url: None,
            issues_url: None,
            documentation_url: None,
            icon: hit.icon_url,
            source: "modrinth".to_string(),
            mismatch: None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(crate) struct ModrinthProject {
    pub(crate) slug: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) body: Option<String>,
    pub(crate) downloads: u64,
    pub(crate) categories: Option<Vec<String>>,
    pub(crate) loaders: Option<Vec<String>>,
    pub(crate) game_versions: Option<Vec<String>>,
    pub(crate) source_url: Option<String>,
    pub(crate) issues_url: Option<String>,
    pub(crate) documentation_url: Option<String>,
    #[serde(default)]
    pub(crate) icon_url: Option<String>,
    pub(crate) team: String,
}

impl From<ModrinthProject> for crate::models::ModMetadata {
    fn from(project: ModrinthProject) -> Self {
        let loaders = project.loaders.unwrap_or_default();
        let supported_loaders = loaders
            .iter()
            .filter_map(|l| match l.as_str() {
                "forge" => Some(ModLoader::Forge),
                "neoforge" => Some(ModLoader::NeoForge),
                "fabric" => Some(ModLoader::Fabric),
                "quilt" => Some(ModLoader::Quilt),
                _ => None,
            })
            .collect();

        Self {
            mod_id: project.slug.clone(),
            slug: project.slug,
            name: project.title,
            description: project.description,
            author: project.team,
            categories: project.categories.unwrap_or_default(),
            dependencies: vec![],
            supported_loaders,
            supported_versions: project.game_versions.unwrap_or_default(),
            downloads: project.downloads,
            source_url: project.source_url,
            issues_url: project.issues_url,
            documentation_url: project.documentation_url,
            icon: project.icon_url,
            source: "modrinth".to_string(),
            mismatch: None,
        }
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct ModrinthDependency {
    pub(crate) project_id: Option<String>,
    pub(crate) _file_name: Option<String>,
    pub(crate) dependency_type: String,
}

impl ModrinthDependency {
    pub(crate) fn to_model(&self) -> Option<ModDependency> {
        let project_id = self.project_id.as_deref()?;
        let dep_type = match self.dependency_type.as_str() {
            "required" => DependencyType::Required,
            "optional" => DependencyType::Optional,
            "recommended" => DependencyType::Recommended,
            "incompatible" => DependencyType::Incompatible,
            _ => return None,
        };
        Some(ModDependency {
            mod_id: project_id.to_string(),
            dependency_type: dep_type,
        })
    }
}

// CurseForge API types

#[derive(Debug, Deserialize)]
pub struct CurseForgeResponse {
    pub data: CurseForgeModInfo,
}

#[derive(Debug, Deserialize)]
pub struct CurseForgeModInfo {
    pub id: u64,
    pub name: String,
    pub slug: String,
    pub summary: Option<String>,
    pub downloadCount: Option<u64>,
    #[serde(default)]
    pub authors: Vec<CurseForgeAuthor>,
    #[serde(default)]
    pub links: Option<CurseForgeLinks>,
    #[serde(default)]
    pub categories: Vec<CurseForgeCategory>,
    #[serde(default)]
    pub gameVersions: Vec<String>,
    #[serde(default)]
    pub logo: Option<CurseForgeLogo>,
}

#[derive(Debug, Deserialize)]
pub struct CurseForgeCategory {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct CurseForgeAuthor {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct CurseForgeLogo {
    #[serde(rename = "thumbnailUrl", default)]
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CurseForgeLinks {
    pub websiteUrl: Option<String>,
    pub issuesUrl: Option<String>,
    #[serde(rename = "wikiUrl")]
    pub wiki_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CurseForgeFileResponse {
    pub data: CurseForgeFileInfo,
}

#[derive(Debug, Deserialize)]
pub struct CurseForgeFileListResponse {
    pub data: Vec<CurseForgeFileInfo>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct CurseForgeFileInfo {
    pub id: u64,
    pub displayName: String,
    pub fileName: String,
    pub downloadUrl: Option<String>,
    pub fileLength: Option<u64>,
    #[serde(default)]
    pub fileDate: Option<String>,
    #[serde(default)]
    pub isAvailable: Option<bool>,
    #[serde(default)]
    pub gameVersions: Vec<String>,
    #[serde(default)]
    pub modLoaderType: Option<i64>,
    /// Early-access files are only visible to the author's club members and
    /// must never be auto-picked as the "latest" downloadable file.
    #[serde(default)]
    pub isEarlyAccess: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub(crate) struct ModrinthVersion {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) version_number: String,
    pub(crate) loaders: Option<Vec<String>>,
    pub(crate) game_versions: Option<Vec<String>>,
    pub(crate) dependencies: Option<Vec<ModrinthDependency>>,
    pub(crate) files: Vec<ModrinthVersionFile>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ModrinthVersionFile {
    pub(crate) url: String,
    // The JSON key is `filename` — the underscore-prefixed Rust name marks
    // the field unused, but WITHOUT the rename it also renamed the serde
    // key, so decoding the live API shape failed with a missing-field error
    // ("error decoding response body") on every Modrinth version fetch.
    #[serde(rename = "filename")]
    pub(crate) _filename: String,
    pub(crate) primary: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Locks the deserialization of Modrinth's live version-object shape. The
    // `_filename`-without-rename bug shipped because nothing ever decoded a
    // realistic payload — a fixture mirroring the API keys (filename, not
    // _filename) catches that class of silent break.
    #[test]
    fn modrinth_version_decodes_live_api_shape() {
        let body = r#"[
            {
                "id": "lHHiI26k",
                "name": "Refined Storage 2.0.9",
                "version_number": "2.0.9",
                "loaders": ["neoforge"],
                "game_versions": ["1.21.1"],
                "dependencies": [],
                "files": [
                    {
                        "filename": "refinedstorage-neoforge-2.0.9.jar",
                        "primary": true,
                        "url": "https://cdn.modrinth.com/data/x/versions/y/jar.jar",
                        "size": 1234,
                        "hashes": { "sha1": "abc" }
                    }
                ]
            }
        ]"#;
        let versions: Vec<ModrinthVersion> = serde_json::from_str(body).expect("decodes the live API shape");
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].id, "lHHiI26k");
        assert_eq!(versions[0].files[0]._filename, "refinedstorage-neoforge-2.0.9.jar");
        assert!(versions[0].files[0].primary);
        assert_eq!(versions[0].files[0].url, "https://cdn.modrinth.com/data/x/versions/y/jar.jar");
    }
}
