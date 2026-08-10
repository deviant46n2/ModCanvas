// Mod row operations: upsert, list, remove, and folder scans. Split from db.rs
// so the module stays within the 300-line ceiling.

use super::Database;
use crate::models::{ModEntry, ModLoader, ModSource};
use crate::shared::extract_mod_info_from_jar;
use rusqlite::{params, Result as SqlResult};
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;

impl Database {
    pub fn add_mod(&self, entry: &ModEntry) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO mods (id, project_id, mod_id, slug, name, version, description, author, source, enabled, added_at, icon, file_name)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(project_id, mod_id) DO UPDATE SET
               slug = excluded.slug,
               name = excluded.name,
               version = excluded.version,
               description = excluded.description,
               author = excluded.author,
               source = excluded.source,
               enabled = excluded.enabled,
               icon = excluded.icon",
            // NOTE: file_name is deliberately NOT in the DO UPDATE SET list:
            // the toggle-as-add path upserts a row with no file handle, and
            // adding file_name = excluded.file_name would wipe the stored name
            // on every toggle. New inserts carry it; conflicts preserve it.
            params![
                entry.id.to_string(),
                entry.project_id.to_string(),
                entry.mod_id,
                entry.slug,
                entry.name,
                entry.version,
                entry.description,
                entry.author,
                format!("{:?}", entry.source),
                entry.enabled as i32,
                entry.added_at.to_rfc3339(),
                entry.icon,
                entry.file_name,
            ],
        )?;
        Ok(())
    }

    pub fn get_project_mods(&self, project_id: &Uuid) -> SqlResult<Vec<ModEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, mod_id, slug, name, version, description, author, source, enabled, added_at, icon, file_name FROM mods WHERE project_id = ?1"
        )?;

        let mods = stmt
            .query_map(params![project_id.to_string()], |row| {
                Ok(ModEntry {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_default(),
                    project_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap_or_default(),
                    mod_id: row.get(2)?,
                    slug: row.get(3)?,
                    name: row.get(4)?,
                    version: row.get(5)?,
                    description: row.get(6)?,
                    author: row.get(7)?,
                    source: match row.get::<_, String>(8)?.as_str() {
                        "Modrinth" => crate::models::ModSource::Modrinth,
                        "CurseForge" => crate::models::ModSource::CurseForge,
                        _ => crate::models::ModSource::Local,
                    },
                    enabled: row.get::<_, i32>(9)? != 0,
                    added_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_default(),
                    icon: row.get(11).unwrap_or_default(),
                    file_name: row.get(12).unwrap_or_default(),
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;

        Ok(mods)
    }

    pub fn remove_mod(&self, project_id: &Uuid, mod_id: &str) -> SqlResult<bool> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "DELETE FROM mods WHERE project_id = ?1 AND mod_id = ?2",
            params![project_id.to_string(), mod_id],
        )?;
        Ok(rows > 0)
    }

    /// Scan an instance's mods folder and sync all JAR files to the database.
    /// This extracts mod metadata from JAR files (fabric.mod.json, quilt.mod.json, 
    /// META-INF/mods.toml, META-INF/neoforge.mods.toml, mcmod.info) and 
    /// creates/updates ModEntry records in the database.
    pub fn sync_instance_mods(&self, project_id: &Uuid, mods_dir: &Path) -> SqlResult<usize> {
        if !mods_dir.exists() {
            eprintln!("[ModCanvas] Mods directory does not exist: {:?}", mods_dir);
            return Ok(0);
        }

        let mut synced = 0;
        let conn = self.conn.lock().unwrap();
        
        for entry in WalkDir::new(mods_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "jar") {
                // Extract mod info from JAR
                let mod_info = extract_mod_info_from_jar(path).unwrap_or(None);
                
                if let Some(info) = mod_info {
                    let mod_id = info.mod_id.unwrap_or_else(|| {
                        path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("unknown")
                            .to_string()
                    });
                    
                    let version = info.version.unwrap_or_else(|| "unknown".to_string());
                    let name = mod_id.clone();
                    let slug = mod_id.to_lowercase().replace([' ', '_', '-'], "-");
                    
                    // Determine source from loader
                    let source = match info.loader {
                        Some(ModLoader::Fabric) => ModSource::Modrinth,
                        Some(ModLoader::Quilt) => ModSource::Modrinth,
                        Some(ModLoader::Forge) => ModSource::CurseForge,
                        Some(ModLoader::NeoForge) => ModSource::CurseForge,
                        _ => ModSource::Local,
                    };

                    // Insert or update mod entry
                    conn.execute(
                        "INSERT INTO mods (id, project_id, mod_id, slug, name, version, description, author, source, enabled, added_at, icon)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                         ON CONFLICT(project_id, mod_id) DO UPDATE SET
                           version = excluded.version,
                           name = excluded.name,
                           description = excluded.description,
                           source = excluded.source,
                           enabled = excluded.enabled,
                           icon = excluded.icon",
                        params![
                            Uuid::new_v4().to_string(),
                            project_id.to_string(),
                            mod_id,
                            slug,
                            name,
                            version,
                            info.description.clone().unwrap_or_default(),
                            "", // author
                            format!("{:?}", source),
                            1, // enabled
                            chrono::Utc::now().to_rfc3339(),
                            info.icon_data_url.clone(),
                        ],
                    )?;
                    synced += 1;
                }
            }
        }
        eprintln!("[ModCanvas] Synced {} mods from {:?} to project {}", synced, mods_dir, project_id);
        Ok(synced)
    }
}
