//! Import-time mod resolution: turn unresolved mods into resolved ones by
//! querying Modrinth (and CurseForge when an API key is present). Split into
//! submodules: `queries` (search-query generation) and `matching`
//! (Jaro-Winkler scoring). The public API below is unchanged by the split.

use crate::imports::{ResolvedMod, UnresolvedMod};
use crate::mod_intelligence::ModIntelligence;
use crate::models::ModLoader;

mod matching;
mod queries;

use matching::{find_best_match, find_best_match_curseforge};
use queries::generate_search_queries;

pub async fn resolve_mods(
    unresolved: Vec<UnresolvedMod>,
    mc_version: &str,
    loader: ModLoader,
    mod_intelligence: &ModIntelligence,
    curseforge_api_key: Option<&str>,
) -> Vec<ResolvedMod> {
    let mut resolved = Vec::new();
    let total = unresolved.len();
    
    for unmod in unresolved {
        eprintln!("[ModCanvas] Resolving: {} (mod_id={:?}, version={:?})", unmod.file_name, unmod.mod_id, unmod.version);
        
        // Try multiple resolution strategies in order
        if let Some(resolved_mod) = try_resolve_mod(&unmod, mc_version, &loader, mod_intelligence, curseforge_api_key).await {
            eprintln!("[ModCanvas]   Resolved: {} -> {} ({})", unmod.file_name, resolved_mod.name, resolved_mod.mod_id);
            resolved.push(resolved_mod);
            continue;
        }
        
        eprintln!("[ModCanvas]   FAILED to resolve: {}", unmod.file_name);
    }
    
    eprintln!("[ModCanvas] Resolution complete: {}/{} mods resolved", resolved.len(), total);
    resolved
}

async fn try_resolve_mod(
    unmod: &UnresolvedMod,
    mc_version: &str,
    loader: &ModLoader,
    mod_intelligence: &ModIntelligence,
    curseforge_api_key: Option<&str>,
) -> Option<ResolvedMod> {
    // Strategy 1: Direct mod_id lookup on Modrinth
    if let Some(mod_id) = &unmod.mod_id {
        if let Ok(Some(metadata)) = mod_intelligence.get_mod_metadata(mod_id).await {
            return Some(ResolvedMod {
                mod_id: mod_id.clone(),
                slug: metadata.slug,
                name: metadata.name,
                version: unmod.version.clone().unwrap_or_else(|| metadata.supported_versions.first().cloned().unwrap_or_default()),
                source: "Modrinth".to_string(),
                file_name: unmod.file_name.clone(),
            });
        }
    }
    
    // Generate search queries from the filename
    let queries = generate_search_queries(&unmod.file_name, unmod.mod_id.as_deref());
    
    // Strategy 2: Try each query on Modrinth
    for query in &queries {
        eprintln!("[ModCanvas]   Searching Modrinth with query: '{}'", query);
        if let Ok(mods) = mod_intelligence.search_modrinth(query, loader.clone(), mc_version, &[]).await {
            if let Some(matched) = find_best_match(&mods, query, unmod.version.as_deref()) {
                return Some(ResolvedMod {
                    mod_id: matched.mod_id.clone(),
                    slug: matched.slug.clone(),
                    name: matched.name.clone(),
                    version: unmod.version.clone().unwrap_or_else(|| matched.supported_versions.first().cloned().unwrap_or_default()),
                    source: "Modrinth".to_string(),
                    file_name: unmod.file_name.clone(),
                });
            }
        }
    }
    
    // Strategy 3: Try CurseForge if API key available
    if let Some(api_key) = curseforge_api_key {
        for query in &queries {
            eprintln!("[ModCanvas]   Searching CurseForge with query: '{}'", query);
            if let Ok(mods) = mod_intelligence.search_curseforge(query, api_key).await {
                if let Some(matched) = find_best_match_curseforge(&mods, query, unmod.version.as_deref()) {
                    return Some(ResolvedMod {
                        mod_id: format!("curseforge:{}", matched.mod_id),
                        slug: matched.slug.clone(),
                        name: matched.name.clone(),
                        version: unmod.version.clone().unwrap_or_default(),
                        source: "CurseForge".to_string(),
                        file_name: unmod.file_name.clone(),
                    });
                }
            }
        }
    }
    
    None
}
