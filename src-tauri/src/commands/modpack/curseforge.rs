use tauri::State;
use uuid::Uuid;
use std::path::PathBuf;

use crate::db::Database;
use crate::imports::{ImportResult, curseforge};
use crate::mod_intelligence::ModIntelligence;
use crate::models::*;

use super::{load_progression_from_pack, load_quest_from_pack, resolve_curseforge_api_key, try_deploy_companion};
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
