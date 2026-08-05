use super::chapter::{parse_chapter_groups, parse_snbt_chapter_file};
use super::chapter_json5::parse_json5_chapter_file;
use super::LangTitles;
use super::standalone::{parse_standalone_json5_quest_files, parse_standalone_quest_files};
use super::super::types::{FtBQuestsFormat, FtBQuestsLayout, FtBQuestsImportResult, ImportIssue, IssueSeverity, IssueCategory};
use crate::quest::*;
use std::path::Path;

pub(super) fn dispatch_layout(
    quests_dir: &Path,
    format: FtBQuestsFormat,
    layout: FtBQuestsLayout,
    graph: &mut QuestGraph,
    result: &mut FtBQuestsImportResult,
    lang_titles: &LangTitles,
) -> anyhow::Result<(usize, usize, usize, usize)> {
    let mut chapter_count = 0usize;
    let mut quest_count = 0usize;
    let mut files_processed = 0usize;
    let mut files_failed = 0usize;

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
                            match parse_snbt_chapter_file(&chapter_file, graph, result, lang_titles) {
                                Ok((quests_in_chapter, chapter_id)) => {
                                    chapter_count += 1;
                                    quest_count += quests_in_chapter;
                                    quest_count += parse_standalone_quest_files(&dir_path, &chapter_id, graph, result)?;
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
                            match parse_json5_chapter_file(&chapter_file, graph, result, lang_titles) {
                                Ok((quests_in_chapter, chapter_id)) => {
                                    chapter_count += 1;
                                    quest_count += quests_in_chapter;
                                    quest_count += parse_standalone_json5_quest_files(&dir_path, &chapter_id, graph, result)?;
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
            parse_chapter_groups(&quests_dir, format, graph, result, lang_titles);
            if let Ok(entries) = std::fs::read_dir(&chapters_dir) {
                for entry in entries.flatten() {
                    let file_path = entry.path();
                    if !file_path.is_file() { continue; }
                    let ext = file_path.extension().unwrap_or_default();
                    if ext != "snbt" && ext != "json5" && ext != "json" { continue; }

                    let parse_result = match format {
                        FtBQuestsFormat::Snbt if ext == "snbt" => {
                            files_processed += 1;
                            parse_snbt_chapter_file(&file_path, graph, result, lang_titles)
                        }
                        FtBQuestsFormat::Json5 if ext == "json5" || ext == "json" => {
                            files_processed += 1;
                            parse_json5_chapter_file(&file_path, graph, result, lang_titles)
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
            parse_chapter_groups(&quests_dir, format, graph, result, lang_titles);
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
                            parse_snbt_chapter_file(&file_path, graph, result, lang_titles)
                        }
                        FtBQuestsFormat::Json5 if ext == "json5" || ext == "json" => {
                            files_processed += 1;
                            parse_json5_chapter_file(&file_path, graph, result, lang_titles)
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
    Ok((chapter_count, quest_count, files_processed, files_failed))
}
