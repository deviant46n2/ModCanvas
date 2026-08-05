use std::path::PathBuf;

/// Deploy the Workbench Companion mod to a game directory.
/// Standalone function callable from anywhere (not tied to InstanceManager).
///
/// v1 target is **1.21.1 NeoForge only** (todo.md Phase 3): fabric/forge
/// variants are archived and not deployed. Unknown loaders return an error.
pub fn deploy_companion_mod_to_dir(game_dir: &PathBuf, loader: &str, _mc_version: &str) -> Result<(), String> {
    let mods_dir = game_dir.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let loader_lower = loader.to_lowercase();
    let companion_dirs: &[&str] = match loader_lower.as_str() {
        "neoforge" => &["workbench-companion-neoforge-1.21"],
        other => {
            return Err(format!(
                "Companion mod v1 targets 1.21.1 NeoForge only (loader was {other}); no companion is deployed."
            ))
        }
    };

    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../");
    let fallback_root = PathBuf::from("/home/deviant/Projects/ModCanvas");

    for dir in companion_dirs {
        for root in [&project_root, &fallback_root] {
            let candidate = root.join(dir).join("build/libs/workbench-companion-1.0.0.jar");
            if candidate.exists() {
                let dest_jar = mods_dir.join("workbench-companion-1.0.0.jar");
                std::fs::copy(&candidate, &dest_jar)
                    .map_err(|e| format!("Failed to copy companion mod: {e}"))?;
                eprintln!("[ModCanvas] Deployed companion mod ({}) from {:?}", loader_lower, candidate);
                return Ok(());
            }
        }
    }

    Err(format!(
        "Companion mod JAR for {loader} not found. Build one of: {}. Build it first.",
        companion_dirs.join(", ")
    ))
}
