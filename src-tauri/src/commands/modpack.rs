use tauri::State;
use uuid::Uuid;
use std::path::PathBuf;

use crate::db::Database;
use crate::imports::{
    ImportResult, instance, mrpack, packwiz, curseforge, resolution,
    create_mrpack_zip, quest_config, progression_config,
};
use crate::minecraft::deploy_companion_mod_to_dir;
use crate::mod_intelligence::{ModIntelligence, search_modpacks as search_modpacks_mint};
use crate::models::*;
use crate::path_safety::atomic_write_str;
use super::{resolve_curseforge_api_key, load_progression_from_pack, load_quest_from_pack};

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

fn try_deploy_companion(loader: &ModLoader, mc_version: &str, game_dir: &str) {
    let loader_str = match loader {
        ModLoader::NeoForge => "neoforge",
        ModLoader::Forge => "forge",
        ModLoader::Fabric => "fabric",
        ModLoader::Quilt => "quilt",
        ModLoader::Vanilla => return,
    };
    let path = std::path::PathBuf::from(game_dir);
    if let Err(e) = deploy_companion_mod_to_dir(&path, loader_str, mc_version) {
        eprintln!("[ModCanvas] Auto-deploy companion mod skipped: {e}");
    }
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

#[tauri::command]
pub async fn download_modpack_modrinth(
    slug: String,
    mc_version: String,
    loader: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let client = reqwest::Client::new();
    
    // Get the latest version file for the modpack
    let url = format!("https://api.modrinth.com/v2/project/{}/version", slug);
    let resp = client.get(&url)
        .header("User-Agent", "MMM/0.1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    #[derive(serde::Deserialize)]
    struct ModrinthVersion {
        files: Vec<ModrinthFile>,
        game_versions: Vec<String>,
        loaders: Vec<String>,
    }
    
    #[derive(serde::Deserialize)]
    struct ModrinthFile {
        url: String,
        filename: String,
        primary: bool,
    }
    
    let versions: Vec<ModrinthVersion> = resp.json().await.map_err(|e| e.to_string())?;
    
    // Find matching version - try exact match first, then fallback strategies
    let loader_lower = loader.to_lowercase();
    
    // Strategy 1: Exact match (MC version + loader)
    let mut matching_version = versions.iter().find(|v| {
        v.game_versions.contains(&mc_version) && 
        v.loaders.iter().any(|l| l.to_lowercase() == loader_lower)
    });
    
    // Strategy 2: Match MC version, any loader
    if matching_version.is_none() {
        matching_version = versions.iter().find(|v| {
            v.game_versions.contains(&mc_version)
        });
    }
    
    // Strategy 3: Match loader, latest MC version
    if matching_version.is_none() {
        matching_version = versions.iter().find(|v| {
            v.loaders.iter().any(|l| l.to_lowercase() == loader_lower)
        });
    }
    
    // Strategy 4: Just take the latest version
    if matching_version.is_none() {
        matching_version = versions.last();
    }
    
    let matching_version = matching_version.ok_or_else(|| "No versions found for this modpack".to_string())?;
    
    let file = matching_version.files.iter().find(|f| f.primary)
        .or_else(|| matching_version.files.iter().find(|f| f.filename.ends_with(".mrpack")))
        .ok_or_else(|| "No .mrpack file found".to_string())?;
    
    let file_url = file.url.clone();
    let file_filename = file.filename.clone();
    
    // Download the mrpack
    let resp = client.get(&file_url).send().await.map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    
    // Save to temp file
    let temp_dir = std::env::temp_dir();
    let mrpack_path = temp_dir.join(&file_filename);
    atomic_write_str(&mrpack_path, &String::from_utf8_lossy(&bytes)).map_err(|e| e.to_string())?;
    
    // Import using existing mrpack importer
    let result = mrpack::MrPackImporter::import(&mrpack_path).map_err(|e| e.to_string())?;
    
    // Resolve mods
    let curseforge_api_key = resolve_curseforge_api_key(&db)?;
    let unresolved_mods = result.unresolved_mods.clone();
    let resolved = resolution::resolve_mods(
        unresolved_mods,
        &result.project.minecraft_version,
        result.project.mod_loader.clone(),
        intelligence.inner(),
        curseforge_api_key.as_deref()
    ).await;
    
    let mut final_result = result;
    final_result.mods = resolved.into_iter().map(|r| crate::imports::ResolvedMod {
        mod_id: r.mod_id,
        slug: r.slug,
        name: r.name,
        version: r.version,
        source: r.source,
    }).collect();
    
    // Save project
    db.create_project(&final_result.project).map_err(|e| e.to_string())?;
    try_deploy_companion(&final_result.project.mod_loader, &final_result.project.minecraft_version, &final_result.project.path);
    
    for mod_entry in &final_result.mods {
        let entry = ModEntry {
            id: Uuid::new_v4(),
            project_id: final_result.project.id,
            mod_id: mod_entry.mod_id.clone(),
            slug: mod_entry.slug.clone(),
            name: mod_entry.name.clone(),
            version: mod_entry.version.clone(),
            description: String::new(),
            author: String::new(),
            source: ModSource::Modrinth,
            enabled: true,
            added_at: chrono::Utc::now(),
        icon: None,
        };
        db.add_mod(&entry).map_err(|e| e.to_string())?;
    }
    
    // Clean up temp file
    let _ = std::fs::remove_file(&mrpack_path);
    
    Ok(final_result)
}

/// Download a modpack .mrpack and import it via Prism Launcher's built-in import.
/// Prism handles all mod downloading, extraction, and instance creation.
#[tauri::command]
pub async fn import_modpack_via_prism(
    slug: String,
    mc_version: String,
    loader: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    // Fetch version list from Modrinth
    let url = format!("https://api.modrinth.com/v2/project/{}/version", slug);
    let resp = client.get(&url)
        .header("User-Agent", "MMM/0.1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch versions: {e}"))?;

    #[derive(serde::Deserialize)]
    struct ModrinthVersion {
        files: Vec<ModrinthFile>,
        game_versions: Vec<String>,
        loaders: Vec<String>,
    }

    #[derive(serde::Deserialize)]
    struct ModrinthFile {
        url: String,
        filename: String,
        primary: bool,
    }

    let versions: Vec<ModrinthVersion> = resp.json().await.map_err(|e| e.to_string())?;

    // Find matching version with fallback strategies
    let loader_lower = loader.to_lowercase();
    let matching_version = versions.iter()
        .find(|v| v.game_versions.contains(&mc_version) && v.loaders.iter().any(|l| l.to_lowercase() == loader_lower))
        .or_else(|| versions.iter().find(|v| v.game_versions.contains(&mc_version)))
        .or_else(|| versions.iter().find(|v| v.loaders.iter().any(|l| l.to_lowercase() == loader_lower)))
        .or_else(|| versions.last())
        .ok_or_else(|| "No matching version found".to_string())?;

    let file = matching_version.files.iter().find(|f| f.primary)
        .or_else(|| matching_version.files.iter().find(|f| f.filename.ends_with(".mrpack")))
        .ok_or_else(|| "No .mrpack file found".to_string())?;

    // Download the .mrpack to a temp file
    let resp = client.get(&file.url).send().await.map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    let temp_dir = std::env::temp_dir();
    let mrpack_path = temp_dir.join(&file.filename);
    atomic_write_str(&mrpack_path, &String::from_utf8_lossy(&bytes)).map_err(|e| format!("Failed to write temp file: {e}"))?;

    eprintln!("[ModCanvas] Downloaded .mrpack to {:?}", mrpack_path);

    // Import via Prism Launcher CLI
    let output = std::process::Command::new("prismlauncher")
        .args(["--import", mrpack_path.to_str().unwrap_or("")])
        .output()
        .map_err(|e| format!("Failed to run Prism Launcher: {e}"))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&mrpack_path);

    if output.status.success() {
        let msg = format!("Imported '{}' via Prism Launcher", file.filename);
        eprintln!("[ModCanvas] {msg}");
        Ok(msg)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() { &stdout } else { &stderr };
        Err(format!("Prism import failed: {detail}"))
    }
}

