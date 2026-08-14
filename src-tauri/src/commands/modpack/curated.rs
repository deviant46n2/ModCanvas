//! Curated mod picks for the First-Pack wizard (roadmap §9.3 step 4): a short
//! "these go well together" list, filtered at request time to mods that
//! actually support the pack's loader and MC version. The list is content,
//! not logic — the filter is the logic, and it is pure + tested.

use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::mod_intelligence::ModIntelligence;
use crate::models::{ModLoader, ModMetadata};

use super::resolve_curseforge_api_key;

/// True when an available MC version covers the requested one: exact match,
/// or a major-version prefix (e.g. available "1.21" covers requested "1.21.1").
/// Moved here from the deleted search command — the curated filter was its
/// only surviving consumer, so one rule lives next to its one caller.
pub(crate) fn version_compatible(available: &str, requested: &str) -> bool {
    if available == requested {
        return true;
    }
    requested.starts_with(available) && requested[available.len()..].starts_with('.')
}

/// A curated pick the wizard can install in one click.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CuratedMod {
    pub source: String,
    pub mod_id: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    /// Pre-checked in the wizard — the "these go well together" defaults.
    pub ticked: bool,
    /// A ModCanvas feature backs this pick (quest book, recipe scripting);
    /// the wizard renders core picks in their own section.
    pub core: bool,
    /// When set, the pick is shown but flagged as unusable — a failed
    /// metadata fetch or a version/loader mismatch. The reason is rendered as
    /// a warning; CurseForge picks always install through Prism regardless.
    pub blocked_reason: Option<String>,
    /// Project page for manual download (the blocked box links it).
    pub page_url: Option<String>,
}

struct CuratedPick {
    /// Registry key: a Modrinth slug, or `curseforge:{id}` for CurseForge.
    key: &'static str,
    name: &'static str,
    description: &'static str,
    ticked: bool,
    core: bool,
    /// Project page for manual download — shown in the blocked box so a user
    /// whose CurseForge key is dead can still grab the jar by hand (s48).
    /// Empty = no manual-download link offered.
    page_url: &'static str,
}

/// Core picks first: ModCanvas's own editors write to FTB Quests (quests)
/// and KubeJS (recipes) — without them the wizard's template and the
/// recipe editor are invisible in-game. FTB Quests is CurseForge-only;
/// KubeJS is one Modrinth project covering all loaders through 1.21.1.
/// The rest are "goes great" picks. Loader/version filtering happens per
/// pack at request time; a pick that doesn't support the pack never shows.
const CURATED: &[CuratedPick] = &[
    CuratedPick { key: "curseforge:289412", name: "FTB Quests", description: "The quest book — ModCanvas's quest editor writes to it.", ticked: true, core: true, page_url: "https://www.curseforge.com/minecraft/mc-mods/ftb-quests" },
    CuratedPick { key: "kubejs", name: "KubeJS", description: "Lets ModCanvas write recipes your pack loads at launch.", ticked: true, core: true, page_url: "" },
    CuratedPick { key: "jei", name: "Just Enough Items", description: "See every item and recipe.", ticked: true, core: false, page_url: "" },
    CuratedPick { key: "jade", name: "Jade", description: "Block names and info at a glance.", ticked: true, core: false, page_url: "" },
    CuratedPick { key: "journeymap", name: "JourneyMap", description: "A live map of the world you've explored.", ticked: true, core: false, page_url: "" },
    CuratedPick { key: "appleskin", name: "AppleSkin", description: "Hunger and saturation in the HUD.", ticked: true, core: false, page_url: "" },
    CuratedPick { key: "mouse-tweaks", name: "Mouse Tweaks", description: "Drag items across inventories faster.", ticked: true, core: false, page_url: "" },
    CuratedPick { key: "sodium", name: "Sodium", description: "A big frame-rate boost (Fabric/Quilt).", ticked: true, core: false, page_url: "" },
    CuratedPick { key: "modmenu", name: "Mod Menu", description: "A mod list screen (Fabric/Quilt).", ticked: true, core: false, page_url: "" },
    CuratedPick { key: "controllable", name: "Controllable", description: "Play with a game controller.", ticked: false, core: false, page_url: "" },
];

/// Keep a pick only when the resolved metadata proves it compatible. Empty
/// `supported_loaders`/`supported_versions` mean "unknown", not "incompatible"
/// — the pack-health trust rule: never drop over a signal you can't prove.
fn pick_supported(meta: &ModMetadata, loader: &ModLoader, mc_version: &str) -> bool {
    let loader_ok = meta.supported_loaders.is_empty() || meta.supported_loaders.contains(loader);
    let version_ok = meta.supported_versions.is_empty()
        || meta.supported_versions.iter().any(|v| version_compatible(v, mc_version));
    loader_ok && version_ok
}

