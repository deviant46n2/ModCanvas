use crate::models::{ModEntry, ModLoader, ModSource, Project};
use crate::shared::extract_mod_info_from_jar;
use rusqlite::{params, Connection, Result as SqlResult};
use std::path::Path;
use std::sync::Mutex;
use uuid::Uuid;
use walkdir::WalkDir;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> SqlResult<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> SqlResult<()> {
        {
            let conn = self.conn.lock().unwrap();
            conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    minecraft_version TEXT NOT NULL,
                    mod_loader TEXT NOT NULL,
                    pack_format TEXT NOT NULL,
                    pack_version TEXT DEFAULT '1.0.0',
                    author TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    path TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS mods (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    mod_id TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    name TEXT NOT NULL,
                    version TEXT DEFAULT '',
                    description TEXT DEFAULT '',
                    author TEXT DEFAULT '',
                    source TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    added_at TEXT NOT NULL,
                    icon TEXT,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS mod_metadata (
                    mod_id TEXT PRIMARY KEY,
                    slug TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    author TEXT DEFAULT '',
                    categories TEXT DEFAULT '[]',
                    dependencies TEXT DEFAULT '[]',
                    supported_loaders TEXT DEFAULT '[]',
                    supported_versions TEXT DEFAULT '[]',
                    downloads INTEGER DEFAULT 0,
                    source_url TEXT,
                    issues_url TEXT,
                    documentation_url TEXT
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_mods_project ON mods(project_id);
                CREATE INDEX IF NOT EXISTS idx_mods_mod_id ON mods(mod_id);
                -- Dedupe rows polluted by earlier plain-INSERT scans FIRST (every
                -- scan used to append a full copy), then enforce uniqueness.
                DELETE FROM mods WHERE id NOT IN (
                    SELECT MIN(id) FROM mods GROUP BY project_id, mod_id
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_mods_project_mod ON mods(project_id, mod_id);
                ",
            )?;
        }

        // Migration: existing DBs predate the mods.icon column.
        let conn = self.conn.lock().unwrap();
        let has_icon: bool = {
            let mut stmt = conn.prepare("SELECT COUNT(*) FROM pragma_table_info('mods') WHERE name = 'icon'")?;
            stmt.query_row([], |r| r.get::<_, i64>(0)).unwrap_or(0) > 0
        };
        if !has_icon {
            let _ = conn.execute_batch("ALTER TABLE mods ADD COLUMN icon TEXT;");
        }

        // Migration: projects.source (launcher badge origin). Existing rows
        // default to "modcanvas"; sync_prism_instances sets "prism" going
        // forward on every list_projects call.
        let has_source: bool = {
            let mut stmt = conn.prepare("SELECT COUNT(*) FROM pragma_table_info('projects') WHERE name = 'source'")?;
            stmt.query_row([], |r| r.get::<_, i64>(0)).unwrap_or(0) > 0
        };
        if !has_source {
            let _ = conn.execute_batch("ALTER TABLE projects ADD COLUMN source TEXT DEFAULT 'modcanvas';");
        }
        Ok(())
    }

    pub fn create_project(&self, project: &Project) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, description, minecraft_version, mod_loader, pack_format, pack_version, author, created_at, updated_at, path, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                project.id.to_string(),
                project.name,
                project.description,
                project.minecraft_version,
                project.mod_loader.to_string(),
                format!("{:?}", project.pack_format),
                project.pack_version,
                project.author,
                project.created_at.to_rfc3339(),
                project.updated_at.to_rfc3339(),
                project.path,
                project.source,
            ],
        )?;
        Ok(())
    }

    pub fn list_projects(&self) -> SqlResult<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, minecraft_version, mod_loader, pack_format, pack_version, author, created_at, updated_at, path, source FROM projects ORDER BY updated_at DESC"
        )?;

        let projects = stmt
            .query_map([], |row| {
                Ok(Project {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_default(),
                    name: row.get(1)?,
                    description: row.get(2)?,
                    minecraft_version: row.get(3)?,
                    mod_loader: match row.get::<_, String>(4)?.as_str() {
                        "Fabric" => crate::models::ModLoader::Fabric,
                        "Quilt" => crate::models::ModLoader::Quilt,
                        "NeoForge" => crate::models::ModLoader::NeoForge,
                        "Vanilla" => crate::models::ModLoader::Vanilla,
                        _ => crate::models::ModLoader::Forge,
                    },
                    pack_format: crate::models::PackFormat::Unknown,
                    pack_version: row.get(6)?,
                    author: row.get(7)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_default(),
                    updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_default(),
                    path: row.get(10)?,
                    source: row.get::<_, Option<String>>(11)?.unwrap_or_else(crate::models::default_project_source),
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;

        Ok(projects)
    }

    pub fn add_mod(&self, entry: &ModEntry) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO mods (id, project_id, mod_id, slug, name, version, description, author, source, enabled, added_at, icon)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(project_id, mod_id) DO UPDATE SET
               slug = excluded.slug,
               name = excluded.name,
               version = excluded.version,
               description = excluded.description,
               author = excluded.author,
               source = excluded.source,
               enabled = excluded.enabled,
               icon = excluded.icon",
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
            ],
        )?;
        Ok(())
    }

    pub fn get_project_mods(&self, project_id: &Uuid) -> SqlResult<Vec<ModEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, mod_id, slug, name, version, description, author, source, enabled, added_at, icon FROM mods WHERE project_id = ?1"
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

    pub fn delete_project(&self, project_id: &Uuid) -> SqlResult<bool> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "DELETE FROM projects WHERE id = ?1",
            params![project_id.to_string()],
        )?;
        Ok(rows > 0)
    }

    pub fn get_project(&self, project_id: &Uuid) -> SqlResult<Option<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, minecraft_version, mod_loader, pack_format, pack_version, author, created_at, updated_at, path, source FROM projects WHERE id = ?1"
        )?;
        let mut rows = stmt.query(params![project_id.to_string()])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Project {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_default(),
                name: row.get(1)?,
                description: row.get(2)?,
                minecraft_version: row.get(3)?,
                mod_loader: match row.get::<_, String>(4)?.as_str() {
                    "Fabric" => crate::models::ModLoader::Fabric,
                    "Quilt" => crate::models::ModLoader::Quilt,
                    "NeoForge" => crate::models::ModLoader::NeoForge,
                    "Vanilla" => crate::models::ModLoader::Vanilla,
                    _ => crate::models::ModLoader::Forge,
                },
                pack_format: crate::models::PackFormat::Unknown,
                pack_version: row.get(6)?,
                author: row.get(7)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_default(),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_default(),
                path: row.get(10)?,
                source: row.get::<_, Option<String>>(11)?.unwrap_or_else(crate::models::default_project_source),
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_setting(&self, key: &str) -> SqlResult<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_curseforge_api_key(&self) -> SqlResult<Option<String>> {
        self.get_setting("curseforge_api_key")
    }

    pub fn set_curseforge_api_key(&self, key: &str) -> SqlResult<()> {
        self.set_setting("curseforge_api_key", key)
    }

    /// Sync live Prism instances into the projects DB. This is strictly
    /// additive: instances are inserted, or updated in place, by `game_dir`
    /// path. Rows are NEVER deleted here — the `projects` table is the
    /// persistent source of truth for the project list. Deleting a Prism
    /// instance, an imported pack's folder, or losing the scan root must not
    /// silently wipe a project the user has worked on. Projects are only
    /// removed by an explicit `delete_project` command.
    pub fn sync_prism_instances(
        &self,
        instances: &[crate::models::MinecraftInstance],
    ) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();

        for inst in instances {
            let exists: bool = {
                let mut stmt =
                    conn.prepare("SELECT COUNT(*) FROM projects WHERE path = ?1")?;
                let count: i64 = stmt.query_row(params![inst.game_dir], |row| row.get(0))?;
                count > 0
            };
            let loader_str = inst.loader.as_str();
            let now = chrono::Utc::now().to_rfc3339();
            if exists {
                // Update name, mc_version, loader from Prism's live files
                conn.execute(
                    "UPDATE projects SET name = ?1, minecraft_version = ?2, mod_loader = ?3, source = 'prism', updated_at = ?4
                     WHERE path = ?5",
                    params![inst.name, inst.mc_version, loader_str, now, inst.game_dir],
                )?;
            } else {
                conn.execute(
                    "INSERT INTO projects (id, name, description, minecraft_version, mod_loader, pack_format, pack_version, author, created_at, updated_at, path, source)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'prism')",
                    params![
                        inst.id,
                        inst.name,
                        "",
                        inst.mc_version,
                        loader_str,
                        "Unknown",
                        "1.0.0",
                        "",
                        now,
                        now,
                        inst.game_dir,
                    ],
                )?;
                eprintln!("[ModCanvas] Synced Prism instance '{}' into projects DB", inst.name);
            }
        }
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{InstanceStatus, MinecraftInstance, ModLoader, PackFormat};

    fn temp_db() -> (Database, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!(
            "modcanvas_db_test_{}.db",
            Uuid::new_v4()
        ));
        let db = Database::open(&path).expect("open temp db");
        (db, path)
    }

    fn make_project(name: &str, path: &str) -> Project {
        let now = chrono::Utc::now();
        Project {
            id: Uuid::new_v4(),
            name: name.to_string(),
            description: String::new(),
            minecraft_version: "1.20.1".to_string(),
            mod_loader: ModLoader::Forge,
            pack_format: PackFormat::Unknown,
            pack_version: "1.0.0".to_string(),
            author: String::new(),
            created_at: now,
            updated_at: now,
            path: path.to_string(),
            source: "modcanvas".to_string(),
        }
    }

    fn make_instance(id: &str, name: &str, game_dir: &str) -> MinecraftInstance {
        MinecraftInstance {
            id: id.to_string(),
            name: name.to_string(),
            mc_version: "1.20.1".to_string(),
            loader: "Forge".to_string(),
            loader_version: None,
            game_dir: game_dir.to_string(),
            status: InstanceStatus::Stopped,
        }
    }

    /// Sync is strictly additive: projects whose path is not in the live
    /// instance list (deleted instances, imported packs, manual projects)
    /// must survive the sync. Regression for the old behavior that wiped
    /// every non-Prism project on each `list_projects` call.
    #[test]
    fn sync_prism_instances_never_deletes_projects() {
        let (db, db_path) = temp_db();

        let manual_path = "/home/user/modpacks/MyManualPack";
        let live_path = "/home/user/.local/share/PrismLauncher/instances/Live/minecraft";
        let orphaned_path = "/home/user/.local/share/PrismLauncher/instances/Gone/minecraft";

        db.create_project(&make_project("Manual", manual_path)).unwrap();
        db.create_project(&make_project("Live", live_path)).unwrap();
        db.create_project(&make_project("Orphaned", orphaned_path)).unwrap();

        // One live instance matching "Live", plus a brand-new instance.
        let instances = vec![
            make_instance("live-1", "Live", live_path),
            make_instance("new-1", "New Pack", "/home/user/.local/share/PrismLauncher/instances/New/minecraft"),
        ];

        db.sync_prism_instances(&instances).unwrap();

        let projects = db.list_projects().unwrap();
        let paths: Vec<&str> = projects.iter().map(|p| p.path.as_str()).collect();

        assert!(paths.contains(&manual_path), "manual project must persist: {paths:?}");
        assert!(paths.contains(&orphaned_path), "deleted-instance project must persist: {paths:?}");
        assert!(paths.contains(&live_path), "live instance project must be present: {paths:?}");
        assert!(paths.contains(&"/home/user/.local/share/PrismLauncher/instances/New/minecraft"),
            "new instance must be added: {paths:?}");
        assert_eq!(projects.len(), 4, "expected all 4 projects after additive sync: {paths:?}");

        let _ = std::fs::remove_file(&db_path);
    }
}
