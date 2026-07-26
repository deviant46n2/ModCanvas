use rusqlite::{params, Connection, Result as SqlResult};
use std::path::Path;
use std::sync::Mutex;
use uuid::Uuid;

use crate::models::{ModEntry, Project};

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

            CREATE INDEX IF NOT EXISTS idx_mods_project ON mods(project_id);
            CREATE INDEX IF NOT EXISTS idx_mods_mod_id ON mods(mod_id);
            ",
        )?;
        Ok(())
    }

    pub fn create_project(&self, project: &Project) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, description, minecraft_version, mod_loader, pack_format, pack_version, author, created_at, updated_at, path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
            ],
        )?;
        Ok(())
    }

    pub fn list_projects(&self) -> SqlResult<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, minecraft_version, mod_loader, pack_format, pack_version, author, created_at, updated_at, path FROM projects ORDER BY updated_at DESC"
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
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;

        Ok(projects)
    }

    pub fn add_mod(&self, entry: &ModEntry) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO mods (id, project_id, mod_id, slug, name, version, description, author, source, enabled, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
            ],
        )?;
        Ok(())
    }

    pub fn get_project_mods(&self, project_id: &Uuid) -> SqlResult<Vec<ModEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, mod_id, slug, name, version, description, author, source, enabled, added_at FROM mods WHERE project_id = ?1"
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
}
