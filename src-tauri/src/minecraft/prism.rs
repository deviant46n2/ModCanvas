/// Parse Prism's `instance.cfg` (INI-like) to extract the display name.
pub(super) fn parse_prism_instance_cfg(path: &std::path::Path) -> Option<String> {
    let content = std::fs::read_to_string(path.join("instance.cfg")).ok()?;
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("name=") || line.starts_with("Name=") {
            let val = line.splitn(2, '=').nth(1)?.trim();
            // Strip surrounding quotes if present
            let val = val.trim_matches(|c| c == '"');
            return Some(val.to_string());
        }
    }
    None
}

/// Parse Prism's `mmc-pack.json` to extract MC version and loader info.
/// Returns (mc_version, loader_name, loader_version).
pub(super) fn parse_prism_mmc_pack(path: &std::path::Path) -> (String, String, Option<String>) {
    let content = match std::fs::read_to_string(path.join("mmc-pack.json")) {
        Ok(c) => c,
        Err(_) => return ("Unknown".into(), "Unknown".into(), None),
    };

    let pack: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return ("Unknown".into(), "Unknown".into(), None),
    };

    let components = match pack.get("components").and_then(|c| c.as_array()) {
        Some(arr) => arr,
        None => return ("Unknown".into(), "Unknown".into(), None),
    };

    let mut mc_version = String::new();
    let mut loader_name = String::new();
    let mut loader_version = None;

    for comp in components {
        let uid = comp.get("uid").and_then(|u| u.as_str()).unwrap_or("");
        let version = comp.get("version").and_then(|v| v.as_str()).unwrap_or("");

        match uid {
            "net.minecraft" => {
                mc_version = version.to_string();
            }
            "net.neoforged" => {
                loader_name = "NeoForge".to_string();
                loader_version = Some(version.to_string());
            }
            "net.minecraftforge" => {
                loader_name = "Forge".to_string();
                loader_version = Some(version.to_string());
            }
            "net.fabricmc.fabric" => {
                loader_name = "Fabric".to_string();
                loader_version = Some(version.to_string());
            }
            "org.quiltmc.quilt-loader" => {
                loader_name = "Quilt".to_string();
                loader_version = Some(version.to_string());
            }
            _ => {}
        }
    }

    if mc_version.is_empty() {
        mc_version = "Unknown".into();
    }
    if loader_name.is_empty() {
        loader_name = "Unknown".into();
    }

    (mc_version, loader_name, loader_version)
}

/// Detect instance info from legacy directory markers (.forge/, .neoforge/, etc).
fn _detect_instance_info(path: &std::path::Path) -> (String, String, Option<String>) {
    // Check for NeoForge
    let neoforge_dir = path.join(".neoforge");
    if neoforge_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&neoforge_dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with("neoforge-") && file_name.ends_with("-installer.jar") {
                    let version = file_name
                        .strip_prefix("neoforge-")
                        .and_then(|s| s.strip_suffix("-installer.jar"))
                        .unwrap_or("Unknown");
                    return (_mc_version_from_neoforge(version).to_string(), "NeoForge".to_string(), Some(version.to_string()));
                }
            }
        }
    }

    // Check for Forge
    let forge_dir = path.join(".forge");
    if forge_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&forge_dir) {
            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with("forge-") && file_name.ends_with("-installer.jar") {
                    let version = file_name
                        .strip_prefix("forge-")
                        .and_then(|s| s.strip_suffix("-installer.jar"))
                        .unwrap_or("Unknown");
                    return (_mc_version_from_forge(version).to_string(), "Forge".to_string(), Some(version.to_string()));
                }
            }
        }
    }

    // Check for Fabric
    let fabric_dir = path.join(".fabric");
    if fabric_dir.exists() {
        return ("Unknown".to_string(), "Fabric".to_string(), None);
    }

    // Check for Quilt
    let quilt_dir = path.join(".quilt");
    if quilt_dir.exists() {
        return ("Unknown".to_string(), "Quilt".to_string(), None);
    }

    ("Unknown".to_string(), "Unknown".to_string(), None)
}

