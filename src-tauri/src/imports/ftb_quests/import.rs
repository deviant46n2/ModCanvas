use super::types::{SnbtMapHelper, FtBQuestsFormat, FtBQuestsLayout, FtBQuestsImportResult, ImportStats, ImportIssue, IssueSeverity, IssueCategory};
use super::detect::{detect_format, detect_layout};
use crate::imports::snbt::{SnbtValue, CommentedSnbt, parse_snbt};
use crate::quest::*;
use anyhow::{Result, Context};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Locate the FTB Quests data directory within a pack
fn find_quests_dir(pack_dir: &Path) -> Option<PathBuf> {
    let candidates = [
        pack_dir.join("config").join("ftbquests").join("quests"),
        pack_dir.join("world").join("ftbquests"),
        pack_dir.join("ftbquests").join("quests"),
        pack_dir.join("ftbquests"),
    ];
    for c in &candidates {
        if c.exists() && c.is_dir() {
            return Some(c.clone());
        }
    }
    // Check if pack_dir itself contains data.snbt / data.json5
    if pack_dir.join("data.snbt").exists() || pack_dir.join("data.json5").exists() {
        return Some(pack_dir.to_path_buf());
    }
    None
}

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

    // Parse global settings and detect version
    if let Some(version) = parse_global_settings(&quests_dir, format, &mut graph, &mut result)? {
        result.ftb_quests_version = Some(version);
    }
    
    // Infer Minecraft version from format
    result.minecraft_version = Some(infer_minecraft_version(format, &result.ftb_quests_version));

    let mut chapter_count = 0usize;
    let mut quest_count = 0usize;
    let mut files_processed = 0usize;
    let mut files_failed = 0usize;
    let mut unknown_task_types = Vec::new();
    let mut unknown_reward_types = Vec::new();

    // Parse language files (chapter & group titles are stored in lang/ rather than chapter files)
    let lang_titles = parse_lang_titles(&quests_dir);

    match layout {
        FtBQuestsLayout::Subdirs => {
            // New layout: quests_dir/<chapter_dir>/chapter.snbt
            if let Ok(entries) = std::fs::read_dir(&quests_dir) {
                for entry in entries.flatten() {
                    let dir_path = entry.path();
                    if !dir_path.is_dir() { continue; }

                    match format {
                        FtBQuestsFormat::Snbt => {
                            let chapter_file = dir_path.join("chapter.snbt");
                            if !chapter_file.exists() { continue; }
                            files_processed += 1;
                            match parse_snbt_chapter_file(&chapter_file, &mut graph, &mut result, &lang_titles) {
                                Ok((quests_in_chapter, chapter_id)) => {
                                    chapter_count += 1;
                                    quest_count += quests_in_chapter;
                                    quest_count += parse_standalone_quest_files(&dir_path, &chapter_id, &mut graph, &mut result)?;
                                }
                                Err(e) => {
                                    files_failed += 1;
                                    result.issues.push(ImportIssue {
                                        severity: IssueSeverity::Error,
                                        category: IssueCategory::ParseError,
                                        message: format!("Failed to parse chapter: {}", e),
                                        file: Some(chapter_file.display().to_string()),
                                        node_id: None,
                                    });
                                    eprintln!("[ModCanvas] Failed to parse chapter {}: {}", dir_path.display(), e);
                                }
                            }
                        }
                        FtBQuestsFormat::Json5 => {
                            let chapter_file = if dir_path.join("chapter.json5").exists() {
                                dir_path.join("chapter.json5")
                            } else if dir_path.join("chapter.json").exists() {
                                dir_path.join("chapter.json")
                            } else { continue; };
                            files_processed += 1;
                            match parse_json5_chapter_file(&chapter_file, &mut graph, &mut result, &lang_titles) {
                                Ok((quests_in_chapter, chapter_id)) => {
                                    chapter_count += 1;
                                    quest_count += quests_in_chapter;
                                    quest_count += parse_standalone_json5_quest_files(&dir_path, &chapter_id, &mut graph, &mut result)?;
                                }
                                Err(e) => {
                                    files_failed += 1;
                                    result.issues.push(ImportIssue {
                                        severity: IssueSeverity::Error,
                                        category: IssueCategory::ParseError,
                                        message: format!("Failed to parse chapter: {}", e),
                                        file: Some(chapter_file.display().to_string()),
                                        node_id: None,
                                    });
                                    eprintln!("[ModCanvas] Failed to parse chapter {}: {}", dir_path.display(), e);
                                }
                            }
                        }
                    }
                }
            }
        }
        FtBQuestsLayout::FlatChapters => {
            // Old layout: quests_dir/chapters/*.snbt (or *.json5)
            let chapters_dir = quests_dir.join("chapters");
            // Parse chapter_groups.snbt for ordering if present
            parse_chapter_groups(&quests_dir, format, &mut graph, &mut result, &lang_titles);
            if let Ok(entries) = std::fs::read_dir(&chapters_dir) {
                for entry in entries.flatten() {
                    let file_path = entry.path();
                    if !file_path.is_file() { continue; }
                    let ext = file_path.extension().unwrap_or_default();
                    if ext != "snbt" && ext != "json5" && ext != "json" { continue; }

                    let parse_result = match format {
                        FtBQuestsFormat::Snbt if ext == "snbt" => {
                            files_processed += 1;
                            parse_snbt_chapter_file(&file_path, &mut graph, &mut result, &lang_titles)
                        }
                        FtBQuestsFormat::Json5 if ext == "json5" || ext == "json" => {
                            files_processed += 1;
                            parse_json5_chapter_file(&file_path, &mut graph, &mut result, &lang_titles)
                        }
                        _ => continue,
                    };
                    match parse_result {
                        Ok((quests_in_chapter, _chapter_id)) => {
                            chapter_count += 1;
                            quest_count += quests_in_chapter;
                        }
                        Err(e) => {
                            files_failed += 1;
                            result.issues.push(ImportIssue {
                                severity: IssueSeverity::Error,
                                category: IssueCategory::ParseError,
                                message: format!("Failed to parse chapter: {}", e),
                                file: Some(file_path.display().to_string()),
                                node_id: None,
                            });
                            eprintln!("[ModCanvas] Failed to parse chapter {}: {}", file_path.display(), e);
                        }
                    }
                }
            }
        }
        FtBQuestsLayout::Flat => {
            // Very old layout: *.snbt directly in quests_dir
            parse_chapter_groups(&quests_dir, format, &mut graph, &mut result, &lang_titles);
            if let Ok(entries) = std::fs::read_dir(&quests_dir) {
                for entry in entries.flatten() {
                    let file_path = entry.path();
                    if !file_path.is_file() { continue; }
                    let name = file_path.file_name().unwrap_or_default().to_string_lossy();
                    if name == "data.snbt" || name == "data.json5" || name == "data.json"
                        || name == "chapter_groups.snbt" || name == "chapter_groups.json5" {
                        continue;
                    }
                    let ext = file_path.extension().unwrap_or_default();
                    if ext != "snbt" && ext != "json5" && ext != "json" { continue; }

                    let parse_result = match format {
                        FtBQuestsFormat::Snbt if ext == "snbt" => {
                            files_processed += 1;
                            parse_snbt_chapter_file(&file_path, &mut graph, &mut result, &lang_titles)
                        }
                        FtBQuestsFormat::Json5 if ext == "json5" || ext == "json" => {
                            files_processed += 1;
                            parse_json5_chapter_file(&file_path, &mut graph, &mut result, &lang_titles)
                        }
                        _ => continue,
                    };
                    match parse_result {
                        Ok((quests_in_chapter, _chapter_id)) => {
                            chapter_count += 1;
                            quest_count += quests_in_chapter;
                        }
                        Err(e) => {
                            files_failed += 1;
                            result.issues.push(ImportIssue {
                                severity: IssueSeverity::Error,
                                category: IssueCategory::ParseError,
                                message: format!("Failed to parse chapter: {}", e),
                                file: Some(file_path.display().to_string()),
                                node_id: None,
                            });
                            eprintln!("[ModCanvas] Failed to parse chapter {}: {}", file_path.display(), e);
                        }
                    }
                }
            }
        }
    }

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

/// Infer Minecraft version from FTB Quests format and version
fn infer_minecraft_version(format: FtBQuestsFormat, ftb_version: &Option<String>) -> String {
    match format {
        FtBQuestsFormat::Json5 => {
            // Json5 format was introduced in FTB Quests 1800+ (1.20.5+)
            if let Some(v) = ftb_version {
                if let Some(major) = v.split('.').next() {
                    if let Ok(major_num) = major.parse::<u32>() {
                        if major_num >= 26 {
                            return "1.20.5+".to_string();
                        }
                    }
                }
            }
            "1.20.5+".to_string()
        }
        FtBQuestsFormat::Snbt => {
            // SNBT format is older
            if let Some(v) = ftb_version {
                if let Some(major) = v.split('.').next() {
                    if let Ok(major_num) = major.parse::<u32>() {
                        if major_num >= 20 {
                            return "1.20.x".to_string();
                        } else if major_num >= 18 {
                            return "1.19.x".to_string();
                        } else if major_num >= 16 {
                            return "1.18.x".to_string();
                        }
                    }
                }
            }
            "1.16.x-1.19.x".to_string()
        }
    }
}

// ─── Global Settings ───────────────────────────────────────────────────────

