// Project row operations: create, list, single lookup, and delete. Split from
// db.rs so the module stays within the 300-line ceiling.

use super::Database;
use crate::models::Project;
use rusqlite::{params, Result as SqlResult};
use uuid::Uuid;

impl Database {
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
}
