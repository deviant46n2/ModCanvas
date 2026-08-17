// Pack Index (P1-PACKINDEX, roadmap §7.3) — a DERIVED, read-mostly reference
// spine over the existing scans. Never authoritative, never write-through;
// the editors stay the source of truth for their own content. Canonical keys
// are the repo's existing stable ID forms (§8.3.1): items `ns:path`, tags
// `#ns:path`, recipes `ns:name`, quests the graph's opaque node ids.
//
// Scope (s44 + s67): items + recipes (output + ingredients, shaped `key`
// included) + quests (rewards) + tags (canonical ids + expanded members), all
// inverted into back-references with dead references reported as named
// findings. Consumers — Pack Health Tier 2, "where is this used" in editors —
// are follow-ups; the load-path placement ("materialized before health, never
// on-demand inside a recompute", roadmap §8.3.1 item 2) is a consumer
// decision, not this module's.

pub mod build;
pub mod invert;
pub mod models;

#[cfg(test)]
mod build_tests;

use crate::pack_index::models::PackIndex;
use serde::Serialize;

/// Build and return the derived Pack Index for a project. The caller owns
/// project/instance identity; this command resolves both from the id.
#[tauri::command]
pub fn get_pack_index(
    db: tauri::State<'_, crate::db::Database>,
    project_id: String,
    kubejs_namespace: Option<String>,
) -> Result<PackIndex, String> {
    let pid = uuid::Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let project = db
        .get_project(&pid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    let index = build::build_pack_index(
        &project_id,
        std::path::Path::new(&project.path),
        kubejs_namespace.as_deref().unwrap_or("kubejs"),
    );
    Ok(index)
}
