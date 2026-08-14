use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

/// Locate the built companion jar: bundled app resources first (distribution —
/// the flatpak manifest installs it to /app/share/modcanvas/companion/), then
/// the repo build output (dev). Returns `None` when no jar has been built yet
/// (or the loader is unsupported).
pub fn resolve_companion_source_jar(loader: &str) -> Option<PathBuf> {
    let loader_lower = loader.to_lowercase();
    let companion_dirs: &[&str] = match loader_lower.as_str() {
        "neoforge" => &["workbench-companion-neoforge-1.21"],
        _ => return None,
    };

    // Bundled resource (distribution). Resolved relative to the exe so the
    // same lookup works for any bundle layout. s55: the lookup previously
    // only knew dev-machine paths (CARGO_MANIFEST_DIR + a hardcoded
    // /home/deviant/...), so a sandboxed build — or ANY foreign machine,
    // including the friend's AppImage — could never deploy the companion.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let bundled = exe_dir
                .join("../share/modcanvas/companion/workbench-companion-1.0.0.jar");
            if bundled.exists() {
                return Some(bundled);
            }
        }
    }

    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../");
    // DEV-ONLY fallback (machine-specific path; NOT a distribution path —
    // the bundled lookup above is what ships).
    let fallback_root = PathBuf::from("/home/deviant/Projects/ModCanvas");

    for dir in companion_dirs {
        for root in [&project_root, &fallback_root] {
            let candidate = root.join(dir).join("build/libs/workbench-companion-1.0.0.jar");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Deploy the Workbench Companion mod to a game directory.
/// Standalone function callable from anywhere (not tied to InstanceManager).
///
/// v1 target is **1.21.1 NeoForge only** (todo.md Phase 3): fabric/forge
/// variants are archived and not deployed. Unknown loaders return an error.
pub fn deploy_companion_mod_to_dir(game_dir: &Path, loader: &str, _mc_version: &str) -> Result<(), String> {
    let loader_lower = loader.to_lowercase();
    if loader_lower != "neoforge" {
        return Err(format!(
            "Companion mod v1 targets 1.21.1 NeoForge only (loader was {loader}); no companion is deployed."
        ));
    }

    let mods_dir = game_dir.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let source_jar = resolve_companion_source_jar(loader)
        .ok_or_else(|| format!("Companion mod JAR for {loader} not found. Build it first."))?;

    let dest_jar = mods_dir.join("workbench-companion-1.0.0.jar");
    std::fs::copy(&source_jar, &dest_jar)
        .map_err(|e| format!("Failed to copy companion mod: {e}"))?;
    eprintln!("[ModCanvas] Deployed companion mod ({}) from {:?}", loader_lower, source_jar);
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionDeployStatus {
    /// The companion jar is present in the instance's mods folder.
    pub deployed: bool,
    /// A newer build exists in the repo than the deployed copy (i.e. the
    /// deployed companion predates the last build).
    pub stale: bool,
}

/// Inspect whether the companion jar is deployed to a game directory, and
/// whether the deployed copy is older than the repo's current build.
pub fn companion_deploy_status(game_dir: &Path, source_jar: Option<&Path>) -> CompanionDeployStatus {
    let deployed_jar = game_dir.join("mods").join("workbench-companion-1.0.0.jar");
    let deployed = deployed_jar.exists();
    let stale = if deployed {
        match source_jar {
            Some(src) if src.exists() => {
                let src_mtime = std::fs::metadata(src)
                    .and_then(|m| m.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH);
                let dep_mtime = std::fs::metadata(&deployed_jar)
                    .and_then(|m| m.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH);
                src_mtime > dep_mtime
            }
            _ => false,
        }
    } else {
        false
    };
    CompanionDeployStatus { deployed, stale }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deploy_status_reports_missing_when_no_jar() {
        let dir = std::env::temp_dir().join(format!("mc_companion_test_missing_{}", std::process::id()));
        std::fs::create_dir_all(dir.join("mods")).unwrap();
        let status = companion_deploy_status(&dir, None);
        assert!(!status.deployed);
        assert!(!status.stale);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn deploy_status_reports_stale_when_source_is_newer() {
        let dir = std::env::temp_dir().join(format!("mc_companion_test_stale_{}", std::process::id()));
        std::fs::create_dir_all(dir.join("mods")).unwrap();
        let deployed = dir.join("mods").join("workbench-companion-1.0.0.jar");
        std::fs::write(&deployed, b"old").unwrap();

        // A fake newer source jar.
        let source = dir.join("source.jar");
        std::fs::write(&source, b"new").unwrap();
        // Force the deployed jar clearly older than the source (fs mtime
        // granularity is 1s, so write-order alone is not reliable).
        let old = SystemTime::now() - std::time::Duration::from_secs(60);
        let _ = std::fs::File::options().write(true).open(&deployed)
            .and_then(|f| f.set_modified(old));

        let status = companion_deploy_status(&dir, Some(&source));
        assert!(status.deployed);
        assert!(status.stale);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn deploy_status_fresh_when_source_is_older() {
        let dir = std::env::temp_dir().join(format!("mc_companion_test_fresh_{}", std::process::id()));
        std::fs::create_dir_all(dir.join("mods")).unwrap();
        let deployed = dir.join("mods").join("workbench-companion-1.0.0.jar");
        std::fs::write(&deployed, b"new").unwrap();

        let source = dir.join("source.jar");
        std::fs::write(&source, b"old").unwrap();
        // Force the source mtime older than the deployed jar.
        let old = SystemTime::now() - std::time::Duration::from_secs(60);
        let _ = std::fs::File::options().write(true).open(&source)
            .and_then(|f| f.set_modified(old));

        let status = companion_deploy_status(&dir, Some(&source));
        assert!(status.deployed);
        assert!(!status.stale);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
