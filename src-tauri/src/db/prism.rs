// Prism instance sync: upsert live launcher instances into the projects table
// by game_dir path, strictly additive. Split from db.rs so the module stays
// within the 300-line ceiling.

use super::Database;
use rusqlite::{params, Result as SqlResult};

impl Database {
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
}
