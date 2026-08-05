use std::collections::HashMap;
use std::path::Path;
use crate::imports::snbt::{parse_snbt};

use super::{SnbtSidecar};

/// Rebuild a sidecar from the on-disk quests directory.  This lets live export
/// paths (`export_ftb_quests_to_dir`, `write_quest_graph_to_instance`) preserve
/// comments that exist on disk even when the graph was not freshly imported
/// into this process — the on-disk files are the source of truth for what the
/// user's pack currently contains.
///
/// Covers every layout the importer understands: Subdirs
/// (`<chapter>/chapter.snbt` + standalone quests), FlatChapters
/// (`chapters/*.snbt`), old Flat (root `*.snbt`), plus book-level files
/// (`data.snbt`, `chapter_groups.snbt`, `reward_tables/*.snbt`).
pub fn build_sidecar_from_quests_dir(quests_dir: &Path) -> SnbtSidecar {
    let mut sidecar = SnbtSidecar::new();
    if !quests_dir.is_dir() {
        return sidecar;
    }

    // Book-level files
    collect_book_file(&mut sidecar, quests_dir, "data.snbt", "book:data");
    collect_book_file(&mut sidecar, quests_dir, "chapter_groups.snbt", "book:chapter_groups");

    // Reward tables (16-digit uppercase hex file names)
    let reward_tables_dir = quests_dir.join("reward_tables");
    if let Ok(entries) = std::fs::read_dir(&reward_tables_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().map_or(false, |e| e == "snbt") {
                let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                collect_raw(&mut sidecar, format!("book:reward_table:{stem}"), &p);
            }
        }
    }

    // Subdirs: <chapter>/chapter.snbt + standalone quest files in chapter dirs
    if let Ok(entries) = std::fs::read_dir(quests_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() {
                continue;
            }
            let dir_name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            if dir_name == "chapters" || dir_name == "reward_tables" {
                continue;
            }
            let chapter_file = p.join("chapter.snbt");
            if chapter_file.is_file() {
                collect_chapter(&mut sidecar, &chapter_file);
            }
            if let Ok(q_entries) = std::fs::read_dir(&p) {
                for q in q_entries.flatten() {
                    let qp = q.path();
                    if !qp.is_file() || qp.extension().map_or(false, |e| e != "snbt") {
                        continue;
                    }
                    let name = qp.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                    if name != "chapter" && name != "data" {
                        collect_quest(&mut sidecar, &qp);
                    }
                }
            }
        }
    }

    // FlatChapters: quests_dir/chapters/*.snbt
    let chapters_dir = quests_dir.join("chapters");
    if let Ok(entries) = std::fs::read_dir(&chapters_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().map_or(false, |e| e == "snbt") {
                collect_chapter(&mut sidecar, &p);
            }
        }
    }

    // Old Flat: root *.snbt (skip data/chapter_groups handled above)
    if let Ok(entries) = std::fs::read_dir(quests_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_file() || p.extension().map_or(false, |e| e != "snbt") {
                continue;
            }
            let name = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            if name != "data" && name != "chapter_groups" {
                collect_chapter(&mut sidecar, &p);
            }
        }
    }

    sidecar
}

fn collect_raw(sidecar: &mut SnbtSidecar, key: String, path: &Path) {
    if let Ok(content) = std::fs::read_to_string(path) {
        sidecar.insert(key, content);
    }
}

fn collect_book_file(sidecar: &mut SnbtSidecar, dir: &Path, filename: &str, key: &str) {
    let p = dir.join(filename);
    if p.is_file() {
        collect_raw(sidecar, key.to_string(), &p);
    }
}

fn collect_chapter(sidecar: &mut SnbtSidecar, path: &Path) {
    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(snbt) = parse_snbt(&content) {
            if let Some(id) = snbt.get_str("id") {
                sidecar.insert(format!("chapter:{id}"), content);
            }
        }
    }
}

fn collect_quest(sidecar: &mut SnbtSidecar, path: &Path) {
    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(snbt) = parse_snbt(&content) {
            if let Some(id) = snbt.get_str("id") {
                sidecar.insert(format!("quest:{id}"), content);
            }
        }
    }
}