/// Parse global settings and return FTB Quests version if available
fn parse_global_settings(quests_dir: &Path, format: FtBQuestsFormat, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) -> Result<Option<String>> {
    match format {
        FtBQuestsFormat::Snbt => {
            let data_file = quests_dir.join("data.snbt");
            if !data_file.exists() { return Ok(None); }
            let content = std::fs::read_to_string(&data_file)?;
            let snbt = parse_snbt(&content)?;
            if let Some(shape) = snbt.get_str("default_quest_shape") {
                graph.default_quest_shape = QuestShape::from_string(shape);
            }
            if let Some(mode) = snbt.get_str("progression_mode") {
                graph.book_progression_mode = QuestProgressionMode::from_string(mode);
            }
            if let Some(gs) = snbt.get_f64("grid_scale") {
                graph.grid_scale = gs;
            }
            if let Some(v) = snbt.get_bool("default_reward_team") {
                graph.default_reward_team = v;
            }
            if let Some(v) = snbt.get_bool("default_consume_items") {
                graph.default_consume_items = v;
            }
            if let Some(v) = snbt.get_str("default_autoclaim_rewards") {
                graph.default_autoclaim_rewards = v.to_string();
            }
            if let Some(v) = snbt.get_i64("detection_delay") {
                graph.detection_delay = v as i32;
            }
            // Try to get version
            let version = snbt.get_str("version")
                .or_else(|| snbt.get_str("Version"))
                .map(|s| s.to_string());
            result.stats.files_processed += 1;
            Ok(version)
        }
        FtBQuestsFormat::Json5 => {
            let data_file = if quests_dir.join("data.json5").exists() {
                quests_dir.join("data.json5")
            } else {
                quests_dir.join("data.json")
            };
            if !data_file.exists() { return Ok(None); }
            let content = std::fs::read_to_string(&data_file)?;
            let val: serde_json::Value = json5::from_str(&content)
                .or_else(|_| serde_json::from_str(&content))?;
            if let Some(shape) = val.get("default_quest_shape").and_then(|v| v.as_str()) {
                graph.default_quest_shape = QuestShape::from_string(shape);
            }
            if let Some(mode) = val.get("progression_mode").and_then(|v| v.as_str()) {
                graph.book_progression_mode = QuestProgressionMode::from_string(mode);
            }
            if let Some(v) = val.get("grid_scale").and_then(|v| v.as_f64()) {
                graph.grid_scale = v;
            }
            if let Some(v) = val.get("default_reward_team").and_then(|v| v.as_bool()) {
                graph.default_reward_team = v;
            }
            if let Some(v) = val.get("default_consume_items").and_then(|v| v.as_bool()) {
                graph.default_consume_items = v;
            }
            if let Some(v) = val.get("default_autoclaim_rewards").and_then(|v| v.as_str()) {
                graph.default_autoclaim_rewards = v.to_string();
            }
            if let Some(v) = val.get("detection_delay").and_then(|v| v.as_i64()) {
                graph.detection_delay = v as i32;
            }
            let version = val.get("version")
                .or_else(|| val.get("Version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            result.stats.files_processed += 1;
            Ok(version)
        }
    }
}

// ─── Chapter Groups ────────────────────────────────────────────────────────

/// Parse chapter_groups.snbt/json5 for chapter ordering
fn parse_chapter_groups(quests_dir: &Path, format: FtBQuestsFormat, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult, lang_titles: &LangTitles) {
    match format {
        FtBQuestsFormat::Snbt => {
            let file = quests_dir.join("chapter_groups.snbt");
            if !file.exists() { return; }
            if let Ok(content) = std::fs::read_to_string(&file) {
                if let Ok(snbt) = parse_snbt(&content) {
                    if let Some(groups) = snbt.get("chapter_groups").and_then(|v| v.as_list()) {
                        for (i, g) in groups.iter().enumerate() {
                            if let Some(m) = g.as_compound() {
                                let id = m.get_str("id").unwrap_or("").to_string();
                                let title = m.get_str("title")
                                    .map(|s| s.to_string())
                                    .filter(|t| !t.is_empty())
                                    .or_else(|| lang_titles.chapter_group.get(&id).cloned())
                                    .unwrap_or_else(|| id.clone());
                                if !id.is_empty() && !graph.chapter_groups.iter().any(|cg| cg.id == id) {
                                    graph.chapter_groups.push(QuestChapterGroup {
                                        id,
                                        title,
                                        order_index: i as i32,
                                        ..Default::default()
                                    });
                                }
                            }
                        }
                    }
                }
            }
            result.stats.files_processed += 1;
        }
        FtBQuestsFormat::Json5 => {
            let file = if quests_dir.join("chapter_groups.json5").exists() {
                quests_dir.join("chapter_groups.json5")
            } else {
                quests_dir.join("chapter_groups.json")
            };
            if !file.exists() { return; }
            if let Ok(content) = std::fs::read_to_string(&file) {
                if let Ok(val) = json5::from_str::<serde_json::Value>(&content)
                    .or_else(|_| serde_json::from_str(&content))
                {
                    if let Some(groups) = val.get("chapter_groups").and_then(|v| v.as_array()) {
                        for (i, g) in groups.iter().enumerate() {
                            let id = g.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let title = g.get("title")
                                .and_then(|v| v.as_str())
                                .filter(|t| !t.is_empty())
                                .map(|s| s.to_string())
                                .or_else(|| lang_titles.chapter_group.get(&id).cloned())
                                .unwrap_or_else(|| id.clone());
                            if !id.is_empty() && !graph.chapter_groups.iter().any(|cg| cg.id == id) {
                                graph.chapter_groups.push(QuestChapterGroup {
                                    id,
                                    title,
                                    order_index: i as i32,
                                    ..Default::default()
                                });
                            }
                        }
                    }
                }
            }
            result.stats.files_processed += 1;
        }
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/// Extract icon string from SNBT value (handles both string and compound forms)
fn extract_icon_str(m: &SnbtValue) -> String {
    if let Some(s) = m.get_str("icon") {
        return s.to_string();
    }
    // Old format: icon is a compound { id: "...", components: {...} }
    if let Some(icon_val) = m.get("icon") {
        if let Some(icon_m) = icon_val.as_compound() {
            let id = icon_m.get_str("id").unwrap_or("").to_string();
            // ftbquests:custom_icon uses nested components for the actual texture
            if id == "ftbquests:custom_icon" {
                if let Some(components) = icon_m.get("components") {
                    if let Some(comp_m) = components.as_compound() {
                        // The actual item texture is stored under "ftbquests:icon"
                        // It can be a string like "ae2:block/cell_workbench_top"
                        // or a compound like { id: "minecraft:diamond" }
                        if let Some(icon_ref) = comp_m.get_str("ftbquests:icon") {
                            let resolved = resolve_ftbquests_icon(icon_ref);
                            if !resolved.is_empty() {
                                return resolved;
                            }
                        } else if let Some(icon_comp) = comp_m.get("ftbquests:icon") {
                            if let Some(icon_cm) = icon_comp.as_compound() {
                                if let Some(inner_id) = icon_cm.get_str("id") {
                                    return inner_id.to_string();
                                }
                            }
                        }
                    }
                }
                return id;
            }
            if !id.is_empty() {
                return id;
            }
            // Last resort: check for nested icon compound
            if let Some(nested) = icon_m.get("icon") {
                if let Some(nested_m) = nested.as_compound() {
                    if let Some(nested_id) = nested_m.get_str("id") {
                        return nested_id.to_string();
                    }
                }
            }
        }
    }
    String::new()
}

/// Resolve an FTB Quests icon reference (e.g. "ae2:block/cell_workbench_top") to an item/block ID
fn resolve_ftbquests_icon(icon_ref: &str) -> String {
    // Handle bare paths without namespace (e.g. "diamond", "stone")
    if !icon_ref.contains(':') {
        return format!("minecraft:{}", icon_ref);
    }
    let parts: Vec<&str> = icon_ref.splitn(2, ':').collect();
    if parts.len() != 2 { return String::new(); }
    let namespace = parts[0];
    let raw_path = parts[1];
    // Strip common prefixes like "textures/item/" or "textures/block/"
    let clean = raw_path
        .strip_prefix("textures/item/").or_else(|| raw_path.strip_prefix("textures/block/"))
        .unwrap_or(raw_path)
        .strip_suffix(".png").unwrap_or(raw_path);
    // Determine if it's a block or item reference
    if clean.starts_with("block/") {
        format!("{}:{}", namespace, &clean[6..])
    } else if clean.starts_with("item/") {
        format!("{}:{}", namespace, &clean[5..])
    } else {
        format!("{}:{}", namespace, clean)
    }
}

// ─── Language File Parser ───────────────────────────────────────────────────

/// Parse language files in quests/lang/ to extract chapter UUID → title mapping.
/// Titles resolved from the pack's language files.
#[derive(Default)]
pub(crate) struct LangTitles {
    /// `chapter.{uuid}.title` -> readable chapter title
    pub chapter: HashMap<String, String>,
    /// `chapter_group.{uuid}.title` -> readable group title
    pub chapter_group: HashMap<String, String>,
}

/// Scan `quests/lang/**` and collect both chapter and chapter-group titles.
/// `en_us` files are scanned first so they win over other locales.
pub fn parse_lang_titles(quests_dir: &Path) -> LangTitles {
    let mut titles = LangTitles::default();
    for (category, uuid, title) in collect_lang_title_entries(quests_dir) {
        let map = match category.as_str() {
            "chapter" => &mut titles.chapter,
            "chapter_group" => &mut titles.chapter_group,
            _ => continue,
        };
        map.entry(uuid).or_insert(title);
    }
    titles
}

/// Language files use keys like `chapter.{uuid}.title`.
pub fn parse_chapter_titles(quests_dir: &Path) -> HashMap<String, String> {
    parse_lang_titles(quests_dir).chapter
}

/// Language files use keys like `chapter_group.{uuid}.title` for groups.
pub fn parse_group_titles(quests_dir: &Path) -> HashMap<String, String> {
    parse_lang_titles(quests_dir).chapter_group
}

fn collect_lang_title_entries(quests_dir: &Path) -> Vec<(String, String, String)> {
    let lang_dir = quests_dir.join("lang");
    let mut entries: Vec<(String, String, String)> = Vec::new();

    fn collect_lang_files(dir: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    collect_lang_files(&path, files)?;
                } else if path.extension().map_or(false, |ext| ext == "snbt") {
                    files.push(path);
                }
            }
        }
        Ok(())
    }

    let mut lang_files: Vec<PathBuf> = Vec::new();
    let _ = collect_lang_files(&lang_dir, &mut lang_files);

    // Prefer en_us first, then any other language - check if path contains "en_us"
    lang_files.sort_by_key(|p| {
        let path_str = p.to_string_lossy().to_string();
        if path_str.contains("/en_us/") || path_str.contains("\\en_us\\") { 0 } else { 1 }
    });

    for lang_file in lang_files {
        if let Ok(content) = std::fs::read_to_string(&lang_file) {
            if let Ok(ref snbt) = parse_snbt(&content) {
                if let Some(compound) = snbt.as_compound() {
                    for (key, val) in compound {
                        let Some(title) = val.as_str() else { continue };
                        for prefix in ["chapter.", "chapter_group."] {
                            if let Some(uuid) = key.strip_prefix(prefix).and_then(|k| k.strip_suffix(".title")) {
                                entries.push((
                                    prefix.trim_end_matches('.').to_string(),
                                    uuid.to_string(),
                                    title.to_string(),
                                ));
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    entries
}

// ─── Chapter Image Parser ───────────────────────────────────────────────────

fn parse_chapter_image(val: &SnbtValue) -> ChapterImage {
    ChapterImage {
        x: val.get_f64("x").unwrap_or(0.0),
        y: val.get_f64("y").unwrap_or(0.0),
        width: val.get_f64("width").unwrap_or(1.0),
        height: val.get_f64("height").unwrap_or(1.0),
        rotation: val.get_f64("rotation").unwrap_or(0.0),
        image: val.get_str("image").unwrap_or("").to_string(),
        scale: val.get_f64("scale").unwrap_or(1.0),
        order: val.get_i64("order").unwrap_or(0) as i32,
        alpha: val.get_i64("alpha").unwrap_or(255) as u8,
        color: val.get_i64("color").unwrap_or(0) as i32,
        click: val.get_str("click").unwrap_or("").to_string(),
        hover: val.get_list("hover")
            .map(|list| {
                list.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

// ─── SNBT Chapter Parser ───────────────────────────────────────────────────

/// Parse a chapter.snbt file. Returns (quest_count, chapter_node_id).
fn parse_snbt_chapter_file(path: &Path, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult, lang_titles: &LangTitles) -> Result<(usize, String)> {
    let content = std::fs::read_to_string(path)?;
    let snbt = parse_snbt(&content)?;
    snbt.as_compound().context("chapter.snbt root is not a compound")?;
    let m = &snbt;
    result.stats.files_processed += 1;

    let chapter_id = m.get_str("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get_str("title")
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            // Try language file titles first
            if let Some(lang_title) = lang_titles.chapter.get(&chapter_id) {
                return lang_title.clone();
            }
            // For old flat layout (chapters/ae2.snbt), use the file stem as title
            path.file_stem()
                .map(|f| f.to_string_lossy().replace('_', " "))
                .or_else(|| path.parent().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().to_string()))
                .unwrap_or_default()
        })
        .to_string();
    let _filename = m.get_str("filename").unwrap_or("").to_string();

    // Chapter-level settings
    let default_shape = m.get_str("default_quest_shape").unwrap_or("").to_string();
    let progression_mode = m.get_str("progression_mode").unwrap_or("flexible").to_string();
    let group = m.get_str("group").unwrap_or("").to_string();
    let order_index = m.get_i64("order_index").unwrap_or(0) as i32;
    let hide_dep_lines = m.get_bool("default_hide_dependency_lines").unwrap_or(false);
    let chapter_default_enabled = m.get_bool("default_enabled").unwrap_or(true);
    let subtitle = m.get_str("subtitle").unwrap_or("").to_string();
    let default_min_width = m.get_i64("default_min_width").unwrap_or(0) as i32;
    let default_size_scalar = m.get_f64("default_quest_size").unwrap_or(1.0);
    let default_quest_size = QuestSize {
        width: (default_size_scalar * 24.0).round(),
        height: (default_size_scalar * 24.0).round(),
    };
    let always_invisible = m.get_bool("always_invisible").unwrap_or(false);
    let hide_details_until_startable = m.get_bool("hide_quest_details_until_startable").unwrap_or(false);
    let hide_until_deps_visible = m.get_bool("hide_quest_until_deps_visible").unwrap_or(false);
    let hide_until_deps_complete = m.get_bool("hide_quest_until_deps_complete").unwrap_or(false);
    let hide_text_until_complete = m.get_bool("hide_text_until_complete").unwrap_or(false);
    let autofocus_id = m.get_str("autofocus_id").unwrap_or("").to_string();
    let default_repeatable = m.get_bool("default_repeatable_quest").unwrap_or(false);
    let require_sequential_tasks = m.get_bool("require_sequential_tasks").unwrap_or(false);

    // Chapter groups
    if !group.is_empty() {
        if !graph.chapter_groups.iter().any(|cg| cg.id == group || cg.title == group) {
            let group_title = lang_titles.chapter_group.get(&group).cloned().unwrap_or_else(|| group.clone());
            graph.chapter_groups.push(QuestChapterGroup {
                id: group.clone(),
                title: group_title,
                ..Default::default()
            });
        }
    }

    // Create chapter node
    let chapter_node = QuestNode {
        id: chapter_id.clone(),
        node_type: QuestNodeType::Chapter,
        label: title.clone(),
        description: String::new(),
        position: Position { x: 0.0, y: 0.0 },
        chapter_id: None,
        ..Default::default()
    };
    graph.nodes.push(chapter_node);

    // Parse images array
    let images: Vec<ChapterImage> = m.get("images")
        .and_then(|v| v.as_list())
        .map(|list| {
            let imgs: Vec<_> = list.iter().map(|val| parse_chapter_image(val)).collect();
            result.stats.chapter_images_total += imgs.len();
            imgs
        })
        .unwrap_or_default();

    // Chapter metadata
    graph.chapters.push(QuestChapter {
        id: chapter_id.clone(),
        title,
        subtitle,
        description: String::new(),
        icon: resolve_ftbquests_icon(&extract_icon_str(&m.value)),
        background_image: String::new(),
        order_index,
        hide_until_first_quest_complete: false,
        default_quest_size,
        default_min_width,
        quest_color: String::new(),
        group_id: if group.is_empty() { None } else { Some(group) },
        default_quest_shape: QuestShape::from_string(&default_shape),
        default_enabled: chapter_default_enabled,
        progression_mode: QuestProgressionMode::from_string(&progression_mode),
        images,
        always_invisible,
        default_hide_dependency_lines: hide_dep_lines,
        hide_quest_details_until_startable: hide_details_until_startable,
        hide_quest_until_deps_visible: hide_until_deps_visible,
        hide_quest_until_deps_complete: hide_until_deps_complete,
        hide_text_until_complete,
        autofocus_id,
        default_repeatable,
        require_sequential_tasks,
    });

    // Parse quests array
    let mut quest_count = 0usize;
        if let Some(quests_val) = m.get("quests") {
            if let Some(quests_list) = quests_val.as_list() {
                for quest_val in quests_list {
                    if let Ok(node) = parse_snbt_quest(quest_val, &chapter_id, hide_dep_lines, chapter_default_enabled, result) {
                        graph.nodes.push(node);
                        quest_count += 1;
                    }
                }
        }
    }

    Ok((quest_count, chapter_id))
}

/// Extract the item ID from the first `item`-type task (for title/icon fallback).
/// Returns `None` if no item task is found.
fn extract_first_task_item(m: &SnbtValue) -> Option<String> {
    let tasks_val = m.get("tasks");
    let tasks_list = tasks_val.and_then(|v| v.as_list())?;
    let first = tasks_list.first()?;
    let task_type = first.get_str("type").unwrap_or("item");
    if task_type != "item" && task_type != "ftbquests:item" && task_type != "minecraft:item"
        && task_type != "item_retrieval" && task_type != "ftbquests:item_retrieval"
        && task_type != "item_crafting" && task_type != "crafting" && task_type != "craft"
    {
        return None;
    }
    if let Some(item_m) = first.get("item").and_then(|v| v.as_compound()) {
        return item_m.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
    }
    if let Some(item_str) = first.get_str("item") {
        return Some(item_str.to_string());
    }
    None
}

/// True if the first task is a `checkmark`-type task (the FTB checkmark, not a
/// shaped node). Checkmark tasks carry no item id, so quests whose only task is a
/// checkmark would otherwise fall back to an unresolvable icon.
fn first_task_is_checkmark(m: &SnbtValue) -> bool {
    let tasks_val = m.get("tasks");
    let tasks_list = tasks_val.and_then(|v| v.as_list());
    if let Some(first) = tasks_list.and_then(|l| l.first()) {
        let task_type = first.get_str("type").unwrap_or("");
        return task_type == "checkmark" || task_type == "ftbquests:checkmark"
            || task_type == "minecraft:checkmark";
    }
    false
}

/// Format an item ID like "minecraft:diamond" or "allthemodium:allthemodium_ingot"
/// into a human-readable title.
fn format_item_title(item_id: &str) -> String {
    let path = item_id.split(':').nth(1).unwrap_or(item_id);
    path.replace('_', " ")
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            chars.next().map(|c| c.to_uppercase().to_string() + chars.as_str()).unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Parse a single quest from an SNBT compound
fn parse_snbt_quest(m: &SnbtValue, chapter_id: &str, default_hide_dep_lines: bool, chapter_default_enabled: bool, result: &mut FtBQuestsImportResult) -> Result<QuestNode> {
    let id = m.get_str("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let first_task_item = extract_first_task_item(m);
    let title = m.get_str("title")
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            let from_task = first_task_item.as_ref().map(|item| format_item_title(item));
            if from_task.is_some() {
                result.stats.title_from_task += 1;
            }
            from_task.unwrap_or_else(|| {
                // Last resort: use the quest id
                id.chars().take(8).collect()
            })
        });
    let description = parse_description(m);
    let x = m.get_f64("x").unwrap_or(0.0);
    let y = m.get_f64("y").unwrap_or(0.0);
    let icon = extract_icon_str(m);
    let icon = if icon.is_empty() || icon == "minecraft:" {
        if let Some(item) = first_task_item.as_deref() {
            result.stats.icon_from_task += 1;
            resolve_ftbquests_icon(item)
        } else if first_task_is_checkmark(m) {
            // In-game FTB uses Icons.ACCEPT_GRAY as the checkmark task icon.
            "ftblibrary:textures/icons/accept_gray.png".to_string()
        } else {
            resolve_ftbquests_icon("")
        }
    } else {
        resolve_ftbquests_icon(&icon)
    };
    let color_int = m.get_i64("color").unwrap_or(-1);
    let color = if color_int >= 0 { format_color(color_int) } else { String::new() };
    let subtitle = m.get_str("subtitle").unwrap_or("").to_string();
    let shape = m.get_str("shape").unwrap_or("").to_string();
    let visibility = m.get_str("visibility").unwrap_or("normal").to_string();
    let optional = m.get_bool("optional").unwrap_or(false);
    let default_enabled = m.get_bool("default_enabled").unwrap_or(chapter_default_enabled);
    let silently_complete = m.get_bool("silently_complete").unwrap_or(false);
    let can_be_repeatable = m.get_bool("can_be_repeatable").unwrap_or(false)
        || m.get_bool("can_repeat").unwrap_or(false)
        || m.get_i64("repeatability").unwrap_or(0) > 0;
    let repeat_min_delay = m.get_i64("repeat_min_delay").unwrap_or(0);
    let repeat_max_delay = m.get_i64("repeat_max_delay").unwrap_or(0);
    let repeat_time = m.get_i64("repeat_time").unwrap_or(0);
    // FTB writes a single seconds cooldown; keep legacy keys as a fallback.
    let repeat_cooldown = m.get_i64("repeat_cooldown").unwrap_or(0);
    let hide_lock_icon = m.get_bool("hide_lock_icon").unwrap_or(false);
    let guide_page = m.get_str("guide_page").unwrap_or("").to_string();
    let max_completable_dependents = m.get_i64("max_completable_dependents").unwrap_or(0) as i32;
    let hide_quest_until_deps_complete = m.get_bool("hide_quest_until_deps_complete").unwrap_or(false);
    let hide_quest_until_quest_complete = m.get_bool("hide_quest_until_quest_complete").unwrap_or(false);
    let hide_quest_until_all_complete = m.get_bool("hide_quest_until_all_complete").unwrap_or(false);
    let disable_reward = m.get_bool("disable_reward").unwrap_or(false);
    let pause_reward = m.get_bool("pause_reward").unwrap_or(false);
    let lock_icon = m.get_str("lock_icon").unwrap_or("").to_string();
    let quest_background = m.get_str("quest_background").unwrap_or("").to_string();
    // FTB writes `icon_scale` (Quest.java writeData). Also accept the legacy
    // `icon_scaling` key the app once emitted for subdirs layouts, and clamp to
    // FTB's editor range (0.1 – 2.0).
    let icon_scaling = m
        .get_f64("icon_scale")
        .or_else(|| m.get_f64("icon_scaling"))
        .unwrap_or(1.0)
        .clamp(0.1, 2.0);
    let progression_mode = m.get_str("progression_mode").unwrap_or("default").to_string();
    let sequential_tasks = m.get_bool("sequential_tasks").unwrap_or(false);
    let disable_completion_toast = m.get_bool("disable_completion_toast").unwrap_or(false);
    let ignore_reward_blocking = m.get_bool("ignore_reward_blocking").unwrap_or(false);
    let disable_jei_recipe = m.get_bool("disable_jei_recipe").unwrap_or(false) || m.get_bool("default_quest_disable_jei").unwrap_or(false);
    let min_window_width = m.get_i64("min_window_width").unwrap_or(0) as i32;
    let hide_details_until_startable = m.get_bool("hide_details_until_startable").unwrap_or(false);
    let hide_text_until_completed = m.get_bool("hide_text_until_completed").unwrap_or(false);
    let invisible_until_completed = m.get_bool("invisible_until_completed").unwrap_or(false) || m.get_bool("invisible").unwrap_or(false);
    let invisible_until_x_tasks = m.get_i64("invisible_until_x_tasks").unwrap_or(0) as i32;
    let hide_dependency_lines = m.get_bool("hide_dependency_lines").unwrap_or(default_hide_dep_lines);
    let hide_dependent_lines = m.get_bool("hide_dependent_lines").unwrap_or(false);
    let min_required_dependencies = m.get_i64("min_required_dependencies").unwrap_or(0) as i32;
    let dependency_requirement = m.get_str("dependency_requirement").unwrap_or("default").to_string();

    // Parse size
    // Supports: list [width, height], compound { width, height }, or scalar multiplier (FlatChapters)
    let size = if let Some(size_val) = m.get("size") {
        if let Some(size_list) = size_val.as_list() {
            if size_list.len() >= 2 {
                QuestSize {
                    width: size_list[0].as_f64().unwrap_or(24.0),
                    height: size_list[1].as_f64().unwrap_or(24.0),
                }
            } else { QuestSize::default() }
        } else if let Some(size_m) = size_val.as_compound() {
            QuestSize {
                width: size_m.get("width").and_then(|v| v.as_f64()).unwrap_or(24.0),
                height: size_m.get("height").and_then(|v| v.as_f64()).unwrap_or(24.0),
            }
        } else if let Some(scalar) = size_val.as_f64() {
            // FlatChapters scalar multiplier: size = 1.0 means 24x24, 2.0 means 48x48
            QuestSize {
                width: scalar.max(0.5) * 24.0,
                height: scalar.max(0.5) * 24.0,
            }
        } else { QuestSize::default() }
    } else { QuestSize::default() };

    // Parse tasks
    let objectives = parse_snbt_tasks(m)?;

    // Parse rewards
    let rewards = parse_snbt_rewards(m)?;

    // Parse dependencies (stored for later edge building)
    let mut data = HashMap::new();
    if let Some(deps) = m.get("dependencies") {
        if let Some(deps_list) = deps.as_list() {
            let dep_ids: Vec<String> = deps_list.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            if !dep_ids.is_empty() {
                data.insert("_dependencies".to_string(), dep_ids.join(","));
            }
        }
    }

    let (node_type, link_target) = if let Some(link) = m.get_str("linked_quest") {
        let target = link.to_string();
        if !target.is_empty() {
            data.insert("_link_target".to_string(), target.clone());
        }
        (QuestNodeType::QuestLink, target)
    } else if !default_enabled {
        (QuestNodeType::SideQuest, String::new())
    } else {
        (QuestNodeType::Quest, String::new())
    };

    let parsed_visibility = match visibility.as_str() {
        "always" | "always_visible" => QuestVisibility::AlwaysVisible,
        "never" | "never_visible" => QuestVisibility::NeverVisible,
        "when_dependencies_complete" | "deps_complete" => QuestVisibility::WhenDependenciesComplete,
        "when_quest_complete" | "quest_complete" => QuestVisibility::WhenQuestComplete,
        "when_all_complete" | "all_complete" => QuestVisibility::WhenAllComplete,
        _ => QuestVisibility::Normal,
    };

    let parsed_dependency_requirement = match dependency_requirement.as_str() {
        "one" | "one_completed" => DependencyRequirement::OneCompleted,
        "all_started" | "started" => DependencyRequirement::AllStarted,
        "one_started" => DependencyRequirement::OneStarted,
        _ => DependencyRequirement::AllCompleted,
    };

    Ok(QuestNode {
        id,
        node_type,
        label: title,
        description,
        position: Position { x, y },
        data,
        objectives,
        rewards,
        required_items: Vec::new(),
        chapter_id: Some(chapter_id.to_string()),
        icon,
        size,
        color,
        visibility: parsed_visibility,
        optional,
        silently_complete,
        can_be_repeatable,
        repeat_min_delay,
        repeat_max_delay,
        repeat_time,
        repeat_cooldown,
        hide_quest_until_deps_complete,
        hide_quest_until_quest_complete,
        hide_quest_until_all_complete,
        disable_reward,
        pause_reward,
        lock_icon,
        hide_lock_icon,
        guide_page,
        max_completable_dependents,
        subtitle,
        quest_background,
        shape: QuestShape::from_string(&shape),
        icon_scaling,
        tags: Vec::new(),
        progression_mode: QuestProgressionMode::from_string(&progression_mode),
        sequential_tasks,
        disable_completion_toast,
        ignore_reward_blocking,
        disable_jei_recipe,
        min_window_width,
        hide_details_until_startable,
        hide_text_until_completed,
        invisible_until_completed,
        invisible_until_x_tasks,
        hide_dependency_lines,
        hide_dependent_lines,
        min_required_dependencies,
        dependency_requirement: parsed_dependency_requirement,
        link_target,
    })
}

/// Parse description from SNBT (can be string or list of strings)
fn parse_description(m: &SnbtValue) -> String {
    if let Some(desc) = m.get("description") {
        match desc {
            SnbtValue::String(s) => s.clone(),
            SnbtValue::List(items) => {
                let lines: Vec<String> = items.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
                lines.join("\n")
            }
            _ => String::new(),
        }
    } else { String::new() }
}

/// Format a Minecraft color integer (like 16777215 = 0xFFFFFF) to hex string
fn parse_color_int(v: i64) -> String {
    if v < 0 { return String::new(); }
    format!("#{:06x}", v as u32)
}

fn format_color(v: i64) -> String {
    parse_color_int(v)
}

// ─── SNBT Task Parser ──────────────────────────────────────────────────────

fn parse_snbt_tasks(m: &SnbtValue) -> Result<Vec<QuestObjective>> {
    let mut objectives = Vec::new();

    // Tasks can be: compound with "tasks" key containing a list, or direct list
    let tasks_val = m.get("tasks");
    let tasks_list = tasks_val.and_then(|v| v.as_list());

    if let Some(tasks) = tasks_list {
        for task_val in tasks {
            if let Ok(obj) = parse_snbt_single_task(task_val) {
                objectives.push(obj);
            }
        }
    }

    Ok(objectives)
}

fn parse_snbt_single_task(m: &SnbtValue) -> Result<QuestObjective> {
    let id = m.get_str("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get_str("title").unwrap_or("").to_string();
    let task_type = m.get_str("type").unwrap_or("item").to_string();
    let description = parse_description(m);

    let (objective_type, target, target_count) = match task_type.as_str() {
        // Item acquisition (detection/retrieval/crafting)
        "item" | "ftbquests:item" | "minecraft:item" | "detection" | "item_detection" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::ItemAcquisition, item, count)
        }
        "item_retrieval" | "ftbquests:item_retrieval" | "retrieval" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::ItemRetrieval, item, count)
        }
        "item_crafting" | "ftbquests:item_crafting" | "crafting" | "craft" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::ItemCrafting, item, count)
        }
        // Block break/place
        "block_break" | "ftbquests:block_break" | "minecraft:block_break" | "break" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::BlockBreak, item, count)
        }
        "block_place" | "ftbquests:block_place" | "minecraft:block_place" | "place" => {
            let (item, count) = parse_item_task(m);
            (ObjectiveType::BlockPlace, item, count)
        }
        // Entity kill
        "kill" | "ftbquests:kill" | "minecraft:kill" => {
            let entity = m.get_str("entity")
                .or_else(|| m.get_str("entity_type"))
                .or_else(|| m.get_str("mob"))
                .unwrap_or("").to_string();
            let count = m.get_i64("count").unwrap_or(1) as i32;
            (ObjectiveType::EntityKill, entity, count)
        }
        // Location visit
        "location" | "ftbquests:location" | "minecraft:location" => {
            let dim = m.get_str("dimension").unwrap_or("").to_string();
            let x = m.get_f64("x").unwrap_or(0.0);
            let y = m.get_f64("y").unwrap_or(0.0);
            let z = m.get_f64("z").unwrap_or(0.0);
            let radius = m.get_f64("radius").unwrap_or(0.0);
            let target = if !dim.is_empty() { dim } else { format!("{},{},{},{}", x, y, z, radius) };
            (ObjectiveType::LocationVisit, target, 1)
        }
        // Advancement
        "advancement" | "ftbquests:advancement" | "minecraft:advancement" => {
            let adv = m.get_str("advancement").unwrap_or("").to_string();
            (ObjectiveType::Advancement, adv, 1)
        }
        // Checkmark
        "checkmark" | "ftbquests:checkmark" | "minecraft:checkmark" => {
            (ObjectiveType::Checkmark, String::new(), 1)
        }
        // XP
        "xp" | "ftbquests:xp" | "minecraft:xp" => {
            let amount = m.get_i64("xp").unwrap_or(0) as i32;
            (ObjectiveType::Xp, String::new(), amount)
        }
        // Fluid
        "fluid" | "ftbquests:fluid" | "minecraft:fluid" => {
            let fluid = m.get_str("fluid").unwrap_or("").to_string();
            let amount = m.get_f64("amount").unwrap_or(0.0);
            (ObjectiveType::Fluid, fluid, amount as i32)
        }
        // Energy
        "energy" | "ftbquests:energy" | "minecraft:energy" => {
            let amount = m.get_f64("amount").unwrap_or(0.0);
            let unit = m.get_str("unit").unwrap_or("FE").to_string();
            (ObjectiveType::Energy, unit, amount as i32)
        }
        // Dimension
        "dimension" | "ftbquests:dimension" | "minecraft:dimension" => {
            let dim = m.get_str("dimension").unwrap_or("").to_string();
            (ObjectiveType::LocationVisit, dim, 1)
        }
        // Stat
        "stat" | "ftbquests:stat" | "minecraft:stat" => {
            let stat = m.get_str("stat").unwrap_or("").to_string();
            let count = m.get_i64("count").unwrap_or(1) as i32;
            (ObjectiveType::Stat, stat, count)
        }
        // Observation
        "observation" | "ftbquests:observation" | "minecraft:observation" => {
            (ObjectiveType::Observation, String::new(), 1)
        }
        // Biome
        "biome" | "ftbquests:biome" | "minecraft:biome" => {
            let biome = m.get_str("biome").unwrap_or("").to_string();
            (ObjectiveType::VisitBiome, biome, 1)
        }
        // Structure
        "structure" | "ftbquests:structure" | "minecraft:structure" => {
            let structure = m.get_str("structure").unwrap_or("").to_string();
            (ObjectiveType::FindStructure, structure, 1)
        }
        // Game Stage
        "stage" | "ftbquests:stage" | "minecraft:stage" | "gamestage" => {
            let stage = m.get_str("stage").unwrap_or("").to_string();
            (ObjectiveType::GameStage, stage, 1)
        }
        // Custom
        "custom" | "ftbquests:custom" | "minecraft:custom" => {
            (ObjectiveType::Custom, String::new(), m.get_i64("max_progress").unwrap_or(1) as i32)
        }
        _ => {
            (ObjectiveType::Custom, task_type, 1)
        }
    };

    let mut obj = QuestObjective {
        id,
        label: if title.is_empty() { objective_type.display_name().to_string() } else { title },
        objective_type,
        target,
        target_count,
        required: !m.get_bool("optional").unwrap_or(false),
        description,
        ..Default::default()
    };

    // Extract task-type-specific fields
    if let Some(nbt) = m.get_str("nbt") {
        obj.nbt_data = nbt.to_string();
    }
    // 1.20.5+ Data Components support
    if let Some(components) = m.get("components") {
        if let Some(comp_m) = components.as_compound() {
            // Serialize components back to string for storage
            obj.nbt_data = crate::imports::snbt::compound_to_snbt(&comp_m);
        }
    }
    // FTB Filter System smart filter DSL (nested item components)
    obj.smart_filter = extract_smart_filter(m);
    if let Some(tag) = m.get_str("tag") {
        obj.item_tag = tag.to_string();
    }
    obj.consume_items = m.get_bool("consume_items").unwrap_or(false);
    obj.match_nbt = m.get_bool("match_nbt").unwrap_or(false);
    obj.ignore_nbt = m.get_bool("ignore_nbt").unwrap_or(false);
    
    // Location/radius for location tasks
    if matches!(obj.objective_type, ObjectiveType::LocationVisit) {
        obj.x = m.get_f64("x").unwrap_or(0.0);
        obj.y = m.get_f64("y").unwrap_or(0.0);
        obj.z = m.get_f64("z").unwrap_or(0.0);
        obj.radius = m.get_f64("radius").unwrap_or(0.0);
        obj.dimension = m.get_str("dimension").unwrap_or("").to_string();
    }
    
    // Entity for kill tasks
    if matches!(obj.objective_type, ObjectiveType::EntityKill) {
        obj.entity_id = m.get_str("entity")
            .or_else(|| m.get_str("entity_type"))
            .or_else(|| m.get_str("mob"))
            .unwrap_or("").to_string();
    }
    
    // Advancement ID
    if matches!(obj.objective_type, ObjectiveType::Advancement) {
        obj.advancement_id = m.get_str("advancement").unwrap_or("").to_string();
    }
    
    // Custom JSON for custom tasks
    if matches!(obj.objective_type, ObjectiveType::Custom) {
        if let Some(custom) = m.get("custom") {
            obj.custom_json = custom.to_snbt_string();
        }
    }
    
    // Stat name/value
    if matches!(obj.objective_type, ObjectiveType::Stat) {
        obj.stat_name = m.get_str("stat").unwrap_or("").to_string();
        obj.stat_value = m.get_i64("count").unwrap_or(1) as i32;
    }
    
    // Biome ID
    if matches!(obj.objective_type, ObjectiveType::VisitBiome) {
        obj.biome_id = m.get_str("biome").unwrap_or("").to_string();
    }
    
    // Structure ID
    if matches!(obj.objective_type, ObjectiveType::FindStructure) {
        obj.structure_id = m.get_str("structure").unwrap_or("").to_string();
    }
    
    // Observation range
    if matches!(obj.objective_type, ObjectiveType::Observation) {
        obj.observation_range = m.get_f64("range").unwrap_or(4.0);
    }
    
    // Fluid amount
    if matches!(obj.objective_type, ObjectiveType::Fluid) {
        obj.fluid_id = m.get_str("fluid").unwrap_or("").to_string();
        obj.fluid_amount = m.get_f64("amount").unwrap_or(0.0);
    }
    
    // Energy amount/unit
    if matches!(obj.objective_type, ObjectiveType::Energy) {
        obj.energy_amount = m.get_f64("amount").unwrap_or(0.0);
        obj.energy_unit = m.get_str("unit").unwrap_or("FE").to_string();
    }
    
    // XP levels/points
    if matches!(obj.objective_type, ObjectiveType::Xp) {
        obj.xp_levels = m.get_i64("levels").unwrap_or(0) as i32;
        obj.xp_points = m.get_i64("xp").unwrap_or(0) as i32;
    }
    
    // Command
    if matches!(obj.objective_type, ObjectiveType::Command) {
        obj.command = m.get_str("command").unwrap_or("").to_string();
    }
    
    // Game Stage
    if matches!(obj.objective_type, ObjectiveType::GameStage) {
        obj.advancement_id = m.get_str("stage").unwrap_or("").to_string(); // reuse field
    }

    Ok(obj)
}

/// Parse item from task compound - handles both old and new formats, plus 1.20.5+ Data Components
fn parse_item_task(m: &SnbtValue) -> (String, i32) {
    let count = m.get_i64("count").unwrap_or(1) as i32;

    // 1.20.5+ Data Components format: item { id = "minecraft:diamond", components = {...} }
    if let Some(item_m) = m.get("item").and_then(|v| v.as_compound()) {
        let id = item_m.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let inner_count = item_m.get("count").and_then(|v| v.as_i64()).unwrap_or(count as i64) as i32;
        // Store components in NBT data if present
        if item_m.get("components").is_some() {
            // Will be handled by caller
        }
        return (id, inner_count);
    }

    // New format: item = "minecraft:oak_log" (string)
    if let Some(item_str) = m.get_str("item") {
        return (item_str.to_string(), count);
    }

    // Tag-based: tag = "forge:ingots/iron"
    if let Some(tag) = m.get_str("tag") {
        return (format!("#{}", tag), count);
    }

    (String::new(), count)
}

/// Extract the FTB Filter System smart filter DSL from a task/reward compound.
/// The DSL lives in nested 1.20.5+ Data Components, e.g.
/// `item: { components: { "ftbfiltersystem:filter": "or(item(...)item(...))" }, count: 1, id: "ftbfiltersystem:smart_filter" }`
fn extract_smart_filter(m: &SnbtValue) -> String {
    fn extract(components: &HashMap<String, CommentedSnbt>) -> Option<&str> {
        components.get("ftbfiltersystem:filter").and_then(|c| c.value.as_str())
    }

    if let Some(item_m) = m.get("item").and_then(|v| v.as_compound()) {
        if let Some(components) = item_m.get("components").and_then(|v| v.as_compound()) {
            if let Some(dsl) = extract(components) {
                return dsl.to_string();
            }
        }
    }

    if let Some(components) = m.get("components").and_then(|v| v.as_compound()) {
        if let Some(dsl) = extract(components) {
            return dsl.to_string();
        }
    }

    String::new()
}

// ─── SNBT Reward Parser ────────────────────────────────────────────────────

fn parse_snbt_rewards(m: &SnbtValue) -> Result<Vec<QuestReward>> {
    let mut rewards = Vec::new();

    if let Some(rewards_val) = m.get("rewards") {
        if let Some(rewards_list) = rewards_val.as_list() {
            for reward_val in rewards_list {
                if let Ok(r) = parse_snbt_single_reward(reward_val) {
                    rewards.push(r);
                }
            }
        }
    }

    Ok(rewards)
}

fn parse_snbt_single_reward(m: &SnbtValue) -> Result<QuestReward> {
    let id = m.get_str("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get_str("title").unwrap_or("").to_string();
    let reward_type_str = m.get_str("type").unwrap_or("item").to_string();
    let description = parse_description(m);

    let mut reward = QuestReward {
        id,
        label: String::new(),
        reward_type: RewardType::Item,
        items: Vec::new(),
        description,
        item_id: String::new(),
        item_count: 1,
        item_tag: String::new(),
        nbt_data: String::new(),
        smart_filter: String::new(),
        xp_amount: 0,
        xp_levels: 0,
        command: String::new(),
        loot_table: String::new(),
        game_stage: String::new(),
        weight: 1.0,
        reward_chests: Vec::new(),
        team_reward: false,
        toast_message: String::new(),
        table_id: String::new(),
        choices: Vec::new(),
        consume_items: false,
        match_nbt: false,
        ignore_nbt: false,
    };

    match reward_type_str.as_str() {
        "item" | "ftbquests:item" | "minecraft:item" => {
            let (item, count) = parse_item_task(m);
            reward.reward_type = RewardType::Item;
            reward.item_id = item;
            reward.item_count = count;
            // Handle components (1.20.5+)
            if let Some(components) = m.get("components").and_then(|v| v.as_compound()) {
                reward.nbt_data = crate::imports::snbt::compound_to_snbt(&components);
            }
        }
        "item_weighted" | "ftbquests:item_weighted" | "minecraft:item_weighted" => {
            let (item, count) = parse_item_task(m);
            reward.reward_type = RewardType::ItemWithWeight;
            reward.item_id = item;
            reward.item_count = count;
            reward.weight = m.get_f64("weight").unwrap_or(1.0);
            if let Some(components) = m.get("components").and_then(|v| v.as_compound()) {
                reward.nbt_data = crate::imports::snbt::compound_to_snbt(&components);
            }
        }
        "xp" | "ftbquests:xp" | "minecraft:xp" => {
            reward.reward_type = RewardType::Experience;
            reward.xp_amount = m.get_i64("xp").unwrap_or(0) as i32;
        }
        "levels" | "ftbquests:levels" | "minecraft:levels" | "xp_levels" => {
            reward.reward_type = RewardType::XpLevels;
            reward.xp_levels = m.get_i64("levels").unwrap_or(0) as i32;
        }
        "command" | "ftbquests:command" | "minecraft:command" => {
            reward.reward_type = RewardType::Command;
            reward.command = m.get_str("command").unwrap_or("").to_string();
        }
        "loot" | "ftbquests:loot" | "minecraft:loot" => {
            reward.reward_type = RewardType::LootTable;
            reward.loot_table = m.get_str("loot_table").unwrap_or("").to_string();
        }
        "choice" | "ftbquests:choice" | "minecraft:choice" => {
            reward.reward_type = RewardType::Choice;
            reward.items = parse_reward_items(m);
            if let Some(table_id) = m.get_i64("table_id") {
                reward.table_id = RewardTable::to_hex_id(table_id);
            }
        }
        "random" | "ftbquests:random" | "minecraft:random" => {
            reward.reward_type = RewardType::Random;
            reward.items = parse_reward_items(m);
            if let Some(table_id) = m.get_i64("table_id") {
                reward.table_id = RewardTable::to_hex_id(table_id);
            }
        }
        "all" | "ftbquests:all" | "minecraft:all" => {
            reward.reward_type = RewardType::AllTable;
            reward.items = parse_reward_items(m);
            if let Some(table_id) = m.get_i64("table_id") {
                reward.table_id = RewardTable::to_hex_id(table_id);
            }
        }
        "advancement" | "ftbquests:advancement" | "minecraft:advancement" => {
            reward.reward_type = RewardType::Advancement;
            reward.item_id = m.get_str("advancement").unwrap_or("").to_string();
        }
        "toast" | "ftbquests:toast" | "minecraft:toast" => {
            reward.reward_type = RewardType::Toast;
            reward.toast_message = m.get_str("message").unwrap_or("").to_string();
        }
        "stage" | "ftbquests:stage" | "minecraft:stage" => {
            reward.reward_type = RewardType::GameStage;
            reward.game_stage = m.get_str("stage").unwrap_or("").to_string();
        }
        "unlock" | "ftbquests:unlock" | "minecraft:unlock" => {
            reward.reward_type = RewardType::Unlock;
            reward.game_stage = m.get_str("stage").unwrap_or("").to_string();
        }
        _ => {
            reward.reward_type = RewardType::Custom;
            reward.item_id = reward_type_str;
        }
    }

    // Common fields
    if let Some(nbt) = m.get_str("nbt") {
        reward.nbt_data = nbt.to_string();
    }
    // Table entries always carry a weight even when the type is plain "item".
    if reward.reward_type != RewardType::ItemWithWeight {
        if let Some(w) = m.get_f64("weight") {
            reward.weight = w;
        }
    }
    if let Some(components) = m.get("components").and_then(|v| v.as_compound()) {
        reward.nbt_data = crate::imports::snbt::compound_to_snbt(&components);
    }
    if let Some(tag) = m.get_str("tag") {
        reward.item_tag = tag.to_string();
    }
    reward.smart_filter = extract_smart_filter(m);
    reward.consume_items = m.get_bool("consume_items").unwrap_or(false);
    reward.match_nbt = m.get_bool("match_nbt").unwrap_or(false);
    reward.ignore_nbt = m.get_bool("ignore_nbt").unwrap_or(false);

    reward.label = if title.is_empty() { reward.reward_type.display_name().to_string() } else { title };

    Ok(reward)
}

fn parse_reward_items(m: &SnbtValue) -> Vec<String> {
    let mut items = Vec::new();

    if let Some(items_val) = m.get("items") {
        match items_val {
            SnbtValue::Compound(map) => {
                for (_key, val) in map {
                    if let Some(item_str) = val.get_str("item") {
                        items.push(item_str.to_string());
                    } else if let Some(id) = val.get("id").and_then(|v| v.as_str()) {
                        items.push(id.to_string());
                    }
                }
            }
            SnbtValue::List(list) => {
                for val in list {
                    if let Some(item_str) = val.get_str("item") {
                        items.push(item_str.to_string());
                    } else if let Some(id) = val.get("id").and_then(|v| v.as_str()) {
                        items.push(id.to_string());
                    }
                }
            }
            _ => {}
        }
    }

    items
}

// ─── Reward Tables ──────────────────────────────────────────────────────────

/// Parse `quests_dir/reward_tables/*.snbt|json5` weighted pools into the graph,
/// then resolve `table_id` references on random/choice/all_table rewards so the
/// table's item list is available to the editor.
fn parse_reward_tables(quests_dir: &Path, format: FtBQuestsFormat, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) {
    let tables_dir = quests_dir.join("reward_tables");
    if !tables_dir.is_dir() {
        return;
    }

    let mut tables: Vec<RewardTable> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&tables_dir) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if !file_path.is_file() { continue; }
            let ext = file_path.extension().unwrap_or_default();
            let parsed = match format {
                FtBQuestsFormat::Snbt if ext == "snbt" => parse_snbt_reward_table_file(&file_path),
                FtBQuestsFormat::Json5 if ext == "json5" || ext == "json" => parse_json5_reward_table_file(&file_path),
                _ => continue,
            };
            match parsed {
                Ok(Some(table)) => tables.push(table),
                Ok(None) => {}
                Err(e) => {
                    result.issues.push(ImportIssue {
                        severity: IssueSeverity::Warning,
                        category: IssueCategory::ParseError,
                        message: format!("Failed to parse reward table: {e}"),
                        file: Some(file_path.display().to_string()),
                        node_id: None,
                    });
                }
            }
        }
    }

    tables.sort_by_key(|t| t.order_index);
    // Preserve stable ids for existing tables by name, then add new ones.
    for table in tables {
        if !graph.reward_tables.iter().any(|t| t.id == table.id) {
            graph.reward_tables.push(table);
        }
    }

    // Resolve table_id references on rewards across all quest nodes.
    for node in graph.nodes.iter_mut() {
        if !matches!(node.node_type, QuestNodeType::Quest | QuestNodeType::SideQuest) {
            continue;
        }
        for reward in node.rewards.iter_mut() {
            match reward.reward_type {
                RewardType::Random | RewardType::Choice | RewardType::AllTable => {
                    if reward.table_id.is_empty() {
                        continue;
                    }
                    let long_id = RewardTable::to_long_id(&reward.table_id);
                    if let Some(table) = graph.reward_tables.iter().find(|t| RewardTable::to_long_id(&t.id) == long_id) {
                        if reward.items.is_empty() {
                            reward.items = table.rewards.iter()
                                .map(|r| r.item_id.clone())
                                .filter(|i| !i.is_empty())
                                .collect();
                        }
                    }
                }
                _ => {}
            }
        }
    }
}

/// Parse a single `reward_tables/<hex_id>.snbt` file into a `RewardTable`.
fn parse_snbt_reward_table_file(path: &Path) -> Result<Option<RewardTable>> {
    let content = std::fs::read_to_string(path)?;
    let snbt = parse_snbt(&content)?;
    let map = snbt.as_compound().ok_or_else(|| anyhow::anyhow!("reward table root is not a compound"))?;
    let table = parse_snbt_reward_table(map)?;
    Ok(Some(table))
}

fn parse_snbt_reward_table(map: &HashMap<String, CommentedSnbt>) -> Result<RewardTable> {
    let id = map.get("id").and_then(|v| v.value.as_str()).unwrap_or("").to_string();
    let mut rewards = Vec::new();
    if let Some(list) = map.get("rewards").and_then(|v| v.value.as_list()) {
        for reward_val in list {
            if let Ok(r) = parse_snbt_single_reward(reward_val) {
                rewards.push(r);
            }
        }
    }
    Ok(RewardTable {
        id,
        title: map.get("title").and_then(|v| v.value.as_str()).unwrap_or("").to_string(),
        order_index: map.get("order_index").and_then(|v| v.value.as_i64()).unwrap_or(0) as i32,
        loot_size: map.get("loot_size").and_then(|v| v.value.as_i64()).unwrap_or(0) as i32,
        empty_weight: map.get("empty_weight").and_then(|v| v.value.as_f64()).unwrap_or(0.0),
        hide_tooltip: map.get("hide_tooltip").and_then(|v| v.value.as_bool()).unwrap_or(false),
        use_title: map.get("use_title").and_then(|v| v.value.as_bool()).unwrap_or(true),
        rewards,
    })
}

/// Parse a single `reward_tables/<hex_id>.json5` file into a `RewardTable`.
fn parse_json5_reward_table_file(path: &Path) -> Result<Option<RewardTable>> {
    let content = std::fs::read_to_string(path)?;
    let val: serde_json::Value = serde_json::from_str(&content)?;
    let obj = val.as_object().ok_or_else(|| anyhow::anyhow!("reward table root is not an object"))?;

    let mut rewards = Vec::new();
    if let Some(serde_json::Value::Array(list)) = obj.get("rewards") {
        for reward_val in list {
            if let Some(reward_obj) = reward_val.as_object() {
                if let Ok(r) = parse_json5_reward(reward_obj) {
                    rewards.push(r);
                }
            }
        }
    }

    Ok(Some(RewardTable {
        id: obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        title: obj.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        order_index: obj.get("order_index").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        loot_size: obj.get("loot_size").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        empty_weight: obj.get("empty_weight").and_then(|v| v.as_f64()).unwrap_or(0.0),
        hide_tooltip: obj.get("hide_tooltip").and_then(|v| v.as_bool()).unwrap_or(false),
        use_title: obj.get("use_title").and_then(|v| v.as_bool()).unwrap_or(true),
        rewards,
    }))
}

// ─── Standalone Quest Files (SNBT) ─────────────────────────────────────────

/// Parse individual quest .snbt files in a chapter directory
fn parse_standalone_quest_files(dir: &Path, chapter_id: &str, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) -> Result<usize> {
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

// ─── Json5 Chapter Parser ──────────────────────────────────────────────────

fn parse_json5_chapter_file(path: &Path, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult, lang_titles: &LangTitles) -> Result<(usize, String)> {
    let content = std::fs::read_to_string(path)?;
    let val: serde_json::Value = json5::from_str(&content)
        .or_else(|_| serde_json::from_str(&content))
        .with_context(|| format!("Failed to parse {}", path.display()))?;

    let chapter_id = val.get("id").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = val.get("title").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            // Try language file titles first
            if let Some(lang_title) = lang_titles.chapter.get(&chapter_id) {
                return lang_title.clone();
            }
            path.parent().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().to_string()).unwrap_or_default()
        })
        .to_string();
    let _filename = val.get("filename").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let default_shape = val.get("default_quest_shape").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let progression_mode = val.get("progression_mode").and_then(|v| v.as_str()).unwrap_or("flexible").to_string();
    let group = val.get("group").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let order_index = val.get("order_index").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let chapter_default_enabled = val.get("default_enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    let subtitle = val.get("subtitle").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let default_min_width = val.get("default_min_width").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let default_size_scalar = val.get("default_quest_size").and_then(|v| v.as_f64()).unwrap_or(1.0);
    let default_quest_size = QuestSize {
        width: (default_size_scalar * 24.0).round(),
        height: (default_size_scalar * 24.0).round(),
    };
    let always_invisible = val.get("always_invisible").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_dep_lines = val.get("default_hide_dependency_lines").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_details_until_startable = val.get("hide_quest_details_until_startable").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_until_deps_visible = val.get("hide_quest_until_deps_visible").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_until_deps_complete = val.get("hide_quest_until_deps_complete").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_text_until_complete = val.get("hide_text_until_complete").and_then(|v| v.as_bool()).unwrap_or(false);
    let autofocus_id = val.get("autofocus_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let default_repeatable = val.get("default_repeatable_quest").and_then(|v| v.as_bool()).unwrap_or(false);
    let require_sequential_tasks = val.get("require_sequential_tasks").and_then(|v| v.as_bool()).unwrap_or(false);
    result.stats.files_processed += 1;

    if !group.is_empty() && !graph.chapter_groups.iter().any(|cg| cg.id == group || cg.title == group) {
        let group_title = lang_titles.chapter_group.get(&group).cloned().unwrap_or_else(|| group.clone());
        graph.chapter_groups.push(QuestChapterGroup {
            id: group.clone(),
            title: group_title,
            ..Default::default()
        });
    }

    graph.nodes.push(QuestNode {
        id: chapter_id.clone(),
        node_type: QuestNodeType::Chapter,
        label: title.clone(),
        description: String::new(),
        position: Position { x: 0.0, y: 0.0 },
        chapter_id: None,
        ..Default::default()
    });

    let images: Vec<ChapterImage> = val.get("images")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter().map(|item| {
                let obj = item.as_object().map(|o| {
                    let x = o.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let y = o.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let width = o.get("width").and_then(|v| v.as_f64()).unwrap_or(1.0);
                    let height = o.get("height").and_then(|v| v.as_f64()).unwrap_or(1.0);
                    let rotation = o.get("rotation").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let image = o.get("image").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let scale = o.get("scale").and_then(|v| v.as_f64()).unwrap_or(1.0);
                    let order = o.get("order").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let alpha = o.get("alpha").and_then(|v| v.as_i64()).unwrap_or(255) as u8;
                    let color = o.get("color").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let click = o.get("click").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let hover: Vec<String> = o.get("hover").and_then(|v| v.as_array())
                        .map(|h| h.iter().filter_map(|s| s.as_str().map(String::from)).collect())
                        .unwrap_or_default();
                    ChapterImage { x, y, width, height, rotation, image, scale, order, alpha, color, click, hover }
                }).unwrap_or_default();
                obj
            }).collect()
        })
        .unwrap_or_default();

    graph.chapters.push(QuestChapter {
        id: chapter_id.clone(),
        title,
        subtitle,
        description: String::new(),
        icon: val.get("icon").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        background_image: String::new(),
        order_index,
        hide_until_first_quest_complete: false,
        default_quest_size,
        default_min_width,
        quest_color: String::new(),
        group_id: if group.is_empty() { None } else { Some(group) },
        default_quest_shape: QuestShape::from_string(&default_shape),
        default_enabled: chapter_default_enabled,
        progression_mode: QuestProgressionMode::from_string(&progression_mode),
        images,
        always_invisible,
        default_hide_dependency_lines: hide_dep_lines,
        hide_quest_details_until_startable: hide_details_until_startable,
        hide_quest_until_deps_visible: hide_until_deps_visible,
        hide_quest_until_deps_complete: hide_until_deps_complete,
        hide_text_until_complete,
        autofocus_id,
        default_repeatable,
        require_sequential_tasks,
    });

    let mut quest_count = 0usize;
    if let Some(quests) = val.get("quests").and_then(|v| v.as_array()) {
        for quest_val in quests {
            if let Some(quest_m) = quest_val.as_object() {
                if let Ok(node) = parse_json5_quest(quest_m, &chapter_id, chapter_default_enabled) {
                    graph.nodes.push(node);
                    quest_count += 1;
                }
            }
        }
    }

    Ok((quest_count, chapter_id))
}

