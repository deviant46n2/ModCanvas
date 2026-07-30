use crate::models::{ModLoader, Project};
use crate::progression::ProgressionGraph;
use crate::quest::QuestGraph;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};

pub mod mrpack;
pub mod instance;
pub mod packwiz;
pub mod curseforge;
pub mod resolution;
pub mod quest_config;
pub mod progression_config;
pub mod snbt;
pub mod ftb_quests;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub project: Project,
    pub mods: Vec<ResolvedMod>,
    pub unresolved_mods: Vec<UnresolvedMod>,
    pub config_files: Vec<ConfigFile>,
    #[serde(default)]
    pub progression_graph: Option<ProgressionGraph>,
    #[serde(default)]
    pub quest_graph: Option<QuestGraph>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedMod {
    pub mod_id: String,
    pub slug: String,
    pub name: String,
    pub version: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnresolvedMod {
    pub file_name: String,
    pub mod_id: Option<String>,
    pub version: Option<String>,
    pub loader: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFile {
    pub path: PathBuf,
    pub content: String,
    pub format: ConfigFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigFormat {
    Toml,
    Json,
    Properties,
    Yaml,
    Hocon,
}

pub fn detect_mc_version_from_instance(path: &Path) -> Option<String> {
    let instance_json = path.join("instance.json");
    if instance_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&instance_json) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(version) = json.get("minecraftVersion").and_then(|v| v.as_str()) {
                    return Some(version.to_string());
                }
            }
        }
    }
    
    let mcmod_info = path.join("mcmod.info");
    if mcmod_info.exists() {
        if let Ok(content) = std::fs::read_to_string(&mcmod_info) {
            if let Ok(infos) = serde_json::from_str::<Vec<McmodInfo>>(&content) {
                for info in infos {
                    if info.modid == "minecraft" {
                        return Some(info.version);
                    }
                }
            }
        }
    }
    
    let mods_dir = path.join("mods");
    if mods_dir.exists() {
        for entry in walkdir::WalkDir::new(&mods_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "jar") {
                if let Some(version) = extract_mc_version_from_jar(path) {
                    return Some(version);
                }
            }
        }
    }
    
    None
}

fn extract_mc_version_from_jar(jar_path: &Path) -> Option<String> {
    use zip::ZipArchive;
    
    let file = std::fs::File::open(jar_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).ok()?;
        let name = entry.name();
        
        if name == "fabric.mod.json" || name == "quilt.mod.json" {
            let mut content = String::new();
            entry.read_to_string(&mut content).ok()?;
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(depends) = json.get("depends") {
                    if let Some(mc_version) = depends.get("minecraft").and_then(|v| v.as_str()) {
                        return Some(mc_version.to_string());
                    }
                }
                if let Some(mc_version) = json.get("minecraft").and_then(|v| v.as_str()) {
                    return Some(mc_version.to_string());
                }
            }
        } else if name == "META-INF/mods.toml" || name == "META-INF/neoforge.mods.toml" {
            let mut content = String::new();
            entry.read_to_string(&mut content).ok()?;
            if let Ok(doc) = content.parse::<toml_edit::DocumentMut>() {
                if let Some(deps) = doc.get("dependencies").and_then(|d| d.as_table()) {
                    if let Some(mc_version) = deps.get("minecraft").and_then(|v| v.as_str()) {
                        return Some(mc_version.to_string());
                    }
                }
            }
        }
    }
    
    None
}

#[derive(Debug, Deserialize)]
struct McmodInfo {
    modid: String,
    version: String,
}

