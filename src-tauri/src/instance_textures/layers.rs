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

/// Locate the vanilla client jar for this instance. Prefers a jar matching the
/// instance's Minecraft version (from `version.json`), falling back to the
/// sorted set of candidate jars.
pub(super) fn vanilla_jars(instance_path: &Path) -> Vec<PathBuf> {
    let candidates = {
        let mut jars = jars_under(&instance_path.join("versions"));
        if let Ok(home) = std::env::var("HOME") {
            jars.extend(jars_under(&Path::new(&home).join(".ftba").join("bin").join("versions")));
        }
        jars.sort();
        jars
    };
    if candidates.is_empty() {
        return candidates;
    }
    let mc_version = fs::read_to_string(instance_path.join("version.json"))
        .ok()
        .and_then(|txt| txt.find("\"id\"").map(|i| {
            let after = &txt[i + 5..];
            let start = after.find('"').map(|s| s + 1).unwrap_or(0);
            let rest = &after[start..];
            rest.find('"').map(|e| rest[..e].to_string()).unwrap_or_default()
        }))
        .filter(|v| !v.is_empty());
    if let Some(ver) = mc_version {
        let matched: Vec<PathBuf> = candidates
            .iter()
            .filter(|p| p.to_string_lossy().contains(&format!("/{}/", ver)))
            .cloned()
            .collect();
        if !matched.is_empty() {
            return matched;
        }
    }
    candidates
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