/// Open Prism Launcher's main window (for modpack browsing/management).
#[tauri::command]
pub async fn open_prism_launcher() -> Result<(), String> {
    std::process::Command::new("prismlauncher")
        .spawn()
        .map_err(|e| format!("Failed to open Prism Launcher: {e}"))?;
    Ok(())
}

/// Download a CurseForge modpack and import it via Prism Launcher.
#[tauri::command]
pub async fn import_curseforge_via_prism(
    project_id: String,
    mc_version: String,
    _loader: String,
    db: State<'_, Database>,
) -> Result<String, String> {
    let api_key = resolve_curseforge_api_key(&db)?
        .ok_or_else(|| "CurseForge API key not configured. Set CURSEFORGE_API_KEY environment variable.".to_string())?;

    let client = reqwest::Client::new();

    // CurseForge numeric project IDs — get the mod files
    let url = format!("https://api.curseforge.com/v1/mods/{}/files", project_id);
    let resp = client.get(&url)
        .header("x-api-key", &api_key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch CurseForge files: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("CurseForge API error {status}: {body}"));
    }

    #[derive(serde::Deserialize)]
    struct CfFilesResponse {
        data: Vec<CfFile>,
    }

    #[derive(serde::Deserialize)]
    struct CfFile {
        _id: u64,
        _game_id: u64,
        display_name: String,
        file_name: String,
        download_url: Option<String>,
        is_available: bool,
        game_versions: Vec<String>,
        _sortable_game_versions: Vec<String>,
    }

    let files_resp: CfFilesResponse = resp.json().await.map_err(|e| e.to_string())?;

    // Filter to available files with a download URL, matching MC version
    let matching_files: Vec<&CfFile> = files_resp.data.iter()
        .filter(|f| f.is_available && f.download_url.is_some())
        .filter(|f| {
            if mc_version.is_empty() { return true; }
            f.game_versions.iter().any(|v| v == &mc_version)
        })
        .collect();

    let best_file = matching_files.into_iter().next()
        .or_else(|| files_resp.data.iter().find(|f| f.is_available && f.download_url.is_some()))
        .ok_or_else(|| "No downloadable files found for this modpack".to_string())?;

    let download_url = best_file.download_url.as_ref()
        .ok_or_else(|| "File has no download URL".to_string())?;

    eprintln!(
        "[ModCanvas] Downloading CurseForge modpack: {} (file: {})",
        best_file.display_name, best_file.file_name
    );

    // Download the file
    let resp = client.get(download_url)
        .header("x-api-key", &api_key)
        .send()
        .await
        .map_err(|e| format!("Failed to download modpack: {e}"))?;

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    // Save to temp file
    let temp_dir = std::env::temp_dir();
    let pack_path = temp_dir.join(&best_file.file_name);
    atomic_write_str(&pack_path, &String::from_utf8_lossy(&bytes)).map_err(|e| format!("Failed to write temp file: {e}"))?;

    eprintln!("[ModCanvas] Downloaded CurseForge pack to {:?}", pack_path);

    // Import via Prism Launcher CLI
    let output = std::process::Command::new("prismlauncher")
        .args(["--import", pack_path.to_str().unwrap_or("")])
        .output()
        .map_err(|e| format!("Failed to run Prism Launcher: {e}"))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&pack_path);

    if output.status.success() {
        let msg = format!("Imported '{}' via Prism Launcher", best_file.display_name);
        eprintln!("[ModCanvas] {msg}");
        Ok(msg)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() { &stdout } else { &stderr };
        Err(format!("Prism import failed: {detail}"))
    }
}

