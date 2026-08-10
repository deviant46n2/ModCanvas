//! Score-based matching of search results to the original query, using
//! Jaro-Winkler similarity plus version/popularity bonuses.

pub(super) fn find_best_match<'a>(mods: &'a [crate::models::ModMetadata], query: &'a str, version: Option<&'a str>) -> Option<&'a crate::models::ModMetadata> {
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

pub(super) fn find_best_match_curseforge<'a>(mods: &'a [crate::models::ModMetadata], query: &'a str, _version: Option<&'a str>) -> Option<&'a crate::models::ModMetadata> {
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