fn _mc_version_from_neoforge(neoforge_version: &str) -> &str {
    if neoforge_version.starts_with("21.1.") {
        "1.21.1"
    } else if neoforge_version.starts_with("21.0.") {
        "1.21"
    } else if neoforge_version.starts_with("20.1.") {
        "1.20.1"
    } else if neoforge_version.starts_with("20.0.") {
        "1.20"
    } else if neoforge_version.starts_with("19.") {
        "1.19"
    } else {
        "Unknown"
    }
}

fn _mc_version_from_forge(forge_version: &str) -> &str {
    if let Some(mc_part) = forge_version.split('-').next() {
        mc_part
    } else {
        "Unknown"
    }
}

/// Sanitize an instance name to be safe for use as a directory name.
pub(super) fn sanitize_instance_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let trimmed = sanitized.trim().trim_matches('.');
    if trimmed.is_empty() {
        "Instance".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Generate a Prism Launcher `instance.cfg` file content.
pub(super) fn generate_instance_cfg(
    name: &str,
    mc_version: &str,
    loader: &str,
    loader_version: Option<&str>,
) -> String {
    let instance_type = match loader {
        "fabric" => "OneSix",
        "quilt" => "OneSix",
        "forge" => "OneSix",
        "neoforge" => "OneSix",
        _ => "OneSix",
    };

    let cfg = format!(
        r#"[General]
ConfigVersion=1.3
InstanceType={instance_type}
ManagedPack=false
name={name}
"#,
        instance_type = instance_type,
        name = name,
    );

    // Prism stores the game version in the profile JSON, but instance.cfg
    // can reference it. For our purposes, the loader info goes into
    // patches/ which Prism reads on launch.
    let _ = (mc_version, loader, loader_version);

    cfg
}

pub(super) fn generate_mmc_pack(
    mc_version: &str,
    loader: &str,
    loader_version: Option<&str>,
) -> String {
    let loader_uid = match loader.to_lowercase().as_str() {
        "fabric" => "net.fabricmc.fabric-loader",
        "quilt" => "org.quiltmc.quilt-loader",
        "forge" => "net.minecraftforge",
        "neoforge" => "net.neoforged",
        _ => "net.neoforged",
    };
    let loader_name = match loader.to_lowercase().as_str() {
        "fabric" => "Fabric",
        "quilt" => "Quilt",
        "forge" => "Forge",
        "neoforge" => "NeoForge",
        _ => "NeoForge",
    };
    let lv = loader_version.unwrap_or("0.0.0");

    format!(
        r#"{{
    "formatVersion": 1,
    "components": [
        {{
            "uid": "net.minecraft",
            "version": "{mc}",
            "important": true
        }},
        {{
            "uid": "{loader_uid}",
            "version": "{lv}",
            "cachedName": "{loader_name}",
            "cachedRequires": [
                {{ "equals": "{mc}", "uid": "net.minecraft" }}
            ]
        }}
    ]
}}"#,
        mc = mc_version,
        loader_uid = loader_uid,
        lv = lv,
        loader_name = loader_name,
    )
}

#[cfg(test)]
mod tests {
    use super::generate_instance_cfg;

    #[test]
    fn instance_cfg_writes_lowercase_name_key_like_prism_itself() {
        // Prism reads the display name from `name=` — the capitalized `Name=`
        // form is ignored and Prism falls back to "Unnamed Instance" (observed
        // live 2026-08-13: the wizard's fresh instance showed "Unnamed
        // Instance" despite Name= in its cfg; real Prism instances on disk use
        // lowercase `name=`). Match the tool's own output.
        let cfg = generate_instance_cfg("My Pack", "1.21.1", "neoforge", Some("21.1.248"));
        assert!(cfg.contains("name=My Pack"), "cfg must carry the lowercase name key: {cfg}");
        assert!(!cfg.contains("Name="), "capitalized Name= is ignored by Prism: {cfg}");
    }
}