#[tauri::command]
pub async fn import_modrinth_mrpack(
    path: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    let result = mrpack::MrPackImporter::import(&path).map_err(|e| e.to_string())?;
    
    // Get CurseForge API key from settings
    let curseforge_api_key = resolve_curseforge_api_key(&db)?;
    
    // Resolve mods
    let unresolved_mods = result.unresolved_mods.clone();
    let resolved = resolution::resolve_mods(
        unresolved_mods,
        &result.project.minecraft_version,
        result.project.mod_loader.clone(),
        intelligence.inner(),
        curseforge_api_key.as_deref()
    ).await;
    
    let mut final_result = result;
    final_result.mods = resolved.into_iter().map(|r| crate::imports::ResolvedMod {
        mod_id: r.mod_id,
        slug: r.slug,
        name: r.name,
        version: r.version,
        source: r.source,
    }).collect();
    
    // Save project
    db.create_project(&final_result.project).map_err(|e| e.to_string())?;
    
    // Save resolved mods
    for mod_entry in &final_result.mods {
        let entry = ModEntry {
            id: Uuid::new_v4(),
            project_id: final_result.project.id,
            mod_id: mod_entry.mod_id.clone(),
            slug: mod_entry.slug.clone(),
            name: mod_entry.name.clone(),
            version: mod_entry.version.clone(),
            description: String::new(),
            author: String::new(),
            source: ModSource::Modrinth,
            enabled: true,
            added_at: chrono::Utc::now(),
        icon: None,
        };
        db.add_mod(&entry).map_err(|e| e.to_string())?;
    }
    
    // Load progression graph from pack if exists
    if let Some(ref graph) = final_result.progression_graph {
        load_progression_from_pack(&final_result.project.id.to_string(), &PathBuf::from(&final_result.project.path))?;
        eprintln!("[ModCanvas] Loaded progression graph from pack: {} nodes", graph.nodes.len());
    }
    
    // Load quest graph from pack if exists
    if let Some(ref graph) = final_result.quest_graph {
        load_quest_from_pack(&final_result.project.id.to_string(), &PathBuf::from(&final_result.project.path))?;
        eprintln!("[ModCanvas] Loaded quest graph from pack: {} nodes", graph.nodes.len());
    }
    
    // Try to parse quest configs from config files (FTB Quests, Better Questing, etc.)
    if final_result.quest_graph.is_none() && !final_result.config_files.is_empty() {
        eprintln!("[ModCanvas] Attempting to parse quest configs from {} config files", final_result.config_files.len());
        if let Ok(Some(quest_graph)) = quest_config::parse_all_quest_configs(&final_result.config_files) {
            // Save the parsed quest graph into the project workspace state dir
            let graph_path = crate::path_safety::quest_graph_path(&final_result.project.path)?;
            crate::path_safety::atomic_write_str(&graph_path, &serde_json::to_string_pretty(&quest_graph).map_err(|e| e.to_string())?)?;
            crate::quest_cache::put(&final_result.project.id.to_string(), &quest_graph);
            eprintln!("[ModCanvas] Parsed and saved quest graph from configs: {} nodes, {} edges", 
                quest_graph.nodes.len(), quest_graph.edges.len());
        }
    }
    
    // Try to parse progression configs from config files (Game Stages, FTB Quests chapters, Advancements, etc.)
    if final_result.progression_graph.is_none() && !final_result.config_files.is_empty() {
        eprintln!("[ModCanvas] Attempting to parse progression configs from {} config files", final_result.config_files.len());
        if let Ok(Some(progression_graph)) = progression_config::parse_all_progression_configs(&final_result.config_files) {
            // Save the parsed progression graph to project config
            let config_dir = std::env::temp_dir()
                .join("modcanvas_configs")
                .join(&final_result.project.id.to_string());
            std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
            let graph_path = config_dir.join("progression.json");
            crate::path_safety::atomic_write_str(&graph_path, &serde_json::to_string_pretty(&progression_graph).map_err(|e| e.to_string())?)?;
            eprintln!("[ModCanvas] Parsed and saved progression graph from configs: {} nodes, {} edges", 
                progression_graph.nodes.len(), progression_graph.edges.len());
        }
    }
    
    Ok(final_result)
}

