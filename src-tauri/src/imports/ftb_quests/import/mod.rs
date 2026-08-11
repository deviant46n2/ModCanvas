use super::detect::{detect_format, detect_layout};
use super::types::{FtBQuestsImportResult, ImportStats, ImportIssue, IssueSeverity, IssueCategory};
use crate::quest::*;
use anyhow::Result;
use std::path::Path;

mod chapter;
mod chapter_json5;
mod edges;
mod global;
mod helpers;
mod json5;
mod layout;
mod quest;
mod reward;
mod reward_tables;
mod standalone;
mod task;

pub use helpers::{parse_chapter_titles, parse_group_titles, parse_lang_titles};
pub(crate) use helpers::LangTitles;

#[cfg(test)]
mod tests;

use edges::build_dependency_edges;
use global::{infer_minecraft_version, parse_global_settings};
use helpers::find_quests_dir;
use layout::dispatch_layout;
use reward_tables::parse_reward_tables;

/// Import FTB Quests from a directory (auto-detects format) with detailed reporting
pub fn import_ftb_quests(pack_dir: &Path) -> Result<FtBQuestsImportResult> {
    let mut result = FtBQuestsImportResult::default();
    
    // FTB Quests data can be at:
    //   <pack_dir>/config/ftbquests/quests/    (modpack config)
    //   <pack_dir>/world/ftbquests/            (server world data)
    //   <pack_dir>/ftbquests/                  (direct)
    //   <pack_dir>/                            (direct if contains data.snbt)
    let quests_dir = match find_quests_dir(pack_dir) {
        Some(dir) => dir,
        None => return Ok(FtBQuestsImportResult {
            issues: vec![ImportIssue {
                severity: IssueSeverity::Error,
                category: IssueCategory::ParseError,
                message: format!("No FTB Quests data found in {}", pack_dir.display()),
                file: None,
                node_id: None,
            }],
            ..Default::default()
        }),
    };

    let format = detect_format(&quests_dir);
    let layout = detect_layout(&quests_dir);
    result.format = format!("{:?}", format);
    result.layout = format!("{:?}", layout);
    
    eprintln!("[ModCanvas] FTB Quests format: {:?}, layout: {:?} at {}", format, layout, quests_dir.display());

    let mut graph = QuestGraph::new("", "FTB Quests Import");
    graph.layout = format!("{:?}", layout);

    // Parse global settings and detect version
    if let Some(version) = parse_global_settings(&quests_dir, format, &mut graph, &mut result)? {
        result.ftb_quests_version = Some(version);
    }
    
    // Infer Minecraft version from format
    result.minecraft_version = Some(infer_minecraft_version(format, &result.ftb_quests_version));

    let unknown_task_types = Vec::new();
    let unknown_reward_types = Vec::new();

    // Parse language files (chapter & group titles are stored in lang/ rather than chapter files)
    let lang_titles = parse_lang_titles(&quests_dir);
    let (chapter_count, quest_count, files_processed, files_failed) =
        dispatch_layout(&quests_dir, format, layout, &mut graph, &mut result, &lang_titles)?;
    // Parse reward tables (weighted pools referenced by random/choice/all-table rewards)
    // Must run before dependency edges so table_id references can resolve to graph nodes.
    parse_reward_tables(&quests_dir, format, &mut graph, &mut result);

    // Build dependency edges from quest dependency fields
    let deps_resolved = build_dependency_edges(&mut graph, &mut result);

    // Collect stats
    let tasks_parsed: usize = graph.nodes.iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest))
        .map(|n| n.objectives.len())
        .sum();
    let rewards_parsed: usize = graph.nodes.iter()
        .filter(|n| matches!(n.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest))
        .map(|n| n.rewards.len())
        .sum();

    // Log sample icons for debugging
    let sample_icons: Vec<&str> = graph.nodes.iter()
        .filter(|n| !matches!(n.node_type, QuestNodeType::Chapter) && !n.icon.is_empty())
        .take(10)
        .map(|n| n.icon.as_str())
        .collect();
    eprintln!("[ModCanvas] FTB Quests import: {} chapters, {} quests", chapter_count, quest_count);
    eprintln!("[ModCanvas] Sample icons: {:?}", sample_icons);
    let total_with_icon = graph.nodes.iter().filter(|n| !matches!(n.node_type, QuestNodeType::Chapter) && !n.icon.is_empty()).count();
    let total_no_icon = graph.nodes.iter().filter(|n| n.icon.is_empty() && !matches!(n.node_type, QuestNodeType::Chapter)).count();
    eprintln!("[ModCanvas] Quests with icon: {}, without icon: {}", total_with_icon, total_no_icon);

    // Order chapters and groups by in-game order_index so the editor and exports match the game
    graph.chapters.sort_by_key(|c| c.order_index);
    graph.chapter_groups.sort_by_key(|g| g.order_index);

    result.graph = graph;
    result.quest_count = quest_count;
    result.chapter_count = chapter_count;
    result.stats = ImportStats {
        quests_parsed: quest_count,
        chapters_parsed: chapter_count,
        chapter_groups_parsed: result.graph.chapter_groups.len(),
        tasks_parsed,
        rewards_parsed,
        dependencies_resolved: deps_resolved,
        dependencies_missing: result.issues.iter().filter(|i| i.category == IssueCategory::MissingDependency).count(),
        unknown_task_types: unknown_task_types.clone(),
        unknown_reward_types: unknown_reward_types.clone(),
        files_processed,
        files_failed,
        title_from_task: result.stats.title_from_task,
        icon_from_task: result.stats.icon_from_task,
        chapter_images_total: result.stats.chapter_images_total,
    };

    // Add summary issues
    if result.stats.dependencies_missing > 0 {
        result.issues.push(ImportIssue {
            severity: IssueSeverity::Warning,
            category: IssueCategory::MissingDependency,
            message: format!("{} quest dependencies could not be resolved", result.stats.dependencies_missing),
            file: None,
            node_id: None,
        });
    }
    if files_failed > 0 {
        result.issues.push(ImportIssue {
            severity: IssueSeverity::Warning,
            category: IssueCategory::ParseError,
            message: format!("{} file(s) failed to parse", files_failed),
            file: None,
            node_id: None,
        });
    }
    if !unknown_task_types.is_empty() {
        result.issues.push(ImportIssue {
            severity: IssueSeverity::Info,
            category: IssueCategory::UnsupportedType,
            message: format!("Unknown task types encountered: {}", unknown_task_types.join(", ")),
            file: None,
            node_id: None,
        });
    }
    if !unknown_reward_types.is_empty() {
        result.issues.push(ImportIssue {
            severity: IssueSeverity::Info,
            category: IssueCategory::UnsupportedType,
            message: format!("Unknown reward types encountered: {}", unknown_reward_types.join(", ")),
            file: None,
            node_id: None,
        });
    }

    Ok(result)
}