fn parse_json5_quest(m: &serde_json::Map<String, serde_json::Value>, chapter_id: &str, chapter_default_enabled: bool) -> Result<QuestNode> {
    let id = m.get("id").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let description = json5_description(m);
    let x = m.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let y = m.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let icon = m.get("icon").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let color_int = m.get("color").and_then(|v| v.as_i64()).unwrap_or(-1);
    let color = if color_int >= 0 { format_color(color_int) } else { String::new() };
    let _subtitle = m.get("subtitle").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let shape = m.get("shape").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let visibility = m.get("visibility").and_then(|v| v.as_str()).unwrap_or("normal").to_string();
    let optional = m.get("optional").and_then(|v| v.as_bool()).unwrap_or(false);
    let default_enabled = m.get("default_enabled").and_then(|v| v.as_bool()).unwrap_or(chapter_default_enabled);
    let progression_mode = m.get("progression_mode").and_then(|v| v.as_str()).unwrap_or("default").to_string();
    let can_be_repeatable = m.get("can_be_repeatable").and_then(|v| v.as_bool()).unwrap_or(false)
        || m.get("can_repeat").and_then(|v| v.as_bool()).unwrap_or(false);
    let repeat_cooldown = m.get("repeat_cooldown").and_then(|v| v.as_i64()).unwrap_or(0);
    let hide_lock_icon = m.get("hide_lock_icon").and_then(|v| v.as_bool()).unwrap_or(false);
    let guide_page = m.get("guide_page").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let max_completable_dependents = m.get("max_completable_dependents").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let invisible_until_completed = m.get("invisible").and_then(|v| v.as_bool()).unwrap_or(false);
    let invisible_until_x_tasks = m.get("invisible_until_tasks").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let min_required_dependencies = m.get("min_required_dependencies").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let dependency_requirement = m.get("dependency_requirement").and_then(|v| v.as_str()).unwrap_or("default").to_string();
    let hide_details_until_startable = m.get("hide_details_until_startable").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_text_until_completed = m.get("hide_text_until_complete").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_dependency_lines = m.get("hide_dependency_lines").and_then(|v| v.as_bool()).unwrap_or(false);
    let hide_dependent_lines = m.get("hide_dependent_lines").and_then(|v| v.as_bool()).unwrap_or(false);
    let parsed_dependency_requirement = match dependency_requirement.as_str() {
        "one" | "one_completed" => DependencyRequirement::OneCompleted,
        "all_started" | "started" => DependencyRequirement::AllStarted,
        "one_started" => DependencyRequirement::OneStarted,
        _ => DependencyRequirement::AllCompleted,
    };

    let mut data = HashMap::new();
    if let Some(deps) = m.get("dependencies").and_then(|v| v.as_array()) {
        let dep_ids: Vec<String> = deps.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
        if !dep_ids.is_empty() {
            data.insert("_dependencies".to_string(), dep_ids.join(","));
        }
    }
    let link_target = m.get("linked_quest").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if !link_target.is_empty() {
        data.insert("_link_target".to_string(), link_target.clone());
    }

    let parsed_visibility = match visibility.as_str() {
        "always" | "always_visible" => QuestVisibility::AlwaysVisible,
        "never" | "never_visible" => QuestVisibility::NeverVisible,
        "when_dependencies_complete" => QuestVisibility::WhenDependenciesComplete,
        "when_quest_complete" => QuestVisibility::WhenQuestComplete,
        "when_all_complete" => QuestVisibility::WhenAllComplete,
        _ => QuestVisibility::Normal,
    };

    // Parse tasks
    let objectives = if let Some(tasks) = m.get("tasks").and_then(|v| v.as_array()) {
        tasks.iter().filter_map(|t| {
            t.as_object().and_then(|tm| parse_json5_task(tm).ok())
        }).collect()
    } else { Vec::new() };

    // Parse rewards
    let rewards = if let Some(rewards_arr) = m.get("rewards").and_then(|v| v.as_array()) {
        rewards_arr.iter().filter_map(|r| {
            r.as_object().and_then(|rm| parse_json5_reward(rm).ok())
        }).collect()
    } else { Vec::new() };

    Ok(QuestNode {
        id,
        node_type: if !link_target.is_empty() {
            QuestNodeType::QuestLink
        } else if !default_enabled {
            QuestNodeType::SideQuest
        } else {
            QuestNodeType::Quest
        },
        label: title,
        description,
        position: Position { x, y },
        data,
        objectives,
        rewards,
        required_items: Vec::new(),
        chapter_id: Some(chapter_id.to_string()),
        icon,
        size: QuestSize::default(),
        color,
        visibility: parsed_visibility,
        optional,
        shape: QuestShape::from_string(&shape),
        progression_mode: QuestProgressionMode::from_string(&progression_mode),
        link_target,
        can_be_repeatable,
        repeat_cooldown,
        hide_lock_icon,
        guide_page,
        max_completable_dependents,
        invisible_until_completed,
        invisible_until_x_tasks,
        min_required_dependencies,
        dependency_requirement: parsed_dependency_requirement,
        hide_details_until_startable,
        hide_text_until_completed,
        hide_dependency_lines,
        hide_dependent_lines,
        ..Default::default()
    })
}

