// App-level settings commands (P0-BEGINNER). Thin IPC over the key/value
// `settings` table (`db/settings.rs`) — the same table the CurseForge key
// uses, but for app preferences. Values are strings; the frontend owns the
// interpretation ("beginner_mode" = "1"/"0").

use crate::db::Database;

/// Read a setting value (None when never set).
#[tauri::command]
pub fn get_app_setting(key: String, db: tauri::State<'_, Database>) -> Result<Option<String>, String> {
    db.get_setting(&key).map_err(|e| e.to_string())
}

/// Write a setting value (INSERT OR REPLACE).
#[tauri::command]
pub fn set_app_setting(key: String, value: String, db: tauri::State<'_, Database>) -> Result<(), String> {
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}
