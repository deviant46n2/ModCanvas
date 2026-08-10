//! The `CurseForgeImporter`: reads a CurseForge modpack zip (manifest.json +
//! overrides/), extracts it into a persistent per-import game directory with
//! path-safety sanitization, and returns an `ImportResult`.

use crate::imports::{ConfigFile, ImportResult, UnresolvedMod};
use crate::models::{ModLoader, PackFormat};
use anyhow::{Context, Result};
use std::io::Read;
use std::path::Path;
use uuid::Uuid;

use super::manifest::{CurseForgeManifest, CurseForgeModLoader};

pub struct CurseForgeImporter;

impl CurseForgeImporter {
    pub fn can_import(path: &Path) -> bool {
        // Check for manifest.json inside a zip
        if path.extension().map_or(false, |ext| ext == "zip" || ext == "curseforge") {
            if let Ok(file) = std::fs::File::open(path) {
                if let Ok(mut archive) = zip::ZipArchive::new(file) {
                    return archive.by_name("manifest.json").is_ok();
                }
            }
        }
        false
    }

    pub fn import(path: &Path) -> Result<ImportResult> {
        let file = std::fs::File::open(path)
            .with_context(|| format!("Failed to open CurseForge zip: {}", path.display()))?;
        let mut archive = zip::ZipArchive::new(file)
            .with_context(|| "Failed to read CurseForge zip archive")?;

        // Extract manifest.json - read it fully before iterating
        let manifest_content = {
            let mut manifest_file = archive.by_name("manifest.json")
                .with_context(|| "manifest.json not found in CurseForge zip")?;
            let mut manifest_str = String::new();
            manifest_file.read_to_string(&mut manifest_str)?;
            manifest_str
        };

        let manifest: CurseForgeManifest = serde_json::from_str(&manifest_content)
            .with_context(|| "Failed to parse manifest.json")?;

        // Parse mod loader
        let (loader, _loader_version) = parse_curseforge_loader(&manifest.minecraft.mod_loaders);

        // Extract the whole zip into a PERSISTENT per-import game directory.
        // The project must point at a real game dir (config/, mods/, kubejs/...),
        // not at the .zip file — otherwise the workspace has no files to work on
        // and the pack is not launchable. Mirrors the mrpack importer.
        let dest = crate::path_safety::imported_pack_extract_dir(
            path.file_stem().map(|s| s.to_string_lossy()).unwrap_or_default().as_ref(),
        )
        .map_err(|e| anyhow::anyhow!(e))?;
        eprintln!("[ModCanvas] Extracting CurseForge zip to {}", dest.display());

        // Extract with path-safety sanitization: reject traversal and symlink escapes.
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            let name = entry.name().to_string();
            if name == "manifest.json" || name == "modlist.html" {
                continue;
            }
            let safe_rel = crate::path_safety::sanitize_zip_entry_path(&name)
                .map_err(|e| anyhow::anyhow!("Unsafe zip entry path {name}: {e}"))?;
            // CurseForge packs keep everything under `overrides/`; merge that
            // folder into the game-dir root (config/, kubejs/, mods/, ...).
            let overrides_dir = manifest.overrides.as_deref().unwrap_or("overrides");
            let safe_path = std::path::Path::new(&safe_rel);
            let dest_rel = safe_path.strip_prefix(overrides_dir).unwrap_or(safe_path);
            let out = dest.join(dest_rel);
            if entry.is_dir() {
                std::fs::create_dir_all(&out)?;
                continue;
            }
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("Failed to create parent {} for {}", parent.display(), name))?;
            }
            let mut f = std::fs::File::create(&out)
                .with_context(|| format!("Failed to create extracted file {} (from {})", out.display(), name))?;
            std::io::copy(&mut entry, &mut f)?;
        }
        eprintln!("[ModCanvas] CurseForge extraction complete at {}", dest.display());

        let project = crate::models::Project {
            id: Uuid::new_v4(),
            name: manifest.name.clone().unwrap_or_else(|| "CurseForge Pack".to_string()),
            description: manifest.description.clone().unwrap_or_default(),
            minecraft_version: manifest.minecraft.version.clone(),
            mod_loader: loader,
            pack_format: PackFormat::CurseForge,
            pack_version: manifest.version.clone().unwrap_or_else(|| "1.0.0".to_string()),
            author: manifest.author.clone().unwrap_or_default(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            path: dest.to_string_lossy().to_string(),
            source: "modcanvas".to_string(),
        };

        let mut unresolved_mods = Vec::new();
        let mut config_files = Vec::new();

        // Process mods from manifest
        for file in &manifest.files {
            let mod_id = format!("curseforge:{}", file.project_id);
            let version = Some(file.file_id.to_string());

            unresolved_mods.push(UnresolvedMod {
                file_name: mod_id.clone(),
                mod_id: Some(mod_id),
                version,
                loader: None,
            });
        }

        // Collect config files from the extracted game dir (the overrides were
        // merged into the game-dir root above). Binary files (e.g.
        // inventory-particles caches) are skipped.
        for entry in walkdir::WalkDir::new(&dest)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let p = entry.path();
            let rel = p.strip_prefix(&dest).unwrap_or(p);
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            if !is_config_file(&rel_str) {
                continue;
            }
            let content = match std::fs::read_to_string(p) {
                Ok(c) => c,
                Err(_) => continue, // binary / non-UTF8 file
            };
            let format = crate::shared::detect_config_format(&rel_str);
            config_files.push(ConfigFile {
                path: rel.to_path_buf(),
                content,
                format,
            });
        }

        eprintln!(
            "[ModCanvas] CurseForge import: {} mods, {} config files",
            unresolved_mods.len(),
            config_files.len()
        );

        Ok(ImportResult {
            project,
            mods: Vec::new(),
            unresolved_mods,
            config_files,
            quest_graph: {
                let quests_dir = dest.join("config/ftbquests/quests");
                if quests_dir.is_dir() {
                    crate::imports::ftb_quests::import_ftb_quests(&dest).ok().map(|r| r.graph)
                } else {
                    None
                }
            },
        })
    }
}

