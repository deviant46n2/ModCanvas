//! Loader-version resolution for the wizard's "create a new instance" flow.
//!
//! SCOPE: NeoForge on 1.21.1 only — the wizard's first supported combo (the
//! roadmap's P0-WIZARD completion criterion). The wizard's new-instance card
//! is locked to MC 1.21.1 · NeoForge, so this resolver has exactly one job.
//! When a second combo is supported, extend here (and unlock the card) —
//! never before.
//!
//! SOURCE OF TRUTH: Prism's own NeoForge index
//! (`meta.prismlauncher.org/v1/net.neoforged/`), not the raw Maven metadata.
//! The Maven list contains retracted/broken builds Prism never indexes (e.g.
//! 21.1.245: index-absent AND component-404, observed 2026-08-10), and a
//! freshly published version may not be indexed yet. Picking "latest from
//! Maven" races Prism's index and yields "could not download metadata"
//! failures at launch. The index is the set Prism can actually serve.
//! None = unresolvable (offline, index unreadable) — the wizard fails the
//! create loudly instead of letting the mmc-pack generator write its bogus
//! "0.0.0" fallback.

use reqwest::Client;

/// Latest NeoForge version for `mc` from Prism's own index. Pure — the
/// fetch happens in `resolve_loader_version`; this picks from the JSON.
/// The wizard never pins a just-released version: the component files for a
/// fresh release propagate through Prism's CDN/caches with a lag, and Prism
/// fails with "could not download metadata" until they settle (observed with
/// 21.1.248, released <1h before the failure, 2026-08-10). A settling window
/// plus a component-availability check closes the class.
const FRESH_RELEASE_WINDOW: chrono::Duration = chrono::Duration::hours(24);

/// Candidates for `mc` from Prism's index, newest-first by releaseTime.
/// Pure — the network happens in `resolve_loader_version`.
fn sorted_candidates(index: &serde_json::Value, mc: &str) -> Vec<(String, String)> {
    let mut candidates: Vec<(String, String)> = index
        .get("versions")
        .and_then(|v| v.as_array())
        .into_iter()
        .flatten()
        .filter_map(|v| {
            let matches_mc = v
                .get("requires")
                .and_then(|r| r.as_array())
                .is_some_and(|arr| {
                    arr.iter().any(|r| {
                        r.get("uid").and_then(|u| u.as_str()) == Some("net.minecraft")
                            && r.get("equals").and_then(|e| e.as_str()) == Some(mc)
                    })
                });
            if !matches_mc {
                return None;
            }
            Some((
                v.get("version")?.as_str()?.to_string(),
                v.get("releaseTime")?.as_str()?.to_string(),
            ))
        })
        .collect();
    // Newest first by releaseTime (ISO-8601 sorts lexically). The index is
    // already newest-first, but sort explicitly to be order-agnostic.
    candidates.sort_by(|a, b| b.1.cmp(&a.1));
    candidates
}

/// Latest NeoForge version for the wizard's supported combo, from Prism's
/// own index — skipping versions still inside the freshness window and
/// verifying the chosen component actually serves. None = unresolvable —
/// callers fail loudly, never guess.
pub async fn resolve_loader_version(mc_version: &str, loader: &str) -> Result<Option<String>, String> {
    // Defensive: the wizard only ever asks for 1.21.1 + neoforge, but the
    // resolver refuses everything else rather than guessing.
    if mc_version != "1.21.1" || loader.to_lowercase() != "neoforge" {
        return Ok(None);
    }
    let client = Client::new();
    let resp = client
        .get("https://meta.prismlauncher.org/v1/net.neoforged/")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let index: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let now = chrono::Utc::now();
    for (version, release_time) in sorted_candidates(&index, mc_version) {
        let settled = chrono::DateTime::parse_from_rfc3339(&release_time)
            .map(|t| now.signed_duration_since(t.with_timezone(&chrono::Utc)) > FRESH_RELEASE_WINDOW)
            .unwrap_or(true);
        if !settled {
            continue;
        }
        // Propagation check: the component file must actually serve. A
        // version listed in the index but not yet behind the CDN is the
        // "could not download metadata" failure Prism surfaces.
        let comp = client
            .get(format!("https://meta.prismlauncher.org/v1/net.neoforged/{version}.json"))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        if comp {
            return Ok(Some(version));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> serde_json::Value {
        json!({
            "formatVersion": 1,
            "uid": "net.neoforged",
            "versions": [
                { "version": "21.1.248", "releaseTime": "2026-08-10T13:26:57+00:00", "requires": [{ "uid": "net.minecraft", "equals": "1.21.1" }] },
                { "version": "21.1.245", "releaseTime": "2026-08-09T00:00:00+00:00", "requires": [{ "uid": "net.minecraft", "equals": "1.21.1" }] },
                { "version": "21.0.12", "releaseTime": "2026-08-08T00:00:00+00:00", "requires": [{ "uid": "net.minecraft", "equals": "1.21" }] },
                { "version": "26.2.0.59", "releaseTime": "2026-08-10T14:00:00+00:00", "requires": [{ "uid": "net.minecraft", "equals": "26.2" }] }
            ]
        })
    }

    #[test]
    fn picks_latest_servable_version_for_the_mc_series() {
        // 21.1.245 is the Maven-latest-but-PRISM-SKIPS case (index-absent
        // in reality); the resolver picks the newest the INDEX lists.
        assert_eq!(sorted_candidates(&fixture(), "1.21.1")[0].0, "21.1.248");
        assert_eq!(sorted_candidates(&fixture(), "1.21.1")[1].0, "21.1.245");
    }

    #[test]
    fn other_mc_series_do_not_leak_in() {
        // A 26.2-series version released AFTER 21.1.248 must not win for a
        // 1.21.1 pack — the requires filter is the gate.
        let cands = sorted_candidates(&fixture(), "1.21.1");
        assert!(cands.iter().all(|(_, t)| !t.contains("26.2")));
        assert_eq!(cands[0].0, "21.1.248");
    }

    #[test]
    fn unknown_mc_series_resolves_to_none() {
        assert!(sorted_candidates(&fixture(), "1.7.10").is_empty());
    }

    #[test]
    fn other_combos_refuse_instead_of_guessing() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        assert_eq!(rt.block_on(resolve_loader_version("1.21.1", "fabric")).unwrap(), None);
        assert_eq!(rt.block_on(resolve_loader_version("1.20.1", "neoforge")).unwrap(), None);
    }
}
