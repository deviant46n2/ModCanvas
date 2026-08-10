//! Loader-version resolution for the wizard's "create a new instance" flow.
//!
//! SCOPE: NeoForge on 1.21.1 only — the wizard's first supported combo (the
//! roadmap's P0-WIZARD completion criterion). The wizard's new-instance card
//! is locked to MC 1.21.1 · NeoForge, so this resolver has exactly one job.
//! When a second combo is supported, extend here (and unlock the card) —
//! never before.
//!
//! NeoForge's post-1.21 version scheme encodes the MC series in the first
//! two numbers: 1.21.1 ships as "21.1.x" (e.g. 21.1.248). The maven-metadata
//! XML lists every version; the resolver picks the latest matching prefix.
//! None = unresolvable (offline, metadata unreadable) — the wizard fails the
//! create loudly instead of letting the mmc-pack generator write its bogus
//! "0.0.0" fallback.

use reqwest::Client;

/// The new-scheme series prefix for the wizard's one supported MC version.
const NEOFORGE_1211_SERIES: &str = "21.1.";

/// Numeric version comparison by dot-segments ("52.1.16" > "52.1.9" — a
/// lexical sort would get this wrong). Callers pre-filter to stable versions.
fn segment_numbers(suffix: &str) -> Option<Vec<u32>> {
    suffix
        .split('.')
        .map(|seg| seg.parse::<u32>().ok())
        .collect()
}

/// Latest version whose string starts with `prefix`, numeric-aware. A suffix
/// containing anything but digits and dots is a pre-release or malformed —
/// never a candidate for a beginner wizard's pack (a beta build number must
/// not beat the stable one).
fn latest_with_prefix(versions: &[String], prefix: &str) -> Option<String> {
    versions
        .iter()
        .filter_map(|v| {
            let suffix = v.strip_prefix(prefix)?;
            if !suffix.chars().all(|c| c.is_ascii_digit() || c == '.') {
                return None;
            }
            let nums = segment_numbers(suffix)?;
            Some((nums, v.clone()))
        })
        .max_by(|a, b| a.0.cmp(&b.0))
        .map(|(_, v)| v)
}

/// Pull `<version>` entries out of a Maven metadata XML (no XML parser in
/// the dependency set; the tag is simple and stable).
fn extract_versions(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<version>") {
        let after = &rest[start + "<version>".len()..];
        if let Some(end) = after.find("</version>") {
            out.push(after[..end].to_string());
            rest = &after[end + "</version>".len()..];
        } else {
            break;
        }
    }
    out
}

/// Latest NeoForge version for MC 1.21.1 (series "21.1.x"), or None when the
/// metadata cannot be fetched or no series match exists.
pub async fn resolve_loader_version(mc_version: &str, loader: &str) -> Result<Option<String>, String> {
    // Defensive: the wizard only ever asks for 1.21.1 + neoforge, but the
    // resolver refuses everything else rather than guessing.
    if mc_version != "1.21.1" || loader.to_lowercase() != "neoforge" {
        return Ok(None);
    }
    let client = Client::new();
    let resp = client
        .get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(latest_with_prefix(&extract_versions(&body), NEOFORGE_1211_SERIES))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numeric_compare_beats_lexical() {
        let versions: Vec<String> = ["21.1.9", "21.1.16"].iter().map(|s| s.to_string()).collect();
        assert_eq!(latest_with_prefix(&versions, "21.1.").unwrap(), "21.1.16");
    }

    #[test]
    fn series_prefix_selects_only_the_1211_series() {
        let versions: Vec<String> = ["21.1.248", "21.0.12", "20.2.12-beta"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(latest_with_prefix(&versions, "21.1.").unwrap(), "21.1.248");
    }

    #[test]
    fn pre_release_is_not_a_candidate() {
        // A higher build number on a pre-release must not beat the stable.
        let versions: Vec<String> = ["21.1.247", "21.1.248", "21.1.249-beta"].iter().map(|s| s.to_string()).collect();
        assert_eq!(latest_with_prefix(&versions, "21.1.").unwrap(), "21.1.248");
    }

    #[test]
    fn extract_versions_parses_maven_xml() {
        let xml = "<metadata><versions><version>1.0</version><version>1.1</version></versions></metadata>";
        assert_eq!(extract_versions(xml), vec!["1.0", "1.1"]);
    }

    #[test]
    fn other_combos_refuse_instead_of_guessing() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        assert_eq!(rt.block_on(resolve_loader_version("1.21.1", "fabric")).unwrap(), None);
        assert_eq!(rt.block_on(resolve_loader_version("1.20.1", "neoforge")).unwrap(), None);
    }
}
