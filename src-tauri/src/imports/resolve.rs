//! Legacy Modrinth-based mod resolver (filename search fallback). The modern
//! multi-provider resolver lives in `resolution/`; this is the original
//! signature kept public for compatibility.

use crate::imports::{ResolvedMod, UnresolvedMod};
use crate::mod_intelligence::ModIntelligence;

pub async fn resolve_mods(
    unresolved: Vec<UnresolvedMod>,
    mod_intelligence: &ModIntelligence,
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
                    file_name: unmod.file_name.clone(),
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
                            file_name: unmod.file_name.clone(),
                        });
                        break;
                    }
                }
            }
        }
    }
    
    Ok(resolved)
}
