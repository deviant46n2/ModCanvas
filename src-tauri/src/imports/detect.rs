//! Instance detection helpers: infer the Minecraft version and mod loader from
//! an instance directory by inspecting instance.json, mcmod.info, mmc-pack.json,
//! and the mods/ folder (jar-internal manifests).

use crate::models::ModLoader;
use serde::Deserialize;
use std::io::Read;
use std::path::Path;

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
