use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Find the vanilla Minecraft client JAR and other library JARs that contain
/// item registrations (e.g. `assets/minecraft/lang/en_us.json`).
///
/// Checks these locations in order:
/// 1. PrismLauncher/MultiMC: `{launcher_root}/libraries/net/minecraft/client/`
/// 2. `{instance_root}/minecraft.jar` (some launchers keep it at the instance root)
/// 3. `versions/` — both `{instance_path}/versions/` and `{instance_root}/versions/`
/// 4. `~/.minecraft/versions/` (global Vanilla launcher directory)
/// 5. JARs directly in the instance path (excluding `mods/`)
///
/// NOT checked: `~/.ftba/bin/versions/` (FTB App) — removed s57: no
/// `LauncherDriver` implements the FTB App, no test or doc references it, and
/// the item-registry indexer never had it. Keeping it in the texture path
/// alone would make the two consumers inconsistent, and it broke test
/// hermicity on hosts with an FTB App install. Revisit only if an FTB App
/// driver ever lands.
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

    // 3. Check `versions/` dirs — two instance shapes exist in the wild:
    //    - `{instance_path}/versions/` (vanilla launcher style: versions live
    //      INSIDE the game dir, e.g. `.../1.21.1/minecraft/versions/`)
    //    - `{instance_path.parent()}/versions/` (some launchers keep versions
    //      as a sibling of the game dir, e.g. `.../instances/NAME/versions/`)
    //    Check both so neither convention is missed (s57: the texture index's
    //    own copy only knew the first; the indexer only the second — the
    //    merged function must honor both).
    for versions_dir in [
        Some(instance_path.join("versions")),
        instance_path.parent().map(|p| p.join("versions")),
    ] {
        let Some(versions_dir) = versions_dir else { continue };
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