fn parse_curseforge_loader(loaders: &[CurseForgeModLoader]) -> (ModLoader, Option<String>) {
    for loader in loaders {
        // CurseForge loader IDs look like: "forge-47.2.0", "fabric-0.14.21", "quilt-0.22.0"
        let parts: Vec<&str> = loader.id.splitn(2, '-').collect();
        if parts.len() == 2 {
            let name = parts[0].to_lowercase();
            let version = parts[1].to_string();

            let mod_loader = match name.as_str() {
                "forge" => ModLoader::Forge,
                "neoforge" => ModLoader::NeoForge,
                "fabric" => ModLoader::Fabric,
                "quilt" => ModLoader::Quilt,
                _ => continue,
            };

            if loader.primary {
                return (mod_loader, Some(version));
            }
        }
    }

    // Fallback: use first loader
    for loader in loaders {
        let parts: Vec<&str> = loader.id.splitn(2, '-').collect();
        if parts.len() == 2 {
            let name = parts[0].to_lowercase();
            let version = parts[1].to_string();

            let mod_loader = match name.as_str() {
                "forge" => ModLoader::Forge,
                "neoforge" => ModLoader::NeoForge,
                "fabric" => ModLoader::Fabric,
                "quilt" => ModLoader::Quilt,
                _ => continue,
            };

            return (mod_loader, Some(version));
        }
    }

    (ModLoader::Fabric, None)
}

fn is_config_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".toml")
        || lower.ends_with(".json")
        || lower.ends_with(".cfg")
        || lower.ends_with(".properties")
        || lower.ends_with(".yaml")
        || lower.ends_with(".yml")
        || lower.ends_with(".hocon")
        || lower.ends_with(".txt")
        || lower.ends_with(".xml")
        || lower.starts_with("scripts/")
        || lower.starts_with("config/")
}
