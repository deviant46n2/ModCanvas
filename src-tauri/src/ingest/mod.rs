//! Texture ingestion for a modpack instance: scan mod jars + kubejs/assets,
//! build a `VirtualAssetRegistry`, cache it, and serve textures on demand.
//! Split into: `models` (data), `scan` (jar/kubejs walking), `cache`
//! (disk cache paths + load), `resolve` (key → data URL), `commands`
//! (tauri IPC surface), and this file's orchestration + tests.

pub mod commands;
mod cache;
pub mod models;
mod resolve;
mod scan;

pub use commands::{get_texture_files, ingest_active_instance_cmd};
pub use models::{IngestProgress, IngestResult, TextureEntry, VirtualAssetRegistry};
pub use scan::scan_kubejs_assets;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use cache::cache_path;
use models::{empty_ingest_result, IngestCache};
use scan::{collect_jars_with_meta, scan_jar_textures_for_registry};

/// Ingest an active modpack instance: scan all `.jar` files, build a
/// `VirtualAssetRegistry`, cache the result, and return it along with counts.
pub fn ingest_active_instance(instance_path: &Path) -> IngestResult {
    ingest_active_instance_with_progress(instance_path, false, &mut |_| {})
}

/// Ingest an instance, reporting granular progress along the way.
///
/// When `force` is set the on-disk cache is bypassed (and discarded) so a
/// same-size/same-mtime file replacement is still picked up on the next full
/// re-index.
pub fn ingest_active_instance_with_progress(
    instance_path: &Path,
    force: bool,
    progress: &mut dyn FnMut(&IngestProgress),
) -> IngestResult {
    let act = instance_path.to_string_lossy().to_string();
    let mods_dir = instance_path.join("mods");
    let kubejs_assets_dir = instance_path.join("kubejs").join("assets");
    let _config_dir = instance_path.join("config").join("ftbquests");

    eprintln!("[Ingestion] Starting ingest for: {}", act);
    eprintln!("[Ingestion] mods_dir: {:?}", mods_dir);
    eprintln!("[Ingestion] mods_dir exists: {}", mods_dir.exists());
    eprintln!("[Ingestion] kubejs_assets_dir: {:?}", kubejs_assets_dir);
    eprintln!("[Ingestion] kubejs_assets_dir exists: {}", kubejs_assets_dir.exists());

    progress(&IngestProgress {
        stage: "textures".to_string(),
        message: "Locating mod jars in mods/ folder".to_string(),
        progress: 5,
        file: None,
        done: 0,
        total: 0,
    });

    if !mods_dir.exists() {
        eprintln!("[Ingestion] No mods directory at {:?}, returning empty registry", mods_dir);
        progress(&IngestProgress {
            stage: "textures".to_string(),
            message: "No mods folder found".to_string(),
            progress: 10,
            file: None,
            done: 0,
            total: 0,
        });
        return empty_ingest_result(act);
    }

    // Collect jars with metadata for caching
    let current_jars: Vec<(PathBuf, u64, u64, String)> = match collect_jars_with_meta(&mods_dir) {
        Ok(jars) => jars,
        Err(_) => return empty_ingest_result(act),
    };

    let jars_scanned = current_jars.len();
    eprintln!("[Ingestion] Found {} jar files in {:?}", jars_scanned, mods_dir);

    // Check cache (skipped entirely for a forced full re-index, whose cache is
    // discarded below so the next load does not resurrect it).
    const CACHE_VERSION: u32 = 3;
    if force {
        let cp = cache_path(&mods_dir);
        if cp.exists() {
            let _ = fs::remove_file(&cp);
            eprintln!("[Ingestion] Forced re-index: discarded cache for {}", act);
        }
    }
    let cache_hit = {
        let cp = cache_path(&mods_dir);
        if cp.exists() {
            if let Ok(data) = fs::read_to_string(&cp) {
                if let Ok(cached) = serde_json::from_str::<IngestCache>(&data) {
                    if cached.jar_count == jars_scanned && cached.cache_version == CACHE_VERSION {
                        // Check if kubejs/assets have changed
                        let kubejs_mtime = if kubejs_assets_dir.exists() {
                            fs::metadata(&kubejs_assets_dir)
                                .and_then(|m| m.modified())
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs())
                        } else {
                            None
                        };
                        // Also count kubejs textures to detect key generation changes
                        let kubejs_texture_count = if kubejs_assets_dir.exists() {
                            scan_kubejs_assets(&kubejs_assets_dir).map(|t| t.len()).unwrap_or(0)
                        } else {
                            0
                        };
                        let kubejs_changed = cached.kubejs_assets_mtime != kubejs_mtime
                            || cached.kubejs_texture_count != kubejs_texture_count;

                        if !kubejs_changed {
                            eprintln!("[Ingestion] Cache hit: {} textures for {}", cached.textures_indexed, &act);
                            progress(&IngestProgress {
                                stage: "textures".to_string(),
                                message: format!("Cache hit: {} textures from {} mods", cached.textures_indexed, jars_scanned),
                                progress: 32,
                                file: None,
                                done: jars_scanned,
                                total: jars_scanned.max(1),
                            });
                            let mut by_id: HashMap<String, String> = HashMap::new();
                            for entry in &cached.textures {
                                by_id.insert(entry.raw_key.clone(), entry.file_path.clone());
                                by_id.insert(entry.canonical_key.clone(), entry.file_path.clone());
                                by_id.insert(entry.clean_key.clone(), entry.file_path.clone());
                            }
                            return IngestResult {
                                asset_registry: VirtualAssetRegistry {
                                    by_id,
                                    all_textures: cached.textures.clone(),
                                    jars_scanned,
                                    textures_indexed: cached.textures_indexed,
                                },
                                jars_scanned,
                                textures_indexed: cached.textures_indexed,
                                active_instance: act,
                                mods: Some(scanned_jar_names(&current_jars)),
                            };
                        } else {
                            eprintln!("[Ingestion] kubejs/assets changed (mtime or texture count), re-scanning...");
                        }
                    } else if cached.cache_version != CACHE_VERSION {
                        eprintln!("[Ingestion] Cache version mismatch (have {}, need {}), re-scanning...", cached.cache_version, CACHE_VERSION);
                    }
                }
            }
        }
        false
    };

    if !cache_hit {
        eprintln!("[Ingestion] Scanning {} jar files in {:?}...", jars_scanned, mods_dir);
    }

    let total_jars = jars_scanned.max(1);
    progress(&IngestProgress {
        stage: "textures".to_string(),
        message: if cache_hit { "Reading cached texture index".to_string() } else { format!("Scanning {jars_scanned} mod jars for textures") },
        progress: 12,
        file: None,
        done: 0,
        total: total_jars,
    });

    let scan_results: Vec<Vec<TextureEntry>> = current_jars
        .iter()
        .enumerate()
        .map(|(i, (jar_path, _, _, _))| {
            progress(&IngestProgress {
                stage: "textures".to_string(),
                message: "Scanning mod jar for textures".to_string(),
                progress: 12 + ((i as u8).saturating_mul(18) / total_jars as u8).min(18),
                file: Some(
                    jar_path
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default(),
                ),
                done: i + 1,
                total: total_jars,
            });
            scan_jar_textures_for_registry(jar_path).unwrap_or_else(|e| {
                eprintln!("[Ingestion] Failed to scan jar {}: {}", jar_path.display(), e);
                Vec::new()
            })
        })
        .collect();

    let mut all_textures: Vec<TextureEntry> = Vec::new();
    let mut by_id: HashMap<String, String> = HashMap::new();

    for textures in scan_results {
        for tex in textures {
            // Store file path instead of base64 data URL
            by_id.insert(tex.raw_key.clone(), tex.file_path.clone());
            by_id.insert(tex.canonical_key.clone(), tex.file_path.clone());
            by_id.insert(tex.clean_key.clone(), tex.file_path.clone());
            all_textures.push(tex);
        }
    }

    // Also scan kubejs/assets for runtime-generated textures
    if kubejs_assets_dir.exists() {
        eprintln!("[Ingestion] Scanning kubejs/assets in {:?}...", kubejs_assets_dir);
        if let Ok(kubejs_textures) = scan_kubejs_assets(&kubejs_assets_dir) {
            eprintln!("[Ingestion] Found {} additional textures from kubejs/assets", kubejs_textures.len());
            for tex in kubejs_textures {
                by_id.insert(tex.raw_key.clone(), tex.file_path.clone());
                by_id.insert(tex.canonical_key.clone(), tex.file_path.clone());
                by_id.insert(tex.clean_key.clone(), tex.file_path.clone());
                all_textures.push(tex);
            }
        }
    }

    let textures_indexed = all_textures.len();
    eprintln!("[Ingestion] Indexed {} textures for instance {}", textures_indexed, act);

    progress(&IngestProgress {
        stage: "textures".to_string(),
        message: format!("Indexed {textures_indexed} textures from {jars_scanned} mods"),
        progress: 32,
        file: None,
        done: jars_scanned,
        total: total_jars,
    });

    // Save cache
    let kubejs_mtime = if kubejs_assets_dir.exists() {
        fs::metadata(&kubejs_assets_dir)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
    } else {
        None
    };
    let kubejs_texture_count = if kubejs_assets_dir.exists() {
        scan_kubejs_assets(&kubejs_assets_dir).map(|t| t.len()).unwrap_or(0)
    } else {
        0
    };

    let cache = IngestCache {
        textures: all_textures.clone(),
        textures_indexed,
        jar_count: jars_scanned,
        kubejs_assets_mtime: kubejs_mtime,
        kubejs_texture_count,
        cache_version: CACHE_VERSION,
    };
    let cp = cache_path(&mods_dir);
    if let Ok(data) = serde_json::to_string(&cache) {
        let _ = fs::write(&cp, &data);
        eprintln!("[Ingestion] Cache saved for {}", act);
    }

    IngestResult {
        asset_registry: VirtualAssetRegistry {
            by_id,
            all_textures,
            jars_scanned,
            textures_indexed,
        },
        jars_scanned,
        textures_indexed,
        active_instance: act,
        mods: Some(scanned_jar_names(&current_jars)),
    }
}

/// The jar file names present in the mods dir — the scan proof for the
/// pack-health core-mod gate (s53). Collected on every ingest, cache hit or
/// not, because `collect_jars_with_meta` runs before the cache check.
fn scanned_jar_names(current_jars: &[(std::path::PathBuf, u64, u64, String)]) -> Vec<String> {
    current_jars
        .iter()
        .map(|(p, _, _, _)| {
            p.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        })
        .collect()
}

#[cfg(test)]
mod tests;
