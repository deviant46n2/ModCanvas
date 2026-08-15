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
///
/// VERSION-SCOPING (s58): the shared `libraries/net/minecraft/client/` dir
/// holds client jars for EVERY version installed on the machine. An instance's
/// vanilla layer must only ever contain ITS OWN version's jar — serving a
/// 1.20.1 jar to a 1.21.1 pack silently resolves wrong models/textures (the
/// s57 delegation inherited this from the indexer; the old layers.rs at least
/// tried to version-match). The instance version comes from `mmc-pack.json`
/// (authoritative for Prism/MultiMC) with a `version.json` fallback (vanilla
/// launcher). When NO version can be resolved, the shared sweep contributes
/// NOTHING rather than risk serving a wrong-version jar — never serve wrong
/// data (s58 ruling). Instance-local sources (root `minecraft.jar`, in-instance
/// `versions/`) are scoped to the instance by construction and always kept.
pub(crate) fn find_vanilla_jars(instance_path: &Path) -> Vec<PathBuf> {
    let mut jars = Vec::new();
    let mc_version = resolve_instance_mc_version(instance_path);

    // 1. PrismLauncher / MultiMC: launcher root is 3 levels up from `instances/NAME/minecraft`
    //    e.g. `.../PrismLauncher/instances/1.21.1/minecraft`
    //                                    ^-- parent
    //                           ^-- parent     (= instances/1.21.1/)
    //                  ^-- parent              (= instances/)
    //         ^-- parent                       (= PrismLauncher/)
    //    libraries at `{launcher}/libraries/net/minecraft/client/`
    if let Some(ver) = &mc_version {
        for ancestor in instance_path.ancestors().skip(1) {
            let client_lib = ancestor.join("libraries").join("net").join("minecraft").join("client");
            if client_lib.exists() {
                for entry in WalkDir::new(&client_lib).max_depth(3).into_iter().filter_map(|e| e.ok()) {
                    let path = entry.path();
                    let fname = path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default();
                    if fname.ends_with(".jar") && fname.contains("client") && !fname.contains("slim") {
                        // Only the instance's own version: dirs are named
                        // `{version}-{timestamp}` (e.g. 1.21.1-20240808.144430).
                        if path.to_string_lossy().contains(&format!("/{ver}-")) {
                            jars.push(path.to_path_buf());
                        }
                    }
                }
                break;
            }
        }
    }
    // No resolvable version → the shared dir is skipped entirely (s58 ruling:
    // never serve wrong data). A wrong-version jar is worse than no jar.

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

    // 4. Vanilla launcher: ~/.minecraft/versions/ — machine-global (every
    //    downloaded version lives here), so the same version-scoping applies:
    //    only the dir named `{version}/` is accepted; no resolvable version →
    //    skipped (s58 ruling: never serve wrong data). Instance-local versions/
    //    above are scoped by construction and always kept.
    if let Some(ver) = &mc_version {
        if let Ok(home) = std::env::var("HOME") {
            let home_versions = PathBuf::from(home).join(".minecraft").join("versions");
            if home_versions.exists() {
                for entry in WalkDir::new(&home_versions).max_depth(2).into_iter().filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if path.extension().map_or(false, |ext| ext == "jar") {
                        // Vanilla dirs are named `{version}/` (no timestamp).
                        if path.to_string_lossy().contains(&format!("/{ver}/")) {
                            jars.push(path.to_path_buf());
                        }
                    }
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

/// Resolve the instance's Minecraft version from the authoritative launcher
/// metadata:
/// 1. `mmc-pack.json` (Prism/MultiMC) — the `net.minecraft` component's
///    `version` field. The launcher itself reads this file to know the version.
/// 2. `version.json` (vanilla launcher) — the top-level `id` field.
///
/// Returns `None` when neither source exists or parses — the caller then
/// skips machine-global jar sources rather than serve a wrong version (s58).
fn resolve_instance_mc_version(instance_path: &Path) -> Option<String> {
    // Prism/MultiMC: mmc-pack.json sits in the instance root, one level above
    // the game dir: `.../instances/NAME/minecraft` → `.../instances/NAME/`.
    let root = instance_path.parent()?;
    let mmc = root.join("mmc-pack.json");
    if mmc.exists() {
        if let Ok(content) = fs::read_to_string(&mmc) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(components) = json.get("components").and_then(|v| v.as_array()) {
                    for comp in components {
                        if comp.get("uid").and_then(|u| u.as_str()) == Some("net.minecraft") {
                            if let Some(v) = comp.get("version").and_then(|v| v.as_str()) {
                                return Some(v.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Vanilla launcher: version.json inside the game dir with an `id` field.
    let vj = instance_path.join("version.json");
    if vj.exists() {
        if let Ok(content) = fs::read_to_string(&vj) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(v) = json.get("id").and_then(|v| v.as_str()) {
                    return Some(v.to_string());
                }
            }
        }
    }

    None
}
