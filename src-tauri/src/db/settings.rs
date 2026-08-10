// Key/value settings rows and the CurseForge API key accessors. Split from
// db.rs so the module stays within the 300-line ceiling.

use super::Database;
use rusqlite::{params, Result as SqlResult};

impl Database {
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
}