fn json5_description(m: &serde_json::Map<String, serde_json::Value>) -> String {
    match m.get("description") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(arr)) => {
            arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect::<Vec<_>>().join("\n")
        }
        _ => String::new(),
    }
}

fn parse_json5_task(m: &serde_json::Map<String, serde_json::Value>) -> Result<QuestObjective> {
    let id = m.get("id").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let task_type = m.get("type").and_then(|v| v.as_str()).unwrap_or("item").to_string();
    let count = m.get("count").and_then(|v| v.as_i64()).unwrap_or(1) as i32;

    let (objective_type, target) = match task_type.as_str() {
        "item" | "ftbquests:item" | "minecraft:item" => {
            let item = m.get("item").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::ItemAcquisition, item)
        }
        "kill" | "ftbquests:kill" => {
            let entity = m.get("entity").or_else(|| m.get("entity_type")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::EntityKill, entity)
        }
        "advancement" | "ftbquests:advancement" => {
            let adv = m.get("advancement").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::Advancement, adv)
        }
        "checkmark" | "ftbquests:checkmark" => (ObjectiveType::Checkmark, String::new()),
        "xp" | "ftbquests:xp" => (ObjectiveType::Xp, String::new()),
        "fluid" | "ftbquests:fluid" => {
            let fluid = m.get("fluid").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::Fluid, fluid)
        }
        "energy" | "ftbquests:energy" => (ObjectiveType::Energy, String::new()),
        "stat" | "ftbquests:stat" => {
            let stat = m.get("stat").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::Stat, stat)
        }
        "observation" | "ftbquests:observation" => (ObjectiveType::Observation, String::new()),
        "biome" | "ftbquests:biome" => {
            let biome = m.get("biome").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::VisitBiome, biome)
        }
        "structure" | "ftbquests:structure" => {
            let s = m.get("structure").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::FindStructure, s)
        }
        "stage" | "ftbquests:stage" => {
            let stage = m.get("stage").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::GameStage, stage)
        }
        "location" | "ftbquests:location" => {
            let dim = m.get("dimension").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (ObjectiveType::LocationVisit, dim)
        }
        _ => (ObjectiveType::Custom, task_type),
    };

    Ok(QuestObjective {
        id,
        label: if title.is_empty() { objective_type.display_name().to_string() } else { title },
        objective_type,
        target,
        target_count: count,
        required: !m.get("optional").and_then(|v| v.as_bool()).unwrap_or(false),
        ..Default::default()
    })
}