#[tauri::command]
pub async fn import_instance_folder(
    path: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    let result = instance::InstanceImporter::import(&path).map_err(|e| e.to_string())?;
    
    // Get CurseForge API key from settings
    let curseforge_api_key = resolve_curseforge_api_key(&db)?;
    
    let unresolved_mods = result.unresolved_mods.clone();
    let resolved = resolution::resolve_mods(
        unresolved_mods,
        &result.project.minecraft_version,
        result.project.mod_loader.clone(),
        intelligence.inner(),
        curseforge_api_key.as_deref()
    ).await;
    
    let mut final_result = result;
    final_result.mods = resolved.into_iter().map(|r| crate::imports::ResolvedMod {
        mod_id: r.mod_id,
        slug: r.slug,
        name: r.name,
        version: r.version,
        source: r.source,
    }).collect();
    
    db.create_project(&final_result.project).map_err(|e| e.to_string())?;
    try_deploy_companion(&final_result.project.mod_loader, &final_result.project.minecraft_version, &final_result.project.path);
    
    for mod_entry in &final_result.mods {
        let entry = ModEntry {
            id: Uuid::new_v4(),
            project_id: final_result.project.id,
            mod_id: mod_entry.mod_id.clone(),
            slug: mod_entry.slug.clone(),
            name: mod_entry.name.clone(),
            version: mod_entry.version.clone(),
            description: String::new(),
            author: String::new(),
            source: ModSource::Modrinth,
            enabled: true,
            added_at: chrono::Utc::now(),
        icon: None,
        };
        db.add_mod(&entry).map_err(|e| e.to_string())?;
    }
    
    // Load progression graph from pack if exists
    if let Some(ref graph) = final_result.progression_graph {
        load_progression_from_pack(&final_result.project.id.to_string(), &PathBuf::from(&final_result.project.path))?;
        eprintln!("[ModCanvas] Loaded progression graph from pack: {} nodes", graph.nodes.len());
    }
    
    // Load quest graph from pack if exists
    if let Some(ref graph) = final_result.quest_graph {
        load_quest_from_pack(&final_result.project.id.to_string(), &PathBuf::from(&final_result.project.path))?;
        eprintln!("[ModCanvas] Loaded quest graph from pack: {} nodes", graph.nodes.len());
    }
    
    Ok(final_result)
}

