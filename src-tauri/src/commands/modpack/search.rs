use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::mod_intelligence::{ModIntelligence, search_modpacks as search_modpacks_mint};
use crate::models::*;

use super::resolve_curseforge_api_key;
/// Download a mod from Modrinth or CurseForge into the selected instance's
/// `mods/` folder and record it in the project DB so Prism/the game can load
/// it. Returns the resulting `ModEntry` (with real jar-derived metadata when
/// the downloaded jar exposes it).
#[tauri::command]
pub async fn install_mod_from_search(
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
    project_id: String,
    source: String,
    mod_id: String,
    slug: String,
    name: String,
    author: String,
    description: String,
    version: Option<String>,
    icon: Option<String>,
) -> Result<ModEntry, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let project = db
        .get_project(&pid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let game_dir = std::path::Path::new(&project.path);
    if !game_dir.is_dir() {
        return Err(format!(
            "Instance directory not found at '{}'. Import the instance first.",
            project.path
        ));
    }
    let mods_dir = crate::path_safety::validate_under_root(game_dir, "mods")
        .map_err(|e| format!("Invalid mods directory: {e}"))?;
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let loader = format!("{}", project.mod_loader);
    let mc_version = project.minecraft_version.clone();

    let jar_path = match source.to_lowercase().as_str() {
        "modrinth" => intelligence
            .download_mod(&mod_id, version.as_deref(), &loader, &mc_version, &mods_dir)
            .await
            .map_err(|e| format!("Modrinth download failed: {e}"))?,
        "curseforge" => {
            let api_key = resolve_curseforge_api_key(&db)?
                .ok_or_else(|| "CurseForge API key not configured. Open Settings (gear icon) to add your API key.".to_string())?;
            let cf_id: u64 = mod_id
                .parse()
                .map_err(|_| format!("Invalid CurseForge project id: {mod_id}"))?;
            intelligence
                .download_curseforge_mod_for_version(cf_id, &api_key, &mc_version, &loader, &mods_dir)
                .await
                .map_err(|e| format!("CurseForge download failed: {e}"))?
        }
        other => return Err(format!("Unknown mod source: {other}")),
    };

    // Prefer metadata extracted from the downloaded jar so the DB row carries
    // the real mod id / version / description / icon. Fall back to the search
    // metadata when the jar doesn't expose it.
    let jar_info = crate::shared::extract_mod_info_from_jar(std::path::Path::new(&jar_path))
        .map_err(|e| format!("Failed to inspect downloaded jar: {e}"))?;

    let (real_mod_id, real_slug, real_name, real_version, real_desc, real_icon) = match jar_info {
        Some(info) => (
            info.mod_id.clone().unwrap_or_else(|| mod_id.clone()),
            info.mod_id.clone().unwrap_or_else(|| slug.clone()),
            info.mod_id.clone().unwrap_or_else(|| name.clone()),
            info.version.clone().unwrap_or_else(|| version.clone().unwrap_or_default()),
            info.description.clone().unwrap_or_else(|| description.clone()),
            info.icon_data_url.clone().or(icon),
        ),
        None => (mod_id.clone(), slug, name, version.unwrap_or_default(), description, icon),
    };

    let entry = ModEntry {
        id: Uuid::new_v4(),
        project_id: pid,
        mod_id: real_mod_id,
        slug: real_slug,
        name: real_name,
        version: real_version,
        description: real_desc,
        author,
        source: match source.to_lowercase().as_str() {
            "modrinth" => ModSource::Modrinth,
            "curseforge" => ModSource::CurseForge,
            _ => ModSource::Local,
        },
        enabled: true,
        added_at: chrono::Utc::now(),
        icon: real_icon,
    };

    db.add_mod(&entry).map_err(|e| e.to_string())?;
    eprintln!(
        "[ModCanvas] Installed {} -> {} ({})",
        source, entry.name, jar_path
    );
    Ok(entry)
}
#[tauri::command]
pub async fn search_mods(
    query: String,
    loader: String,
    mc_version: String,
    source: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<Vec<ModMetadata>, String> {
    let loader_enum = match loader.as_str() {
        "Fabric" => ModLoader::Fabric,
        "Quilt" => ModLoader::Quilt,
        "NeoForge" => ModLoader::NeoForge,
        _ => ModLoader::Forge,
    };

    let source = source.to_lowercase();
    let mut results = Vec::new();

    // Search Modrinth (always available unless the user pinned CurseForge)
    if source.is_empty() || source == "all" || source == "modrinth" {
        match intelligence.search_modrinth(&query, loader_enum.clone(), &mc_version).await {
            Ok(mut mods) => results.append(&mut mods),
            Err(e) => eprintln!("[ModCanvas] Modrinth mod search failed: {}", e),
        }
    }

    // Search CurseForge if API key configured
    if source.is_empty() || source == "all" || source == "curseforge" {
        let api_key = resolve_curseforge_api_key(&db)?;
        if let Some(key) = api_key {
            match intelligence.search_curseforge(&query, &key).await {
                Ok(mut mods) => {
                    // Keep every result but annotate non-matching versions
                    // instead of dropping them — CurseForge search returns many
                    // mods whose latest file targets a different MC version,
                    // and hiding those made the tab look broken/empty.
                    for m in mods.iter_mut() {
                        if mc_version.is_empty() {
                            continue;
                        }
                        let compatible = m.supported_versions.is_empty()
                            || m.supported_versions.iter().any(|v| version_compatible(v, &mc_version));
                        if !compatible {
                            let avail = m.supported_versions.iter().take(4).cloned().collect::<Vec<_>>().join(", ");
                            let avail_desc = if avail.is_empty() {
                                "unknown version".to_string()
                            } else {
                                avail
                            };
                            m.mismatch = Some(format!("Version: requires {avail_desc}"));
                        }
                    }
                    results.append(&mut mods);
                }
                Err(e) => eprintln!("[ModCanvas] CurseForge mod search failed: {}", e),
            }
        }
    }

    // Sort exact matches first (so duplicate entries across registries resolve
    // to the rich Modrinth record), then deduplicate by mod_id.
    results.sort_by_key(|m| (m.mismatch.is_some(), m.mod_id.clone()));
    results.dedup_by(|a, b| a.mod_id == b.mod_id);

    Ok(results)
}
/// True when an available MC version covers the requested one: exact match,
/// or a major-version prefix (e.g. available "1.21" covers requested "1.21.1").
fn version_compatible(available: &str, requested: &str) -> bool {
    if available == requested {
        return true;
    }
    requested.starts_with(available) && requested[available.len()..].starts_with('.')
}

#[cfg(test)]
mod tests {
    use super::version_compatible;

    #[test]
    fn exact_match_is_compatible() {
        assert!(version_compatible("1.21.1", "1.21.1"));
    }

    #[test]
    fn major_prefix_covers_patch() {
        assert!(version_compatible("1.21", "1.21.1"));
        assert!(version_compatible("1.20", "1.20.5"));
    }

    #[test]
    fn reversed_or_unrelated_versions_are_not_compatible() {
        assert!(!version_compatible("1.21.1", "1.21"));
        assert!(!version_compatible("1.21", "1.20.1"));
        assert!(!version_compatible("1.19", "1.21.1"));
    }
}

#[tauri::command]
pub async fn search_modpacks(
    query: String,
    mc_version: String,
    loader: String,
    sort: String,
) -> Result<Vec<ModpackMetadata>, String> {
    search_modpacks_mint(&query, &mc_version, &loader, &sort).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_modpacks_curseforge(
    query: String,
    mc_version: String,
    loader: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<Vec<ModpackMetadata>, String> {
    let api_key = resolve_curseforge_api_key(&db)?;
    if let Some(key) = api_key {
        let version = if mc_version.is_empty() { None } else { Some(mc_version.as_str()) };
        let loader_filter = if loader == "all" { None } else { Some(loader.as_str()) };
        intelligence.search_curseforge_modpacks(&query, &key, version, loader_filter).await.map_err(|e| e.to_string())
    } else {
        Err("CurseForge API key not configured. Open Settings (gear icon) to add your API key.".to_string())
    }
}

#[tauri::command]
pub async fn search_modpacks_all(
    query: String,
    mc_version: String,
    loader: String,
    sort: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<Vec<ModpackMetadata>, String> {
    let mut results = Vec::new();
    
    // Search Modrinth
    match search_modpacks_mint(&query, &mc_version, &loader, &sort).await {
        Ok(mut mods) => results.append(&mut mods),
        Err(e) => eprintln!("[ModCanvas] Modrinth modpack search failed: {}", e),
    }
    
    // Search CurseForge if API key configured
    let api_key = resolve_curseforge_api_key(&db)?;
    if let Some(key) = api_key {
        let version = if mc_version.is_empty() { None } else { Some(mc_version.as_str()) };
        let loader_filter = if loader == "all" { None } else { Some(loader.as_str()) };
        match intelligence.search_curseforge_modpacks(&query, &key, version, loader_filter).await {
            Ok(mut mods) => results.append(&mut mods),
            Err(e) => eprintln!("[ModCanvas] CurseForge modpack search failed: {}", e),
        }
    }
    
    // Deduplicate by project_id
    results.sort_by_key(|m| m.project_id.clone());
    results.dedup_by(|a, b| a.project_id == b.project_id);
    
    Ok(results)
}
