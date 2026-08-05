use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Find the vanilla Minecraft client JAR and other library JARs that contain
/// item registrations (e.g. `assets/minecraft/lang/en_us.json`).
///
/// Checks these locations in order:
/// 1. PrismLauncher/MultiMC: `{launcher_root}/libraries/net/minecraft/client/`
/// 2. `{instance_root}/minecraft.jar` (some launchers keep it at the instance root)
/// 3. `{instance_root}/versions/` (Vanilla launcher style)
/// 4. `~/.minecraft/versions/` (global Vanilla launcher directory)
/// 5. JARs directly in the instance path (excluding `mods/`)
pub(crate) fn find_vanilla_jars(instance_path: &Path) -> Vec<PathBuf> {
    let mut jars = Vec::new();

    // 1. PrismLauncher / MultiMC: launcher root is 3 levels up from `instances/NAME/minecraft`
    //    e.g. `.../PrismLauncher/instances/1.21.1/minecraft`
    //                                    ^-- parent
    //                           ^-- parent     (= instances/1.21.1/)
    //                  ^-- parent              (= instances/)
    //         ^-- parent                       (= PrismLauncher/)
    //    libraries at `{launcher}/libraries/net/minecraft/client/`
    for ancestor in instance_path.ancestors().skip(1) {
        let client_lib = ancestor.join("libraries").join("net").join("minecraft").join("client");
        if client_lib.exists() {
            for entry in WalkDir::new(&client_lib).max_depth(3).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                let fname = path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default();
                if fname.ends_with(".jar") && fname.contains("client") && !fname.contains("slim") {
                    jars.push(path.to_path_buf());
                }
            }
            break;
        }
    }

    // 2. Check the instance root directory itself
    let root_jar = instance_path.join("minecraft.jar");
    if root_jar.exists() {
        jars.push(root_jar);
    }

    // 3. Check a `versions/` dir at the instance root (parent of the minecraft dir)
    if let Some(parent_dir) = instance_path.parent() {
        let versions_dir = parent_dir.join("versions");
        if versions_dir.exists() {
            for entry in WalkDir::new(&versions_dir).max_depth(2).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "jar") {
                    jars.push(path.to_path_buf());
                }
            }
        }
    }

    // 4. Vanilla launcher: ~/.minecraft/versions/
    if let Ok(home) = std::env::var("HOME") {
        let home_versions = PathBuf::from(home).join(".minecraft").join("versions");
        if home_versions.exists() {
            for entry in WalkDir::new(&home_versions).max_depth(2).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "jar") {
                    jars.push(path.to_path_buf());
                }
            }
        }
    }

    // Deduplicate by canonical path
    let mut seen = std::collections::HashSet::new();
    jars.into_iter().filter(|p| {
        let canonical = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
        seen.insert(canonical)
    }).collect()
}