#[tauri::command]
pub async fn import_packwiz(
    path: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    let result = packwiz::PackwizImporter::import(&path).map_err(|e| e.to_string())?;
    
    // Get CurseForge API key from settings
    let curseforge_api_key = resolve_curseforge_api_key(&db)?;
    
    let unresolved_mods = result.unresolved_mods.clone();
    let resolved = resolution::resolve_mods(
        unresolved_mods,
        &result.project.minecraft_version,
        result.project.mod_loader.clone(),
        intelligence.inner(),
        curseforge_api_key.as_deref()
    ).await;
    
    let mut final_result = result;
    final_result.mods = resolved.into_iter().map(|r| crate::imports::ResolvedMod {
        mod_id: r.mod_id,
        slug: r.slug,
        name: r.name,
        version: r.version,
        source: r.source,
    }).collect();
    
    db.create_project(&final_result.project).map_err(|e| e.to_string())?;
    try_deploy_companion(&final_result.project.mod_loader, &final_result.project.minecraft_version, &final_result.project.path);
    
    for mod_entry in &final_result.mods {
        let entry = ModEntry {
            id: Uuid::new_v4(),
            project_id: final_result.project.id,
            mod_id: mod_entry.mod_id.clone(),
            slug: mod_entry.slug.clone(),
            name: mod_entry.name.clone(),
            version: mod_entry.version.clone(),
            description: String::new(),
            author: String::new(),
            source: ModSource::Modrinth,
            enabled: true,
            added_at: chrono::Utc::now(),
        icon: None,
        };
        db.add_mod(&entry).map_err(|e| e.to_string())?;
    }
    
    // Load progression graph from pack if exists
    if let Some(ref graph) = final_result.progression_graph {
        load_progression_from_pack(&final_result.project.id.to_string(), &PathBuf::from(&final_result.project.path))?;
        eprintln!("[ModCanvas] Loaded progression graph from pack: {} nodes", graph.nodes.len());
    }
    
    // Load quest graph from pack if exists
    if let Some(ref graph) = final_result.quest_graph {
        load_quest_from_pack(&final_result.project.id.to_string(), &PathBuf::from(&final_result.project.path))?;
        eprintln!("[ModCanvas] Loaded quest graph from pack: {} nodes", graph.nodes.len());
    }
    
    Ok(final_result)
}

