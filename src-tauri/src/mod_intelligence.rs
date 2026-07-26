use reqwest::Client;
use serde::Deserialize;

use crate::models::{ModMetadata, ModLoader};

const MODRINTH_API: &str = "https://api.modrinth.com/v2";

#[derive(Debug, Deserialize)]
struct ModrinthSearchResult {
    hits: Vec<ModrinthHit>,
}

#[derive(Debug, Deserialize)]
struct ModrinthHit {
    slug: String,
    title: String,
    description: String,
    author: String,
    downloads: u64,
    categories: Option<Vec<String>>,
    versions: Vec<String>,
    project_type: String,
}

#[derive(Debug, Deserialize)]
struct ModrinthProject {
    slug: String,
    title: String,
    description: String,
    body: Option<String>,
    downloads: u64,
    categories: Option<Vec<String>>,
    loaders: Option<Vec<String>>,
    game_versions: Option<Vec<String>>,
    source_url: Option<String>,
    issues_url: Option<String>,
    documentation_url: Option<String>,
    team: String,
}

#[derive(Debug, Deserialize)]
struct ModrinthDependency {
    project_id: Option<String>,
    file_name: Option<String>,
    dependency_type: String,
}

pub async fn search_modrinth(query: &str, loader: &ModLoader, mc_version: &str) -> Result<Vec<ModMetadata>, String> {
    let client = Client::new();

    let loader_str = match loader {
        ModLoader::Forge => "forge",
        ModLoader::NeoForge => "neoforge",
        ModLoader::Fabric => "fabric",
        ModLoader::Quilt => "quilt",
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
        .header("User-Agent", "ModpackEngine/0.1.0")
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
        .map(|hit| ModMetadata {
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
        })
        .collect())
}

pub async fn get_mod_metadata(mod_id: &str) -> Result<ModMetadata, String> {
    let client = Client::new();

    let url = format!("{}/project/{}", MODRINTH_API, mod_id);

    let resp = client
        .get(&url)
        .header("User-Agent", "ModpackEngine/0.1.0")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let project: ModrinthProject = resp
        .json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))?;

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

    Ok(ModMetadata {
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
    })
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
