//! The `CurseForgeExporter`: writes a project back out as a CurseForge modpack
//! zip (manifest.json + overrides/), shipping non-CurseForge mod jars inline.

use crate::imports::{ConfigFile, default_zip_options};
use crate::models::ModLoader;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use super::manifest::{CurseForgeFile, CurseForgeManifest, CurseForgeMinecraft, CurseForgeModLoader};

pub struct CurseForgeExporter;

impl CurseForgeExporter {
    /// Create a CurseForge modpack zip from project data
    ///
    /// Mods with "curseforge:XXXXX" mod_id are exported as projectID/fileID entries.
    /// Mods with Modrinth IDs are included as jar files in the overrides/mods/ folder.
    pub fn export(
        project: &crate::models::Project,
        mods: &[crate::models::ModEntry],
        config_files: &[ConfigFile],
        output_path: &Path,
    ) -> Result<PathBuf> {
        let temp_dir = tempfile::tempdir()?;
        let overrides_dir = temp_dir.path().join("overrides");
        let mods_dir = overrides_dir.join("mods");
        std::fs::create_dir_all(&mods_dir)?;

        // Build CurseForge manifest
        let loader_id = match project.mod_loader {
            ModLoader::Forge => "forge",
            ModLoader::NeoForge => "neoforge",
            ModLoader::Fabric => "fabric",
            ModLoader::Quilt => "quilt",
            ModLoader::Vanilla => "vanilla",
        };

        let loader_version = "latest"; // CurseForge handles resolution

        let mut cf_files = Vec::new();
        let mut overrides_mods = Vec::new();

        for m in mods {
            if let Some(cf_id) = m.mod_id.strip_prefix("curseforge:") {
                // CurseForge mod - extract projectID and fileID
                if let Ok(project_id) = cf_id.parse::<u64>() {
                    // fileID stored as version field for CurseForge mods
                    let file_id = m.version.parse::<u64>().unwrap_or(0);
                    cf_files.push(CurseForgeFile {
                        project_id,
                        file_id,
                        required: true,
                    });
                }
            } else {
                // Non-CurseForge mod - ship its jar in overrides/mods (see the
                // copy loop below). CurseForge's manifest cannot reference it,
                // so the jar is the ONLY way it travels with the pack.
                overrides_mods.push(m);
            }
        }

        let manifest = CurseForgeManifest {
            minecraft: CurseForgeMinecraft {
                version: project.minecraft_version.clone(),
                mod_loaders: vec![CurseForgeModLoader {
                    id: format!("{}-{}", loader_id, loader_version),
                    primary: true,
                }],
            },
            manifest_type: Some("minecraftModpack".to_string()),
            manifest_version: Some(1),
            name: Some(project.name.clone()),
            author: Some(project.author.clone()),
            description: Some(project.description.clone()),
            version: Some(project.pack_version.clone()),
            files: cf_files,
            overrides: Some("overrides".to_string()),
        };

        // Write manifest.json
        let manifest_json = serde_json::to_string_pretty(&manifest)?;
        crate::path_safety::atomic_write_str(&temp_dir.path().join("manifest.json"), &manifest_json)
            .map_err(|e| anyhow::anyhow!("{e}"))?;

        // Write config files to overrides
        for config in config_files {
            let config_path = overrides_dir.join(&config.path);
            if let Some(parent) = config_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            crate::path_safety::atomic_write_str(&config_path, &config.content)
                .map_err(|e| anyhow::anyhow!("{e}"))?;
        }

        // Ship non-CurseForge mods as real jars in overrides/mods. The manifest
        // omits them (CurseForge resolves manifest entries by projectID/fileID),
        // so without this copy the exported pack silently lacks every Modrinth
        // or local mod. Failing loudly beats a silent drop: a zip whose
        // manifest omits a mod AND whose overrides lack the jar is a broken
        // pack the user cannot notice.
        for m in &overrides_mods {
            let Some(file_name) = &m.file_name else {
                return Err(anyhow::anyhow!(
                    "Cannot export '{}' to CurseForge: it is not on CurseForge \
                     and its jar file is not recorded. Remove it or re-add it \
                     through the mods tab, then retry.",
                    m.name
                ));
            };
            let source = crate::path_safety::validate_under_root(
                Path::new(&project.path),
                &format!("mods/{file_name}"),
            )
            .map_err(|e| {
                anyhow::anyhow!(
                    "Cannot export '{}' to CurseForge: invalid jar path (not \
                     under the instance mods folder): {e}",
                    m.name
                )
            })?;
            if !source.is_file() {
                return Err(anyhow::anyhow!(
                    "Cannot export '{}' to CurseForge: expected jar '{}' is \
                     missing from the instance. Remove it or re-add it through \
                     the mods tab, then retry.",
                    m.name,
                    source.display()
                ));
            }
            std::fs::copy(&source, mods_dir.join(file_name))
                .with_context(|| format!("Failed to copy '{}' into the export", m.name))?;
        }

        // Create zip
        let zip_file = std::fs::File::create(output_path)?;
        let mut zip = zip::ZipWriter::new(zip_file);
        let options = default_zip_options();

        // Add manifest.json
        zip.start_file("manifest.json", options)?;
        let manifest_bytes = std::fs::read(temp_dir.path().join("manifest.json"))?;
        std::io::Write::write_all(&mut zip, &manifest_bytes)?;

        // Add overrides directory
        for entry in walkdir::WalkDir::new(&overrides_dir) {
            let entry = entry?;
            if entry.path().is_file() {
                let relative = entry.path().strip_prefix(&overrides_dir)?;
                // ZIP entry names are spec'd to forward slashes on every OS;
                // to_string_lossy() emits '\' on Windows (s65 CI finding —
                // by_name("overrides/mods/...") lookups broke on Windows).
                let name = format!("overrides/{}", relative.to_string_lossy().replace('\\', "/"));
                zip.start_file(name, options)?;
                let mut f = std::fs::File::open(entry.path())?;
                std::io::copy(&mut f, &mut zip)?;
            }
        }

        zip.finish()?;

        eprintln!(
            "[ModCanvas] CurseForge export: {} mods, {} config files -> {}",
            mods.len(),
            config_files.len(),
            output_path.display()
        );

        Ok(output_path.to_path_buf())
    }
}
