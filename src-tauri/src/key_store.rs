//! CurseForge API key storage: the OS keychain (Secret Service on Linux)
//! with the app database as an explicit, reported fallback for headless
//! sessions with no keychain daemon.
//!
//! Hard rules:
//! - The key NEVER ships in the binary. The compile-time baked-key path
//!   (`option_env!` + build.rs dotenv) was removed 2026-08-10 — a credential
//!   compiled into every distributed binary is a published credential.
//! - The database fallback file is enforced mode 0600 (db.rs) so a fallback
//!   key is still not readable by other local users.
//! - The frontend never reads the key back over IPC — it only learns
//!   `has_key` and which store holds it.

use crate::db::Database;

/// Where the key currently lives — surfaced in Settings so the user knows
/// when the insecure fallback is active.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub enum KeyStore {
    Keychain,
    Database,
}

impl std::fmt::Display for KeyStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeyStore::Keychain => write!(f, "keychain"),
            KeyStore::Database => write!(f, "database"),
        }
    }
}

const SERVICE: &str = "modcanvas";
const ACCOUNT: &str = "curseforge_api_key";

/// Read the key: keychain first, database fallback. Returns the store that
/// actually held it (None when neither).
pub fn get(db: &Database) -> (Option<String>, Option<KeyStore>) {
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        if let Ok(key) = entry.get_password() {
            if !key.is_empty() {
                return (Some(key), Some(KeyStore::Keychain));
            }
        }
    }
    if let Ok(Some(key)) = db.get_curseforge_api_key() {
        if !key.is_empty() {
            return (Some(key), Some(KeyStore::Database));
        }
    }
    (None, None)
}

/// Write the key to the keychain; on any keyring failure (no daemon, locked
/// keyring), fall back to the database and report the fallback so the UI can
/// say so. A successful keychain write clears the stale plaintext row.
pub fn set(db: &Database, key: &str) -> Result<KeyStore, String> {
    match keyring::Entry::new(SERVICE, ACCOUNT).and_then(|e| e.set_password(key)) {
        Ok(()) => {
            let _ = db.delete_setting("curseforge_api_key");
            Ok(KeyStore::Keychain)
        }
        Err(e) => {
            eprintln!("[ModCanvas] keyring unavailable ({e}); storing CF key in app database (mode 0600)");
            db.set_curseforge_api_key(key).map_err(|e| e.to_string())?;
            Ok(KeyStore::Database)
        }
    }
}

/// Remove the key from both stores.
pub fn clear(db: &Database) -> Result<(), String> {
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        let _ = entry.delete_credential();
    }
    db.delete_setting("curseforge_api_key").map_err(|e| e.to_string())
}