#[tauri::command]
pub async fn import_curseforge_zip(
    path: String,
    db: State<'_, Database>,
    _intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    let result = curseforge::CurseForgeImporter::import(&path).map_err(|e| e.to_string())?;

    // CurseForge mods use projectID/fileID. Download the actual jar files via
    // the CurseForge API (when a key is configured) into the extracted game
    // dir's `mods/` folder, so the pack is launchable and the mods list shows
    // real metadata. Without a key, fall back to storing placeholder entries.
    //
    // The project row must exist BEFORE inserting mods: `mods.project_id` has a
    // FOREIGN KEY back to projects(id), so inserting mods first fails with
    // "foreign key constraint failed".
    let game_dir = PathBuf::from(&result.project.path);
    let api_key = resolve_curseforge_api_key(&db)?;
    let mut resolved_mods: Vec<crate::imports::ResolvedMod> = Vec::new();

    db.create_project(&result.project).map_err(|e| e.to_string())?;

    if let Some(key) = api_key {
        let downloads = download_curseforge_manifest_mods(
            &result.unresolved_mods,
            &key,
            &game_dir,
        ).await.map_err(|e| format!("Failed to download CurseForge mods: {e}"))?;

        // Persist real mod metadata (or placeholder for mods that failed).
        for d in &downloads {
            let entry = ModEntry {
                id: Uuid::new_v4(),
                project_id: result.project.id,
                mod_id: d.mod_id.clone(),
                slug: d.slug.clone(),
                name: d.name.clone(),
                version: d.version.clone(),
                description: String::new(),
                author: String::new(),
                source: ModSource::CurseForge,
                enabled: true,
                added_at: chrono::Utc::now(),
                icon: None,
            };
            db.add_mod(&entry).map_err(|e| e.to_string())?;
            resolved_mods.push(crate::imports::ResolvedMod {
                mod_id: d.mod_id.clone(),
                slug: d.slug.clone(),
                name: d.name.clone(),
                version: d.version.clone(),
                source: "curseforge".to_string(),
            });
        }
    } else {
        eprintln!("[ModCanvas] No CurseForge API key configured; skipping mod downloads");
    }

    // If the API key was absent or a download failed, still record placeholder
    // entries so the mods list reflects what the pack declares.
    if resolved_mods.is_empty() {
        for unresolved in &result.unresolved_mods {
            let mod_id = unresolved.mod_id.clone().unwrap_or_default();
            let version = unresolved.version.clone().unwrap_or_default();
            let project_id = mod_id.strip_prefix("curseforge:").unwrap_or(&mod_id);

            let entry = ModEntry {
                id: Uuid::new_v4(),
                project_id: result.project.id,
                mod_id: mod_id.clone(),
                slug: format!("curseforge-{}", project_id),
                name: format!("CurseForge Mod {}", project_id),
                version,
                description: String::new(),
                author: String::new(),
                source: ModSource::CurseForge,
                enabled: true,
                added_at: chrono::Utc::now(),
                icon: None,
            };
            db.add_mod(&entry).map_err(|e| e.to_string())?;
        }
    }

    try_deploy_companion(&result.project.mod_loader, &result.project.minecraft_version, &result.project.path);

    // Load progression graph from pack if exists
    if let Some(ref graph) = result.progression_graph {
        load_progression_from_pack(&result.project.id.to_string(), &path)?;
        eprintln!("[ModCanvas] Loaded progression graph from pack: {} nodes", graph.nodes.len());
    }

    // Load quest graph from pack if exists
    if let Some(ref graph) = result.quest_graph {
        load_quest_from_pack(&result.project.id.to_string(), &path)?;
        eprintln!("[ModCanvas] Loaded quest graph from pack: {} nodes", graph.nodes.len());
    }

    Ok(ImportResult {
        project: result.project,
        mods: resolved_mods,
        unresolved_mods: Vec::new(),
        config_files: result.config_files,
        progression_graph: result.progression_graph,
        quest_graph: result.quest_graph,
    })
}

/// CurseForge file metadata for a manifest entry, after the batch lookup.
struct CurseForgeDownload {
    mod_id: String,
    slug: String,
    name: String,
    version: String,
}

/// Download every mod declared in a CurseForge manifest into the game dir's
/// `mods/` folder. CurseForge's API has no batch file-lookup endpoint, so each
/// manifest entry (projectID + fileID) is resolved via
/// `GET /v1/mods/{modId}/files/{fileId}`. Requests are bounded to 4 in flight
/// to stay inside the API rate limit; failures are skipped, not fatal.
async fn download_curseforge_manifest_mods(
    unresolved: &[crate::imports::UnresolvedMod],
    api_key: &str,
    game_dir: &PathBuf,
) -> Result<Vec<CurseForgeDownload>, String> {
    use crate::path_safety::validate_under_root;
    use futures_util::StreamExt;

    #[derive(serde::Deserialize)]
    struct CfFileEnvelope {
        data: CfFile,
    }

    #[derive(serde::Deserialize)]
    struct CfFile {
        id: u64,
        #[serde(rename = "fileName")]
        file_name: String,
        #[serde(rename = "displayName")]
        display_name: String,
        #[serde(rename = "downloadUrl")]
        download_url: Option<String>,
        #[serde(rename = "gameVersions")]
        game_versions: Vec<String>,
        #[serde(rename = "modId")]
        mod_id: u64,
    }

    let client = reqwest::Client::new();
    let mods_dir = validate_under_root(game_dir, "mods")?;
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    // Collect (projectId, fileId) pairs from the manifest entries.
    let ids: Vec<(String, String)> = unresolved
        .iter()
        .filter_map(|u| u.mod_id.as_deref())
        .filter_map(|m| m.strip_prefix("curseforge:"))
        .zip(unresolved.iter().filter_map(|u| u.version.clone()))
        .map(|(pid, fid)| (pid.to_string(), fid))
        .collect();

    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(4));
    let mut tasks = Vec::new();

    for (project_id, file_id) in ids {
        let sem = semaphore.clone();
        let client = client.clone();
        let api_key = api_key.to_string();
        let mods_dir = mods_dir.clone();
        tasks.push(tokio::spawn(async move {
            let _permit = sem.acquire_owned().await.map_err(|_| "semaphore closed".to_string())?;
            let url = format!(
                "https://api.curseforge.com/v1/mods/{project_id}/files/{file_id}"
            );
            let resp = client
                .get(&url)
                .header("x-api-key", &api_key)
                .header("Accept", "application/json")
                .send()
                .await
                .map_err(|e| format!("{project_id}: {e}"))?;

            if !resp.status().is_success() {
                return Err(format!("{project_id}: HTTP {}", resp.status()));
            }

            let file: CfFileEnvelope = resp.json().await.map_err(|e| e.to_string())?;
            let file = file.data;

            // Only keep jars (skip server packs / non-jar artifacts).
            if !file.file_name.ends_with(".jar") {
                return Err("not a jar".to_string());
            }

            let url = match file.download_url {
                Some(u) => u,
                None => return Err("no download url".to_string()),
            };

            let safe_name = std::path::Path::new(&file.file_name)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("mod-{}.jar", file.id));
            let out_path = mods_dir.join(safe_name);

            let dl_resp = client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("{}: download failed: {e}", file.display_name))?;
            if !dl_resp.status().is_success() {
                return Err(format!("{}: download HTTP {}", file.display_name, dl_resp.status()));
            }
            let bytes = dl_resp.bytes().await.map_err(|e| e.to_string())?;
            crate::path_safety::atomic_write(&out_path, &bytes).map_err(|e| e.to_string())?;

            Ok(CurseForgeDownload {
                mod_id: format!("curseforge:{}", file.mod_id),
                slug: file.display_name.clone(),
                name: file.display_name,
                version: file.file_name,
            })
        }));
    }

    let mut downloaded = Vec::new();
    let mut failures = 0;
    let mut stream = futures_util::stream::iter(tasks).buffer_unordered(4);
    while let Some(task) = stream.next().await {
        match task {
            Ok(Ok(d)) => {
                eprintln!("[ModCanvas] OK  {}", d.name);
                downloaded.push(d);
            }
            Ok(Err(e)) => {
                failures += 1;
                eprintln!("[ModCanvas] SKIP {}", e);
            }
            Err(_) => {
                failures += 1;
                eprintln!("[ModCanvas] TASK PANIC");
            }
        }
    }

    eprintln!(
        "[ModCanvas] CurseForge mod downloads complete: {} ok, {} failed",
        downloaded.len(),
        failures
    );
    Ok(downloaded)
}

