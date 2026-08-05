use super::super::snbt_sidecar;
use super::super::types::FtBQuestsImportResult;
use super::json5::parse_json5_quest;
use super::quest::parse_snbt_quest;
use crate::imports::snbt::parse_snbt;
use crate::quest::*;
use anyhow::Result;
use std::path::Path;

// ─── Standalone Quest Files (SNBT) ─────────────────────────────────────────

/// Parse individual quest .snbt files in a chapter directory
pub(super) fn parse_standalone_quest_files(dir: &Path, chapter_id: &str, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) -> Result<usize> {
    let mut count = 0usize;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().map_or(false, |ext| ext == "snbt") {
                let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                if name == "chapter" || name == "data" {
                    continue;
                }
                // Check if this quest is already in the graph (from quests array in chapter.snbt)
                let content = std::fs::read_to_string(&p)?;
                if let Ok(snbt) = parse_snbt(&content) {
                    if snbt.as_compound().is_some() {
                        let quest_id = snbt.get_str("id").unwrap_or(name);
                        if graph.nodes.iter().any(|n| n.id == quest_id) {
                            continue;
                        }
                        // Store raw SNBT in sidecar for comment preservation
                        snbt_sidecar::store_quest(&mut result.sidecar, quest_id, &content);

                        let chapter_default = graph.chapters.iter().find(|c| c.id == chapter_id).map(|c| c.default_enabled).unwrap_or(true);
                        if let Ok(node) = parse_snbt_quest(&snbt.value, chapter_id, false, chapter_default, result) {
                            graph.nodes.push(node);
                            count += 1;
                        }
                    }
                }
            }
        }
    }
    result.stats.files_processed += 1;
    Ok(count)
}

// ─── Standalone Json5 Quest Files ──────────────────────────────────────────

pub(super) fn parse_standalone_json5_quest_files(dir: &Path, chapter_id: &str, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) -> Result<usize> {
    let mut count = 0usize;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                if ext != "json5" && ext != "json" { continue; }
                let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                if name == "chapter" || name == "data" { continue; }
                let content = std::fs::read_to_string(&p)?;
                let val: serde_json::Value = json5::from_str(&content)
                    .or_else(|_| serde_json::from_str(&content))?;
                if let Some(m) = val.as_object() {
                    let quest_id = m.get("id").and_then(|v| v.as_str()).unwrap_or(name);
                    if graph.nodes.iter().any(|n| n.id == quest_id) { continue; }
                    let chapter_default = graph.chapters.iter().find(|c| c.id == chapter_id).map(|c| c.default_enabled).unwrap_or(true);
                    if let Ok(node) = parse_json5_quest(m, chapter_id, chapter_default) {
                        graph.nodes.push(node);
                        count += 1;
                    }
                }
            }
        }
    }
    result.stats.files_processed += 1;
    Ok(count)
}
