pub async fn resolve_loader_version(
    loader: &str,
    mc_version: &str,
    requested_version: Option<&str>,
) -> Result<String, String> {
    if let Some(v) = requested_version {
        if !v.is_empty() && v != "latest" {
            return Ok(v.to_string());
        }
    }

    let parts: Vec<&str> = mc_version.split('.').collect();

    match loader {
        "fabric" => {
            let url = format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}",
                mc_version
            );
            let resp = reqwest::get(&url)
                .await
                .map_err(|e| format!("Failed to fetch Fabric versions: {e}"))?;
            let versions: Vec<serde_json::Value> = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse Fabric versions: {e}"))?;
            versions
                .first()
                .and_then(|v| v.get("loader"))
                .and_then(|l| l.get("version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "No Fabric loader versions found".to_string())
        }
        "quilt" => {
            let url = format!(
                "https://meta.quiltmc.org/v3/versions/loader/{}",
                mc_version
            );
            let resp = reqwest::get(&url)
                .await
                .map_err(|e| format!("Failed to fetch Quilt versions: {e}"))?;
            let versions: Vec<serde_json::Value> = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse Quilt versions: {e}"))?;
            versions
                .first()
                .and_then(|v| v.get("loader"))
                .and_then(|l| l.get("version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "No Quilt loader versions found".to_string())
        }
        "neoforge" => {
            let prefix = format!("{}.{}", parts[1], parts[2]);
            let prefix_with_dot = format!("{}.", prefix);

            let url = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
            let resp = reqwest::get(url)
                .await
                .map_err(|e| format!("Failed to fetch NeoForge metadata: {e}"))?;
            let text = resp
                .text()
                .await
                .map_err(|e| format!("Failed to read NeoForge metadata: {e}"))?;

            let mut candidates: Vec<String> = Vec::new();
            for line in text.lines() {
                let trimmed = line.trim();
                if let Some(v) = trimmed
                    .strip_prefix("<version>")
                    .and_then(|s| s.strip_suffix("</version>"))
                {
                    if v.starts_with(&prefix_with_dot) && !v.contains("beta") && !v.contains("alpha") {
                        candidates.push(v.to_string());
                    }
                }
            }

            candidates.sort();
            candidates
                .into_iter()
                .next_back()
                .ok_or_else(|| format!("No NeoForge versions found for MC {mc_version} (prefix: {prefix})"))
        }
        "forge" => {
            let url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
            let resp = reqwest::get(url)
                .await
                .map_err(|e| format!("Failed to fetch Forge promotions: {e}"))?;
            let data: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse Forge promotions: {e}"))?;

            let mc_promos = data.get("promos")
                .and_then(|p| p.as_object())
                .ok_or_else(|| "No Forge promos found".to_string())?;

            let key = format!("{mc_version}-latest");
            mc_promos
                .get(&key)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| format!("No Forge latest version for {mc_version}"))
        }
        _ => Ok("".to_string()),
    }
}
