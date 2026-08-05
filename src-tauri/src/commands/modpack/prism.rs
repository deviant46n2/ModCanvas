use tauri::State;

use crate::db::Database;
use crate::path_safety::atomic_write_str;

use super::resolve_curseforge_api_key;
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
