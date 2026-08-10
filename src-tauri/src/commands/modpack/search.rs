use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::mod_intelligence::ModIntelligence;
use crate::models::*;

use super::resolve_curseforge_api_key;
use super::search_merge::merge_search_results;
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
        file_name: std::path::Path::new(&jar_path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string()),
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
    sources: Vec<String>,
    categories: Vec<String>,
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
) -> Result<Vec<ModMetadata>, String> {
    let loader_enum = match loader.as_str() {
        "Fabric" => ModLoader::Fabric,
        "Quilt" => ModLoader::Quilt,
        "NeoForge" => ModLoader::NeoForge,
        _ => ModLoader::Forge,
    };

    eprintln!("[ModCanvas] search_mods: query={query:?} loader={loader} mc={mc_version} sources={sources:?} categories={categories:?}");

    let mut results = Vec::new();

    // Search every selected source. Per-source failures are tolerated (logged,
    // not fatal) so one registry being down or unkeyed never blanks the whole
    // tab. Unknown source strings pass through active_sources and are skipped
    // by the match's default arm, not errors — that is the seam a future
    // source (e.g. FTB) plugs into: a new match arm + adapter call.
    for source in active_sources(&sources, &categories) {
        match source.as_str() {
            "modrinth" => {
                match intelligence.search_modrinth(&query, loader_enum.clone(), &mc_version, &categories).await {
                    Ok(mut mods) => results.append(&mut mods),
                    Err(e) => eprintln!("[ModCanvas] Modrinth mod search failed: {}", e),
                }
            }
            "curseforge" => {
                // See active_sources: CurseForge is already excluded when a
                // category filter is active (the category facet is
                // Modrinth-only — unfiltered CF results would make the filter
                // look broken). The frontend shows the pause via
                // CategorySourceHint.
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
            other => eprintln!("[ModCanvas] Unknown search source: {other}"),
        }
    }

    // Cross-source merge: stable sort (mismatches sink, registry relevance
    // survives), dedup by mod_id, then the exact-match lift — a result whose
    // slug equals the query rises above loose matches from any registry
    // (s33: 'matching results not at top'). See search_merge.rs.
    results = merge_search_results(results, &query);

    Ok(results)
}
/// Which of the selected sources are actually searchable for this request.
/// CurseForge is paused while a category filter is active: the category facet
/// is Modrinth-only (ef53cd8), so unfiltered CF results mixed into a category
/// search would make the filter look broken. Unknown sources pass through —
/// the match's default arm logs and skips them, keeping the future-source
/// seam intact. Normalizes case so "CurseForge"/"Modrinth" match.
fn active_sources(sources: &[String], categories: &[String]) -> Vec<String> {
    let category_active = !categories.is_empty();
    sources
        .iter()
        .map(|s| s.to_lowercase())
        .filter(|s| !(s == "curseforge" && category_active))
        .collect()
}

/// True when an available MC version covers the requested one: exact match,
/// or a major-version prefix (e.g. available "1.21" covers requested "1.21.1").
/// Shared with the curated-mod filter (curated.rs) — one rule, one source.
pub(crate) fn version_compatible(available: &str, requested: &str) -> bool {
    if available == requested {
        return true;
    }
    requested.starts_with(available) && requested[available.len()..].starts_with('.')
}

#[cfg(test)]
mod tests {
    use super::{active_sources, version_compatible};

    fn ss(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn exact_match_is_compatible() {
        assert!(version_compatible("1.21.1", "1.21.1"));
    }

    #[test]
    fn both_sources_active_without_category() {
        let sources = active_sources(&ss(&["modrinth", "curseforge"]), &[]);
        assert_eq!(sources, ss(&["modrinth", "curseforge"]));
    }

    #[test]
    fn curseforge_paused_when_category_active() {
        // The ef53cd8 regression: a category filter is Modrinth-only, so CF
        // must not be queried — unfiltered CF results made the filter look
        // broken.
        let sources = active_sources(&ss(&["modrinth", "curseforge"]), &ss(&["technology"]));
        assert_eq!(sources, ss(&["modrinth"]));
    }

    #[test]
    fn curseforge_only_with_category_yields_nothing() {
        let sources = active_sources(&ss(&["curseforge"]), &ss(&["technology"]));
        assert!(sources.is_empty());
    }

    #[test]
    fn unknown_sources_pass_through_for_the_default_arm() {
        // The future-source seam: unknown sources are NOT dropped here — the
        // match's default arm logs and skips them.
        let sources = active_sources(&ss(&["modrinth", "ftb"]), &[]);
        assert_eq!(sources, ss(&["modrinth", "ftb"]));
    }

    #[test]
    fn source_case_is_normalized() {
        let sources = active_sources(&ss(&["Modrinth", "CurseForge"]), &[]);
        assert_eq!(sources, ss(&["modrinth", "curseforge"]));
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
