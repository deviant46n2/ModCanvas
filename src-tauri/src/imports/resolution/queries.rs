//! Search-query generation for mod resolution: turn an unresolved filename
//! (with an optional mod_id hint) into a ranked list of queries to try
//! against Modrinth / CurseForge.

pub(super) fn generate_search_queries(file_name: &str, mod_id: Option<&str>) -> Vec<String> {
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