#[tauri::command]
pub async fn auto_import_pack(
    path: String,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);
    
    if mrpack::MrPackImporter::can_import(&path) {
        import_modrinth_mrpack(path.to_string_lossy().to_string(), db, intelligence).await
    } else if curseforge::CurseForgeImporter::can_import(&path) {
        import_curseforge_zip(path.to_string_lossy().to_string(), db, intelligence).await
    } else if packwiz::PackwizImporter::can_import(&path) {
        import_packwiz(path.to_string_lossy().to_string(), db, intelligence).await
    } else if instance::InstanceImporter::can_import(&path) {
        import_instance_folder(path.to_string_lossy().to_string(), db, intelligence).await
    } else {
        Err("Unsupported pack format".to_string())
    }
}

#[tauri::command]
pub async fn export_modrinth_mrpack(
    project_id: String,
    db: State<'_, Database>,
) -> Result<String, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let project = db.list_projects().map_err(|e| e.to_string())?
        .into_iter()
        .find(|p| p.id == pid)
        .ok_or("Project not found")?;
    
    let _mods = db.get_project_mods(&pid).map_err(|e| e.to_string())?;
    
    // Generate mrpack structure
    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let mods_dir = temp_dir.path().join("mods");
    let config_dir = temp_dir.path().join("config");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    
    let files = Vec::new();
    let mut dependencies = mrpack::MrPackDependencies {
        minecraft: project.minecraft_version.clone(),
        forge: None,
        neoforge: None,
        fabric: None,
        quilt: None,
        loaders: Vec::new(),
    };
    
    match project.mod_loader {
        ModLoader::Fabric => dependencies.fabric = Some("latest".to_string()),
        ModLoader::Quilt => dependencies.quilt = Some("latest".to_string()),
        ModLoader::NeoForge => dependencies.neoforge = Some("latest".to_string()),
        ModLoader::Forge => dependencies.forge = Some("latest".to_string()),
        ModLoader::Vanilla => {},
    }
    
    let index = mrpack::MrPackIndex {
        format_version: 1,
        game: "minecraft".to_string(),
        version_id: project.pack_version.clone(),
        name: project.name.clone(),
        summary: Some(project.description.clone()),
        files,
        dependencies,
    };
    
    let index_json = serde_json::to_string_pretty(&index).map_err(|e| e.to_string())?;
    crate::path_safety::atomic_write_str(&temp_dir.path().join("modrinth.index.json"), &index_json).map_err(|e| e.to_string())?;
    
    // Create .mrpack zip
    let output_path = temp_dir.path().join(format!("{}.mrpack", project.name.replace(' ', "_")));
    create_mrpack_zip(temp_dir.path(), &output_path).map_err(|e| e.to_string())?;
    
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_curseforge_zip(
    project_id: String,
    db: State<'_, Database>,
) -> Result<String, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let projects = db.list_projects().map_err(|e| e.to_string())?;
    let project = projects.into_iter()
        .find(|p| p.id == pid)
        .ok_or("Project not found")?;
    
    let mods = db.get_project_mods(&pid).map_err(|e| e.to_string())?;
    
    // Get config files
    let config_files_result = super::config::list_config_files_internal(&project);
    let config_files = config_files_result.unwrap_or_default();
    
    // Generate CurseForge zip
    let output_path = std::env::temp_dir().join(format!("{}.zip", project.name.replace(' ', "_")));
    curseforge::CurseForgeExporter::export(&project, &mods, &config_files, &output_path)
        .map_err(|e| e.to_string())?;
    
    Ok(output_path.to_string_lossy().to_string())
}

