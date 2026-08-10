use crate::imports::{ResolvedMod, UnresolvedMod};
use crate::mod_intelligence::ModIntelligence;
use crate::models::ModLoader;

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

fn generate_search_queries(file_name: &str, mod_id: Option<&str>) -> Vec<String> {
    let mut queries = Vec::new();
    
    // Strip "mods/" prefix and .jar extension
    let name = file_name.strip_prefix("mods/").unwrap_or(file_name);
    let name = name.strip_suffix(".jar").unwrap_or(name);
    
    // Query 1: Full cleaned name (original logic)
    let cleaned = extract_mod_name(name, mod_id);
    if !cleaned.is_empty() {
        queries.push(cleaned);
    }
    
    // Query 2: Try mod_id if available
    if let Some(id) = mod_id {
        if !id.is_empty() {
            queries.push(id.to_string());
        }
    }
    
    // Query 3: Try with common separators replaced by spaces
    let spaced = name.replace(['-', '_'], " ");
    if spaced != name {
        // Strip version-like suffixes
        let no_version = spaced
            .split_whitespace()
            .take_while(|part| !part.chars().next().map_or(false, |c| c.is_ascii_digit()))
            .collect::<Vec<_>>()
            .join(" ");
        if !no_version.is_empty() {
            queries.push(no_version);
        }
    }
    
    // Query 4: Just the first few words (for long mod names)
    let words: Vec<&str> = name.split(|c: char| c == '-' || c == '_').collect();
    if words.len() > 2 {
        let short = words[..2].join(" ");
        queries.push(short);
    }
    
    // Deduplicate
    queries.sort();
    queries.dedup();
    queries
}

fn extract_mod_name(name: &str, mod_id: Option<&str>) -> String {
    // If we have a mod_id, try to find it in the filename
    if let Some(id) = mod_id {
        let lower_name = name.to_lowercase();
        let lower_id = id.to_lowercase();
        if let Some(pos) = lower_name.find(&lower_id) {
            let end = pos + id.len();
            let after = &name[end..];
            let version_start = after.find(|c: char| c == '-' || c == '_')
                .map(|i| pos + id.len() + i)
                .unwrap_or(name.len());
            let clean = name[..version_start].trim_end_matches(['-', '_']);
            if !clean.is_empty() {
                return clean.to_string();
            }
        }
    }
    
    // Fallback: strip version-like suffixes
    name.split(|c: char| c == '-' || c == '_')
        .take_while(|part| !part.chars().next().map_or(false, |c| c.is_ascii_digit()))
        .collect::<Vec<_>>()
        .join(" ")
}

fn find_best_match<'a>(mods: &'a [crate::models::ModMetadata], query: &'a str, version: Option<&'a str>) -> Option<&'a crate::models::ModMetadata> {
    let mut best_match = None;
    let mut best_score = 0.0;
    
    for m in mods {
        let mut score = 0.0;
        
        // Version match bonus
        if let Some(v) = version {
            if m.supported_versions.iter().any(|sv| sv.contains(v)) {
                score += 10.0;
            }
        }
        
        // Name similarity (Jaro-Winkler)
        let name_sim = jaro_winkler(&m.name.to_lowercase(), &query.to_lowercase());
        score += name_sim * 5.0;
        
        // Slug similarity
        let slug_sim = jaro_winkler(&m.slug.to_lowercase(), &query.to_lowercase());
        score += slug_sim * 3.0;
        
        // Exact substring matches
        if m.name.to_lowercase().contains(&query.to_lowercase()) {
            score += 5.0;
        }
        if query.to_lowercase().contains(&m.name.to_lowercase()) {
            score += 3.0;
        }
        
        // Popularity bonus (downloads)
        score += (m.downloads as f64).log10().max(0.0) * 0.5;
        
        if score > best_score {
            best_score = score;
            best_match = Some(m);
        }
    }
    
    // Require minimum score to avoid false positives
    if best_score >= 3.0 {
        best_match
    } else {
        None
    }
}

fn find_best_match_curseforge<'a>(mods: &'a [crate::models::ModMetadata], query: &'a str, _version: Option<&'a str>) -> Option<&'a crate::models::ModMetadata> {
    // Similar logic but simpler since CurseForge results have less metadata
    let mut best_match = None;
    let mut best_score = 0.0;
    
    for m in mods {
        let mut score = 0.0;
        
        let name_sim = jaro_winkler(&m.name.to_lowercase(), &query.to_lowercase());
        score += name_sim * 5.0;
        
        let slug_sim = jaro_winkler(&m.slug.to_lowercase(), &query.to_lowercase());
        score += slug_sim * 3.0;
        
        if m.name.to_lowercase().contains(&query.to_lowercase()) {
            score += 5.0;
        }
        
        score += (m.downloads as f64).log10().max(0.0) * 0.5;
        
        if score > best_score {
            best_score = score;
            best_match = Some(m);
        }
    }
    
    if best_score >= 3.0 {
        best_match
    } else {
        None
    }
}

// Jaro-Winkler similarity for fuzzy string matching
fn jaro_winkler(s1: &str, s2: &str) -> f64 {
    if s1 == s2 {
        return 1.0;
    }
    
    let len1 = s1.chars().count();
    let len2 = s2.chars().count();
    
    if len1 == 0 || len2 == 0 {
        return 0.0;
    }
    
    let max_dist = (len1.max(len2) / 2).saturating_sub(1);
    let s1_chars: Vec<char> = s1.chars().collect();
    let s2_chars: Vec<char> = s2.chars().collect();
    
    let mut s1_matches = vec![false; len1];
    let mut s2_matches = vec![false; len2];
    
    let mut matches = 0;
    let mut transpositions = 0;
    
    for i in 0..len1 {
        let start = i.saturating_sub(max_dist);
        let end = (i + max_dist + 1).min(len2);
        
        for j in start..end {
            if s2_matches[j] {
                continue;
            }
            if s1_chars[i] != s2_chars[j] {
                continue;
            }
            s1_matches[i] = true;
            s2_matches[j] = true;
            matches += 1;
            break;
        }
    }
    
    if matches == 0 {
        return 0.0;
    }
    
    let mut k = 0;
    for i in 0..len1 {
        if !s1_matches[i] {
            continue;
        }
        while !s2_matches[k] {
            k += 1;
        }
        if s1_chars[i] != s2_chars[k] {
            transpositions += 1;
        }
        k += 1;
    }
    
    let m = matches as f64;
    let jaro = (m / len1 as f64 + m / len2 as f64 + (m - transpositions as f64 / 2.0) / m) / 3.0;
    
    // Winkler modification: boost score for common prefix
    let prefix_len = s1_chars.iter().zip(s2_chars.iter()).take(4).take_while(|(a, b)| a == b).count();
    jaro + (prefix_len as f64 * 0.1 * (1.0 - jaro))
}