/// Pure filter: resolved metadata -> installable curated picks for this pack.
/// Picks whose metadata failed to resolve (registry down, unknown key) are
/// simply absent — never offered, never errored.
fn filter_curated(
    metadata: &[ModMetadata],
    loader: &ModLoader,
    mc_version: &str,
) -> Vec<CuratedMod> {
    let mut out = Vec::new();
    for pick in CURATED {
        let Some(meta) = metadata
            .iter()
            .find(|m| m.mod_id == pick.key || m.slug == pick.key)
        else {
            continue;
        };
        if !pick_supported(meta, loader, mc_version) {
            continue;
        }
        out.push(CuratedMod {
            source: "modrinth".to_string(),
            // The curseforge: prefix-stripping shape is gone with the search
            // installer (s54): filter_curated only ever sees Modrinth batch
            // metadata (curseforge: keys are excluded from modrinth_keys and
            // resolved separately in resolve_cf_pick), and the one-click
            // installer is Modrinth-only — a CF pick's id is never consumed
            // for a download.
            mod_id: meta.mod_id.clone(),
            slug: meta.slug.clone(),
            name: meta.name.clone(),
            description: pick.description.to_string(),
            ticked: pick.ticked,
            core: pick.core,
            blocked_reason: None,
            page_url: None,
        });
    }
    out
}

/// Map a CurseForge metadata-fetch failure to a beginner-actionable blocked
/// reason: a 403 means the stored key was rejected (not that the registry is
/// down). The raw error carries the status ("CurseForge API returned 403
/// Forbidden").
fn cf_block_reason(err: &str) -> String {
    if err.contains("403") {
        "CurseForge rejected your API key (403) — check it in Settings (gear icon)".to_string()
    } else {
        format!("CurseForge metadata fetch failed: {err}")
    }
}

#[tauri::command]
pub async fn list_curated_mods(
    db: State<'_, Database>,
    intelligence: State<'_, ModIntelligence>,
    project_id: String,
) -> Result<Vec<CuratedMod>, String> {
    let pid = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let project = db
        .get_project(&pid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let loader = match project.mod_loader {
        ModLoader::Fabric => ModLoader::Fabric,
        ModLoader::Quilt => ModLoader::Quilt,
        ModLoader::NeoForge => ModLoader::NeoForge,
        ModLoader::Forge => ModLoader::Forge,
        ModLoader::Vanilla => return Ok(Vec::new()),
    };

    let cf_key = resolve_curseforge_api_key(&db)?;

    // Modrinth picks: batch fetch (keyless).
    let modrinth_keys: Vec<String> = CURATED
        .iter()
        .filter(|c| !c.key.starts_with("curseforge:"))
        .map(|c| c.key.to_string())
        .collect();
    let metadata = intelligence
        .batch_get_metadata(&modrinth_keys, &loader.to_string(), &project.minecraft_version, None)
        .await;

    let mut out = filter_curated(&metadata, &loader, &project.minecraft_version);

    // The CurseForge pick is resolved DIRECTLY so its outcome is precise:
    // installable, or blocked with the exact reason. The old batch path
    // swallowed the fetch error into a silent absence — a core pick must
    // never vanish without telling the user why (s37: "FTB Quests missing").
    if let Some(pick) = CURATED.iter().find(|c| c.key.starts_with("curseforge:")) {
        out.push(resolve_cf_pick(&intelligence, pick, cf_key.as_deref(), &loader, &project.minecraft_version).await);
    }

    Ok(out)
}

fn blocked(pick: &CuratedPick, reason: &str) -> CuratedMod {
    CuratedMod {
        source: "curseforge".to_string(),
        mod_id: String::new(),
        slug: String::new(),
        name: pick.name.to_string(),
        description: pick.description.to_string(),
        ticked: false,
        core: pick.core,
        blocked_reason: Some(reason.to_string()),
        page_url: if pick.page_url.is_empty() { None } else { Some(pick.page_url.to_string()) },
    }
}

/// Resolve the single CurseForge pick with a visible outcome. Never silently
/// absent: a missing key, a failed fetch, or a version mismatch all surface
/// as a blocked row with the reason.
async fn resolve_cf_pick(
    intelligence: &ModIntelligence,
    pick: &CuratedPick,
    cf_key: Option<&str>,
    loader: &ModLoader,
    mc_version: &str,
) -> CuratedMod {
    let Some(key) = cf_key else {
        return blocked(pick, "needs a CurseForge API key — add one in Settings (gear icon)");
    };
    let cf_id: u64 = pick
        .key
        .strip_prefix("curseforge:")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    match intelligence.get_curseforge_mod_metadata(cf_id, key).await {
        Ok(meta) => {
            if !pick_supported(&meta, loader, mc_version) {
                return blocked(pick, &format!("no version for MC {mc_version} / {loader} in this mod's files"));
            }
            CuratedMod {
                source: "curseforge".to_string(),
                // Display/identity only (s54): CurseForge picks always install
                // through Prism — there is no in-app CF installer anymore, so
                // no installer-shaped id is required.
                mod_id: meta.mod_id.clone(),
                slug: meta.slug.clone(),
                name: meta.name.clone(),
                description: pick.description.to_string(),
                ticked: pick.ticked,
                core: pick.core,
                blocked_reason: None,
                page_url: None,
            }
        }
        Err(e) => blocked(pick, &cf_block_reason(&e.to_string())),
    }
}

#[cfg(test)]
#[path = "curated_tests.rs"]
mod curated_tests;
