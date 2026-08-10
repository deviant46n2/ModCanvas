//! Pack compatibility analysis: batch-fetch metadata, flag duplicate mods and
//! missing/incompatible dependencies, and warn about unsupported loaders and
//! oversized packs.

use crate::models::ModLoader;

use crate::mod_intelligence::ModIntelligence;

impl ModIntelligence {
    pub async fn check_compatibility_async(
        &self,
        mods: &[crate::models::ModEntry],
        loader: &str,
        mc_version: &str,
        curseforge_api_key: Option<&str>,
    ) -> crate::models::CompatibilityResult {
        use crate::models::DependencyType;
        let mut issues = Vec::new();
        let mut warnings = Vec::new();

        let mod_ids: Vec<String> = mods.iter().map(|m| m.mod_id.clone()).collect();
        eprintln!("[ModCanvas] check_compatibility_async: {} mods, loader={}, mc={}", mod_ids.len(), loader, mc_version);
        let metadata_list = self.batch_get_metadata(&mod_ids, loader, mc_version, curseforge_api_key).await;
        eprintln!("[ModCanvas] Got metadata for {}/{} mods", metadata_list.len(), mod_ids.len());
        for m in &metadata_list {
            eprintln!("[ModCanvas]   {} (id={}, deps={})", m.name, m.mod_id, m.dependencies.len());
        }

        let mut mod_ids_set = std::collections::HashSet::new();
        for m in mods.iter() {
            mod_ids_set.insert(m.mod_id.clone());
        }

        let mut metadata_map = std::collections::HashMap::new();
        for meta in &metadata_list {
            metadata_map.insert(meta.mod_id.clone(), meta.clone());
        }

        let mut missing_dep_ids = std::collections::HashSet::new();
        for meta in &metadata_list {
            for dep in &meta.dependencies {
                if dep.mod_id == meta.mod_id {
                    continue;
                }
                if !mod_ids_set.contains(&dep.mod_id) && !metadata_map.contains_key(&dep.mod_id) {
                    missing_dep_ids.insert(dep.mod_id.clone());
                }
            }
        }

        if !missing_dep_ids.is_empty() {
            let missing_ids: Vec<String> = missing_dep_ids.into_iter().collect();
            eprintln!("[ModCanvas] Fetching metadata for {} missing dep IDs: {:?}", missing_ids.len(), missing_ids);
            let missing_metadata = self.batch_get_metadata(&missing_ids, loader, mc_version, curseforge_api_key).await;
            for (i, meta) in missing_metadata.iter().enumerate() {
                eprintln!("[ModCanvas] Resolved dep: '{}' (slug={}, id={})", meta.name, meta.slug, missing_ids.get(i).unwrap_or(&String::new()));
                metadata_map.insert(meta.slug.clone(), meta.clone());
                metadata_map.insert(missing_ids[i].clone(), meta.clone());
            }
        }

        eprintln!("[ModCanvas] metadata_map has {} entries", metadata_map.len());

        for (i, a) in mods.iter().enumerate() {
            for b in mods.iter().skip(i + 1) {
                if a.name.to_lowercase() == b.name.to_lowercase() && a.mod_id != b.mod_id {
                    issues.push(crate::models::CompatibilityIssue {
                        severity: crate::models::IssueSeverity::Warning,
                        message: format!(
                            "Possible duplicate: '{}' and '{}' may be the same mod",
                            a.name, b.name
                        ),
                        affected_mods: vec![a.mod_id.clone(), b.mod_id.clone()],
                        affected_mod_names: vec![a.name.clone(), b.name.clone()],
                    });
                }
            }
        }

        for meta in &metadata_list {
            for dep in &meta.dependencies {
                if dep.mod_id == meta.mod_id {
                    continue;
                }
                let dep_name = metadata_map.get(&dep.mod_id)
                    .map(|m| m.name.as_str())
                    .unwrap_or(&dep.mod_id);
                match dep.dependency_type {
                    DependencyType::Required => {
                        if !mod_ids_set.contains(&dep.mod_id) {
                            let dep_name_resolved = metadata_map.get(&dep.mod_id)
                                .map(|m| m.name.clone())
                                .unwrap_or(dep.mod_id.clone());
                            issues.push(crate::models::CompatibilityIssue {
                                severity: crate::models::IssueSeverity::Warning,
                                message: format!(
                                    "'{}' requires '{}' which is not in the project",
                                    meta.name, dep_name
                                ),
                                affected_mods: vec![meta.mod_id.clone(), dep.mod_id.clone()],
                                affected_mod_names: vec![meta.name.clone(), dep_name_resolved],
                            });
                        }
                    }
                    DependencyType::Incompatible => {
                        if mod_ids_set.contains(&dep.mod_id) {
                            let dep_name_resolved = metadata_map.get(&dep.mod_id)
                                .map(|m| m.name.clone())
                                .unwrap_or(dep.mod_id.clone());
                            issues.push(crate::models::CompatibilityIssue {
                                severity: crate::models::IssueSeverity::Error,
                                message: format!(
                                    "'{}' is incompatible with '{}'",
                                    meta.name, dep_name
                                ),
                                affected_mods: vec![meta.mod_id.clone(), dep.mod_id.clone()],
                                affected_mod_names: vec![meta.name.clone(), dep_name_resolved],
                            });
                        }
                    }
                    _ => {}
                }
            }

            if !meta.supported_loaders.is_empty() {
                let loader_enum = match loader {
                    "Fabric" => ModLoader::Fabric,
                    "Quilt" => ModLoader::Quilt,
                    "NeoForge" => ModLoader::NeoForge,
                    "Forge" => ModLoader::Forge,
                    _ => ModLoader::Fabric,
                };
                if !meta.supported_loaders.contains(&loader_enum) {
                    warnings.push(format!(
                        "'{}' may not support {} loader",
                        meta.name, loader
                    ));
                }
            }
        }

        if mods.len() > 150 {
            warnings.push(format!(
                "Pack has {} mods. Large packs may have performance issues.",
                mods.len()
            ));
        }

        crate::models::CompatibilityResult {
            compatible: issues.is_empty(),
            issues,
            warnings,
        }
    }
}