// ─── FTB Quests Import/Export ───────────────────────────────────────────────

#[tauri::command]
pub async fn import_ftb_quests_from_dir(pack_dir: String) -> Result<crate::imports::ftb_quests::FtBQuestsImportResult, String> {
    // SNBT parse of a large pack can take a moment; keep it off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&pack_dir);
        crate::imports::ftb_quests::import_ftb_quests(path)
            .map_err(|e| format!("FTB Quests import failed: {}", e))
    })
    .await
    .map_err(|e| format!("FTB Quests import task failed: {e}"))?
}

#[tauri::command]
pub async fn import_ftb_quests_one_click(pack_dir: String) -> Result<crate::imports::ftb_quests::FtBQuestsImportResult, String> {
    // Same heavy parse as above, off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&pack_dir);
        // First try to find FTB Quests data in the pack
        let result = crate::imports::ftb_quests::import_ftb_quests(path)
            .map_err(|e| format!("FTB Quests import failed: {}", e))?;

        // If no quests found, try to auto-generate from mods
        if result.quest_count == 0 && result.chapter_count == 0 {
            // Could add auto-generation logic here in the future
            eprintln!("[ModCanvas] No FTB Quests data found at {}, returning empty graph", pack_dir);
        }

        Ok(result)
    })
    .await
    .map_err(|e| format!("FTB Quests import task failed: {e}"))?
}

#[tauri::command]
pub fn export_ftb_quests_to_dir(
    db: State<'_, Database>,
    project_id: String,
    output_dir: String,
) -> Result<(), String> {
    let graph = super::progression::get_quest_graph(db, project_id)?;
    let path = std::path::Path::new(&output_dir);
    crate::imports::ftb_quests::export_ftb_quests_snbt(&graph, path, &std::collections::HashMap::new())
        .map_err(|e| format!("FTB Quests export failed: {}", e))
}

/// Open a native file picker for a modpack file, returning the absolute path.
///
/// The `tauri-plugin-dialog` -> rfd pipeline is unreliable on Wayland: rfd's
/// gtk3 backend cannot map a dialog window on some compositors (e.g. COSMIC),
/// and its xdg-portal backend can silently hang when the portal's FileChooser
/// implementation never presents a window. This command bypasses both by
/// invoking a standalone GTK picker (`zenity`/`kdialog`) via subprocess, which
/// renders its own top-level window and works on Wayland. Falls back to
/// `kdialog` when zenity is absent; returns `None` when the user cancels.
#[tauri::command]
pub fn pick_import_file() -> Result<Option<String>, String> {
    let filters = "*.zip *.mrpack *.toml";

    let zenity = std::process::Command::new("zenity")
        .args(["--file-selection", "--title", "Select modpack file", "--file-filter", &format!("Modpack files | {filters}")])
        .output();

    let output = match zenity {
        Ok(o) => o,
        Err(_) => std::process::Command::new("kdialog")
            .args(["--getopenfilename", "/", "*.zip *.mrpack *.toml"])
            .output()
            .map_err(|e| format!("Failed to launch file picker (zenity/kdialog not found): {e}"))?,
    };

    if !output.status.success() {
        return Ok(None); // user cancelled
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        Ok(None)
    } else {
        Ok(Some(path))
    }
}
