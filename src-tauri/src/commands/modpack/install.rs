use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::mod_intelligence::ModIntelligence;
use crate::models::*;

/// Download a mod from Modrinth into the selected instance's `mods/` folder
/// and record it in the project DB so Prism/the game can load it. Returns the
/// resulting `ModEntry` (with real jar-derived metadata when the downloaded
/// jar exposes it).
///
/// PRISM-LEAN (s53/s54): the one-click installer is Modrinth-only. CurseForge
/// installs execute in Prism, which parses CF dependencies ModCanvas cannot
/// see — a keyless CF one-click would install a broken mod (e.g. FTB Quests
/// without its three required deps).
#[tauri::command]
pub async fn install_modrinth_mod(
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
    project_id: String,
    mod_id: String,
    slug: String,
    name: String,
    author: Option<String>,
    description: Option<String>,
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

    let jar_path = intelligence
        .download_mod(&mod_id, version.as_deref(), &loader, &mc_version, &mods_dir)
        .await
        .map_err(|e| format!("Modrinth download failed: {e}"))?;

    // Prefer metadata extracted from the downloaded jar so the DB row carries
    // the real mod id / version / description / icon. Fall back to the
    // provided metadata when the jar doesn't expose it.
    let jar_info = crate::shared::extract_mod_info_from_jar(std::path::Path::new(&jar_path))
        .map_err(|e| format!("Failed to inspect downloaded jar: {e}"))?;

    let author = author.unwrap_or_default();
    let description = description.unwrap_or_default();

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
        source: ModSource::Modrinth,
        enabled: true,
        added_at: chrono::Utc::now(),
        icon: real_icon,
        file_name: std::path::Path::new(&jar_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string()),
    };

    db.add_mod(&entry).map_err(|e| e.to_string())?;
    eprintln!(
        "[ModCanvas] Installed modrinth:{} -> {} ({})",
        mod_id, entry.name, jar_path
    );
    Ok(entry)
}
