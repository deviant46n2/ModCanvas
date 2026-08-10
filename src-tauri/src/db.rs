use rusqlite::{Connection, Result as SqlResult};
use std::path::Path;
use std::sync::Mutex;

mod mods;
mod prism;
mod projects;
mod settings;

#[cfg(test)]
mod tests;

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
                    file_name TEXT,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
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

        // Migration: mods.file_name (jar path for remove-from-disk). Existing
        // rows are NULL — they predate the column and cannot be backfilled
        // reliably (that would mean re-deriving the row→file link by scanning
        // jars, which is the aliasing trap). remove_mod treats NULL as
        // "no file to delete; row-only removal".
        let has_file_name: bool = {
            let mut stmt = conn.prepare("SELECT COUNT(*) FROM pragma_table_info('mods') WHERE name = 'file_name'")?;
            stmt.query_row([], |r| r.get::<_, i64>(0)).unwrap_or(0) > 0
        };
        if !has_file_name {
            let _ = conn.execute_batch("ALTER TABLE mods ADD COLUMN file_name TEXT;");
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
}