pub fn detect_loader_from_files(path: &Path) -> ModLoader {
    let mods_dir = path.join("mods");
    if mods_dir.exists() {
        for entry in walkdir::WalkDir::new(&mods_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "jar") {
                if let Some(loader) = detect_loader_from_jar(path) {
                    return loader;
                }
            }
        }
    }
    
    let instance_json = path.join("instance.json");
    if instance_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&instance_json) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(loader) = json.get("loader").and_then(|v| v.as_str()) {
                    return match loader.to_lowercase().as_str() {
                        "forge" => ModLoader::Forge,
                        "neoforge" => ModLoader::NeoForge,
                        "fabric" => ModLoader::Fabric,
                        "quilt" => ModLoader::Quilt,
                        _ => ModLoader::Fabric,
                    };
                }
            }
        }
    }
    
    let mmc_pack = path.join("mmc-pack.json");
    if mmc_pack.exists() {
        if let Ok(content) = std::fs::read_to_string(&mmc_pack) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(components) = json.get("components").and_then(|v| v.as_array()) {
                    for comp in components {
                        if let Some(component) = comp.as_str() {
                            if component.contains("Forge") {
                                return ModLoader::Forge;
                            } else if component.contains("NeoForge") {
                                return ModLoader::NeoForge;
                            } else if component.contains("Fabric") {
                                return ModLoader::Fabric;
                            } else if component.contains("Quilt") {
                                return ModLoader::Quilt;
                            }
                        }
                    }
                }
            }
        }
    }
    
    ModLoader::Fabric
}

fn detect_loader_from_jar(jar_path: &Path) -> Option<ModLoader> {
    use zip::ZipArchive;
    
    let file = std::fs::File::open(jar_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    
    for i in 0..archive.len() {
        let entry = archive.by_index(i).ok()?;
        let name = entry.name();
        
        if name == "fabric.mod.json" {
            return Some(ModLoader::Fabric);
        } else if name == "quilt.mod.json" {
            return Some(ModLoader::Quilt);
        } else if name == "META-INF/neoforge.mods.toml" {
            return Some(ModLoader::NeoForge);
        } else if name == "META-INF/mods.toml" {
            return Some(ModLoader::Forge);
        } else if name == "mcmod.info" {
            return Some(ModLoader::Forge);
        }
    }
    
    None
}

pub async fn resolve_mods(
    unresolved: Vec<UnresolvedMod>,
    mod_intelligence: &crate::mod_intelligence::ModIntelligence,
) -> Result<Vec<ResolvedMod>, anyhow::Error> {
    let mut resolved = Vec::new();
    
    for unmod in unresolved {
        if let Some(mod_id) = &unmod.mod_id {
            if let Ok(Some(metadata)) = mod_intelligence.get_mod_metadata(mod_id).await {
                resolved.push(ResolvedMod {
                    mod_id: mod_id.clone(),
                    slug: metadata.slug,
                    name: metadata.name,
                    version: unmod.version.unwrap_or_default(),
                    source: "Modrinth".to_string(),
                });
                continue;
            }
        }
        
        if let Some(version) = &unmod.version {
            if let Ok(mods) = crate::mod_intelligence::search_modrinth(
                &unmod.file_name,
                &crate::models::ModLoader::Fabric,
                "1.21.1"
            ).await {
                for m in mods {
                    if m.supported_versions.iter().any(|v| v.contains(version)) || m.name.to_lowercase().contains(&unmod.file_name.to_lowercase()) {
                        resolved.push(ResolvedMod {
                            mod_id: m.mod_id,
                            slug: m.slug,
                            name: m.name,
                            version: version.clone(),
                            source: "Modrinth".to_string(),
                        });
                        break;
                    }
                }
            }
        }
    }
    
    Ok(resolved)
}

pub fn extract_mrpack(mrpack_path: &Path, dest: &Path) -> anyhow::Result<()> {
    let file = std::fs::File::open(mrpack_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    archive.extract(dest)?;
    Ok(())
}

pub fn default_zip_options() -> zip::write::FileOptions<'static, ()> {
    let opts = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    #[cfg(unix)]
    let opts = opts.unix_permissions(0o755);
    opts
}

pub fn create_mrpack_zip(source: &Path, dest: &Path) -> anyhow::Result<()> {
    let file = std::fs::File::create(dest)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = default_zip_options();
    
    for entry in walkdir::WalkDir::new(source) {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            let relative = path.strip_prefix(source)?;
            let name = relative.to_string_lossy().to_string();
            zip.start_file(name, options)?;
            let mut f = std::fs::File::open(path)?;
            std::io::copy(&mut f, &mut zip)?;
        }
    }
    zip.finish()?;
    Ok(())
}