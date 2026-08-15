// Instance layer discovery: locate the jars, resource packs and vanilla
// version jars that define a modpack's resource stack, in load order.

use std::fs;
use std::path::{Path, PathBuf};

/// All `.jar` files under `dir` (recursive), sorted for determinism.
pub(super) fn jars_under(dir: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for entry in fs::read_dir(&d).ok().into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().map_or(false, |e| e == "jar") {
                out.push(path);
            }
        }
    }
    out.sort();
    out
}

/// Locate the vanilla client jar for this instance. Delegates to the shared
/// `indexer::vanilla::find_vanilla_jars` — the single source of truth for
/// launcher layouts (Prism/MultiMC `libraries/net/minecraft/client/` via
/// ancestor walk, vanilla `versions/`, `~/.minecraft/versions/`, root
/// `minecraft.jar`). The ancestor walk is OS-agnostic: the launcher-relative
/// layout is identical on Linux, Windows and macOS (s57 — the texture index
/// previously had its own copy that only knew `versions/` + `~/.ftba`, so a
/// Prism instance's vanilla layer came back empty and every vanilla item
/// texture was missing from the index).
pub(super) fn vanilla_jars(instance_path: &Path) -> Vec<PathBuf> {
    crate::indexer::find_vanilla_jars(instance_path)
}

/// Resource pack load order from `options.txt` (last listed = highest
/// priority). Falls back to sorted filenames when absent.
pub(super) fn resource_pack_order(instance_path: &Path) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    if let Ok(txt) = fs::read_to_string(instance_path.join("options.txt")) {
        if let Some(start) = txt.find("resourcePacks:") {
            let after = &txt[start + "resourcePacks:".len()..];
            let bytes: Vec<char> = after.lines().next().unwrap_or("").trim().chars().collect();
            let mut i = 0;
            while i < bytes.len() {
                if bytes[i] == ']' {
                    break;
                }
                if bytes[i] == '"' {
                    let mut s = String::new();
                    i += 1;
                    while i < bytes.len() && bytes[i] != '"' {
                        s.push(bytes[i]);
                        i += 1;
                    }
                    if !s.is_empty() {
                        names.push(s);
                    }
                }
                i += 1;
            }
        }
    }
    if names.is_empty() {
        let mut dirs: Vec<String> = fs::read_dir(instance_path.join("resourcepacks"))
            .ok()
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| e.path().extension().map_or(false, |e| e == "zip" || e == "jar"))
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        dirs.sort();
        return dirs;
    }
    names.into_iter().filter(|n| n != "vanilla").map(|n| n.trim_start_matches("file/").to_string()).collect()
}