fn parse_json5_reward(m: &serde_json::Map<String, serde_json::Value>) -> Result<QuestReward> {
    let id = m.get("id").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = m.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let reward_type_str = m.get("type").and_then(|v| v.as_str()).unwrap_or("item").to_string();

    let (reward_type, item_id) = match reward_type_str.as_str() {
        "item" | "ftbquests:item" | "minecraft:item" => {
            let item = m.get("item").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::Item, item)
        }
        "xp" | "ftbquests:xp" => (RewardType::Experience, String::new()),
        "levels" | "ftbquests:levels" => (RewardType::XpLevels, String::new()),
        "command" | "ftbquests:command" => {
            let cmd = m.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::Command, cmd)
        }
        "loot" | "ftbquests:loot" => {
            let table = m.get("loot_table").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::LootTable, table)
        }
        "choice" | "ftbquests:choice" => {
            let table_id = m.get("table_id").and_then(|v| v.as_i64());
            let table_hex = table_id.map(|t| RewardTable::to_hex_id(t)).unwrap_or_default();
            (RewardType::Choice, table_hex)
        }
        "random" | "ftbquests:random" => {
            let table_id = m.get("table_id").and_then(|v| v.as_i64());
            let table_hex = table_id.map(|t| RewardTable::to_hex_id(t)).unwrap_or_default();
            (RewardType::Random, table_hex)
        }
        "all" | "ftbquests:all" | "all_table" | "ftbquests:all_table" => {
            let table_id = m.get("table_id").and_then(|v| v.as_i64());
            let table_hex = table_id.map(|t| RewardTable::to_hex_id(t)).unwrap_or_default();
            (RewardType::AllTable, table_hex)
        }
        "advancement" | "ftbquests:advancement" => {
            let adv = m.get("advancement").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::Advancement, adv)
        }
        "toast" | "ftbquests:toast" => (RewardType::Toast, String::new()),
        "stage" | "ftbquests:stage" => {
            let stage = m.get("stage").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (RewardType::GameStage, stage)
        }
        _ => (RewardType::Custom, reward_type_str),
    };

    let is_table_type = matches!(reward_type, RewardType::Choice | RewardType::Random | RewardType::AllTable);
    Ok(QuestReward {
        id,
        label: if title.is_empty() { reward_type.display_name().to_string() } else { title },
        reward_type,
        item_id: if is_table_type { String::new() } else { item_id.clone() },
        table_id: if is_table_type { item_id } else { String::new() },
        ..Default::default()
    })
}

