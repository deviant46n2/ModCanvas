// Unit tests for the database layer: schema migrations, project sync, and mod
// file_name round-trips through the upsert.

use super::*;
use crate::models::{InstanceStatus, MinecraftInstance, ModEntry, ModLoader, PackFormat, Project};
use uuid::Uuid;
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

    /// file_name must survive the add_mod upsert and come back through
    /// get_project_mods — remove_mod depends on the stored link.
    #[test]
    fn mod_file_name_round_trips_through_upsert() {
        let (db, db_path) = temp_db();

        let project = make_project("P", "/tmp/nonexistent-instance");
        db.create_project(&project).unwrap();

        let mut entry = crate::models::ModEntry {
            id: Uuid::new_v4(),
            project_id: project.id,
            mod_id: "my_mod".to_string(),
            slug: "my-mod".to_string(),
            name: "My Mod".to_string(),
            version: "1.0.0".to_string(),
            description: String::new(),
            author: String::new(),
            source: crate::models::ModSource::Local,
            enabled: true,
            added_at: chrono::Utc::now(),
            icon: None,
            file_name: Some("MyMod-1.0.0.jar".to_string()),
        };
        db.add_mod(&entry).unwrap();

        let rows = db.get_project_mods(&project.id).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].file_name.as_deref(), Some("MyMod-1.0.0.jar"));

        // Toggle-as-add upserts a row with NO file handle; the stored name must
        // survive (the DO UPDATE list deliberately omits file_name).
        entry.file_name = None;
        entry.enabled = false;
        db.add_mod(&entry).unwrap();
        let rows = db.get_project_mods(&project.id).unwrap();
        assert_eq!(rows[0].enabled, false);
        assert_eq!(
            rows[0].file_name.as_deref(),
            Some("MyMod-1.0.0.jar"),
            "upsert must preserve file_name when the new row has none"
        );

        let _ = std::fs::remove_file(&db_path);
    }

    /// The schema migration must add mods.file_name to a DB created before the
    /// column existed (old rows stay NULL — no backfill, by design).
    #[test]
    fn migration_adds_file_name_to_old_schema() {
        let path = std::env::temp_dir().join(format!(
            "modcanvas_db_test_legacy_{}.db",
            Uuid::new_v4()
        ));
        {
            // Create a DB with the OLD mods schema (no file_name column).
            let conn = rusqlite::Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS mods (
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
                    icon TEXT
                );",
            )
            .unwrap();
        }

        // Opening through the app path runs the migration.
        let db = Database::open(&path).expect("open legacy db");
        {
            let conn = db.conn.lock().unwrap();
            let has_col: bool = conn
                .prepare("SELECT COUNT(*) FROM pragma_table_info('mods') WHERE name = 'file_name'")
                .unwrap()
                .query_row([], |r| r.get::<_, i64>(0))
                .unwrap()
                > 0;
            assert!(has_col, "migration must add mods.file_name");
        }

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn api_key_setting_round_trips_and_deletes() {
        // The key_store fallback path stores the CF key as a plain setting —
        // lock the layer it relies on (set → get → delete).
        let (db, path) = temp_db();
        assert_eq!(db.get_curseforge_api_key().unwrap(), None, "no key by default");
        db.set_curseforge_api_key("cf-key").unwrap();
        assert_eq!(db.get_curseforge_api_key().unwrap(), Some("cf-key".to_string()));
        db.delete_setting("curseforge_api_key").unwrap();
        assert_eq!(db.get_curseforge_api_key().unwrap(), None, "delete clears the key");
        let _ = std::fs::remove_file(&path);
    }