// ─── Standalone Json5 Quest Files ──────────────────────────────────────────

fn parse_standalone_json5_quest_files(dir: &Path, chapter_id: &str, graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) -> Result<usize> {
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

// ─── Dependency Edge Building ──────────────────────────────────────────────

/// Build dependency edges from the _dependencies data field stored on each node
fn build_dependency_edges(graph: &mut QuestGraph, result: &mut FtBQuestsImportResult) -> usize {
    let node_ids: Vec<String> = graph.nodes.iter().map(|n| n.id.clone()).collect();
    let mut resolved = 0;

    for node in &graph.nodes {
        if let Some(deps_str) = node.data.get("_dependencies") {
            for dep_id in deps_str.split(',') {
                let dep_id = dep_id.trim().to_string();
                if dep_id.is_empty() { continue; }
                // The dep_id might be the SNBT key or the actual quest ID
                // Try to find a matching node
                let target_id = if node_ids.contains(&dep_id) {
                    dep_id
                } else {
                    // Try to find by partial match
                    match graph.nodes.iter().find(|n| n.id.contains(&dep_id) || dep_id.contains(&n.id)) {
                        Some(found) => found.id.clone(),
                        None => {
                            result.issues.push(ImportIssue {
                                severity: IssueSeverity::Warning,
                                category: IssueCategory::MissingDependency,
                                message: format!("Quest '{}' depends on missing quest '{}'", node.label, dep_id),
                                file: None,
                                node_id: Some(node.id.clone()),
                            });
                            continue;
                        }
                    }
                };

                graph.edges.push(QuestEdge {
                    id: Uuid::new_v4().to_string(),
                    source: target_id,
                    target: node.id.clone(),
                    label: None,
                    edge_type: EdgeType::Prerequisite,
                    inverted: false,
                });
                resolved += 1;
            }
        }
    }

    // Remove the temporary _dependencies data from nodes
    for node in &mut graph.nodes {
        node.data.remove("_dependencies");
    }

    resolved
}

#[cfg(test)]
mod chapter_title_tests {
    use super::{parse_chapter_titles, parse_group_titles};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_parse_chapter_titles_recursive_scanning() {
        let dir = tempdir().unwrap();
        let quests_dir = dir.path().join("quests");
        let lang_dir = quests_dir.join("lang").join("en_us").join("chapters");
        fs::create_dir_all(&lang_dir).unwrap();
        
        let chapter1_content = r#"{
    chapter.007B547630FF0478.title: "Theurgy"
    chapter.05E614FDA677D85E.title: "Food and Farming"
}"#;
        fs::write(lang_dir.join("chapter1.snbt"), chapter1_content).unwrap();
        
        let chapter2_content = r#"{
    chapter.07210DDF872160BA.title: "Applied Energistics 2"
    chapter.0A093D8C4429B627.title: "Mekanism: Reactors"
}"#;
        fs::write(lang_dir.join("chapter2.snbt"), chapter2_content).unwrap();
        
        let nested_dir = lang_dir.join("mods");
        fs::create_dir_all(&nested_dir).unwrap();
        let nested_content = r#"{
    chapter.1BE666F01EFFC00D.title: "Tips and Tricks"
    chapter.1D42B373285DEF81.title: "Silent Gear"
}"#;
        fs::write(nested_dir.join("utils.snbt"), nested_content).unwrap();
        
        let titles = parse_chapter_titles(&quests_dir);
        
        assert_eq!(titles.len(), 6);
        assert_eq!(titles.get("007B547630FF0478"), Some(&"Theurgy".to_string()));
        assert_eq!(titles.get("05E614FDA677D85E"), Some(&"Food and Farming".to_string()));
        assert_eq!(titles.get("07210DDF872160BA"), Some(&"Applied Energistics 2".to_string()));
        assert_eq!(titles.get("0A093D8C4429B627"), Some(&"Mekanism: Reactors".to_string()));
        assert_eq!(titles.get("1BE666F01EFFC00D"), Some(&"Tips and Tricks".to_string()));
        assert_eq!(titles.get("1D42B373285DEF81"), Some(&"Silent Gear".to_string()));
    }

    #[test]
    fn test_parse_chapter_titles_handles_missing_dir() {
        let dir = tempdir().unwrap();
        let quests_dir = dir.path().join("quests");
        fs::create_dir_all(&quests_dir).unwrap();
        // No lang dir
        
        let titles = parse_chapter_titles(&quests_dir);
        assert!(titles.is_empty());
    }

    #[test]
    fn test_parse_chapter_titles_prefers_en_us() {
        let dir = tempdir().unwrap();
        let quests_dir = dir.path().join("quests");
        let lang_dir = quests_dir.join("lang");
        
        let en_us_dir = lang_dir.join("en_us").join("chapters");
        fs::create_dir_all(&en_us_dir).unwrap();
        let en_content = r#"{
    chapter.TEST_UUID.title: "English Title"
}"#;
        fs::write(en_us_dir.join("test.snbt"), en_content).unwrap();
        
        let fr_fr_dir = lang_dir.join("fr_fr").join("chapters");
        fs::create_dir_all(&fr_fr_dir).unwrap();
        let fr_content = r#"{
    chapter.TEST_UUID.title: "Titre Francais"
}"#;
        fs::write(fr_fr_dir.join("test.snbt"), fr_content).unwrap();
        
        let titles = parse_chapter_titles(&quests_dir);
        assert_eq!(titles.get("TEST_UUID"), Some(&"English Title".to_string()));
    }

    #[test]
    fn test_parse_group_titles_resolves_chapter_group_prefix() {
        let dir = tempdir().unwrap();
        let quests_dir = dir.path().join("quests");
        let lang_dir = quests_dir.join("lang").join("en_us");
        fs::create_dir_all(&lang_dir).unwrap();

        let content = r#"{
    chapter_group.029264819125415F.title: "&f&lSkyblock Quests"
    chapter_group.428CE9AF17D90D68.title: "&f&lThe Basics"
    chapter.6D5CCD51C7A73F40.title: "&fWelcome"
}"#;
        fs::write(lang_dir.join("en_us.snbt"), content).unwrap();

        let groups = parse_group_titles(&quests_dir);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups.get("029264819125415F"), Some(&"&f&lSkyblock Quests".to_string()));
        assert_eq!(groups.get("428CE9AF17D90D68"), Some(&"&f&lThe Basics".to_string()));
        // Chapter keys must not leak into group titles
        assert!(groups.get("6D5CCD51C7A73F40").is_none());
    }
}
