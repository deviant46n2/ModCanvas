pub mod commands;
pub mod config_parser;
pub mod db;
pub mod engine_renders;
pub mod runtime_textures;
pub mod icons;
pub mod imports;
pub mod indexer;
pub mod indexer_kubejs;
pub mod ingest;
pub mod instance_textures;
pub mod ftb_theme;
pub mod launcher;
pub mod models;
pub mod mod_intelligence;
pub mod minecraft;
pub mod path_safety;
pub mod progression;
pub mod quest;
pub mod quest_cache;
pub mod recipe_disable;
pub mod recipes;
pub mod scriptgen;
pub mod shared;
pub mod ws_ipc;
pub mod ws_protocol;

use std::sync::{Arc, OnceLock};
use tauri::Manager;

use db::Database;
use launcher::{LauncherDriver, PrismLauncherDriver};
use minecraft::{InstanceLiveness, InstanceManager, ProcLiveness};
use mod_intelligence::ModIntelligence;

static TEST_INSTANCE_ID: OnceLock<String> = OnceLock::new();

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file (if present) for secrets like CURSEFORGE_API_KEY
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Database
            let db_path = app_handle
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir")
                .join("modcanvas.db");

            std::fs::create_dir_all(db_path.parent().unwrap())
                .expect("failed to create data directory");

            let db = Database::open(&db_path).expect("failed to open database");
            app.manage(db);

            // Mod Intelligence
            let intelligence = ModIntelligence::new();
            app.manage(intelligence);

            // Minecraft instance manager
            // Priority: MODCANVAS_INSTANCES_DIR env var > all existing Prism
            // Launcher instance roots > app_data_dir/instances. Every existing
            // Prism root (native + Flatpak + data_local) is scanned and merged,
            // so instances spread across several Prism installs all appear.
            let instances_dirs: Vec<std::path::PathBuf> =
                if let Ok(env_dir) = std::env::var("MODCANVAS_INSTANCES_DIR") {
                    vec![std::path::PathBuf::from(env_dir)]
                } else {
                    let driver = crate::launcher::PrismLauncherDriver::new();
                    let roots = driver.resolve_instance_roots();
                    if roots.is_empty() {
                        vec![app_handle
                            .path()
                            .app_data_dir()
                            .expect("failed to resolve app data dir")
                            .join("instances")]
                    } else {
                        roots
                    }
                };

            for dir in &instances_dirs {
                std::fs::create_dir_all(dir)
                    .expect("failed to create instances directory");
            }

            let launcher_driver: Arc<dyn LauncherDriver> = Arc::new(PrismLauncherDriver::new());
            let liveness: Arc<dyn InstanceLiveness> = Arc::new(ProcLiveness::default());
            let instance_manager = InstanceManager::new(instances_dirs, launcher_driver, liveness);
            app.manage(instance_manager);

            // WebSocket IPC Server for Minecraft Companion Mod
            let ws_ipc = Arc::new(ws_ipc::WsIpcServer::new(app_handle.clone()));
            app.manage(ws_ipc.clone());

            // Spawn WebSocket server in background
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ws_ipc.start().await {
                    eprintln!("[ModCanvas] Warning: Failed to start WebSocket IPC server: {}", e);
                }
            });

            // Check for test launch mode
            if let Some(instance_id) = TEST_INSTANCE_ID.get() {
                let instance_id_clone = instance_id.clone();
                let app_handle_for_launch = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    
                    let manager = app_handle_for_launch.state::<InstanceManager>();
                    let instances = manager.list_instances();
                    
                    let emitter = Box::new(commands::TauriProgressEmitter(app_handle_for_launch.clone()));
                    let result = manager.launch_instance(
                        emitter,
                        &instance_id_clone,
                        "Player",
                        "2G",
                        "4G",
                    );
                    
                    if let Err(e) = result {
                        eprintln!("[ModCanvas] Test launch failed: {}", e);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_project,
            commands::list_projects,
            commands::delete_project,
            commands::add_mod,
            commands::remove_mod,
            commands::get_project_mods,
            commands::search_mods,
            commands::search_modpacks,
            commands::install_mod_from_search,
            commands::check_compatibility,
            commands::get_config,
            commands::save_config,
            commands::get_mod_metadata,
            commands::get_project_mod_metadata,
            commands::check_compatibility_async,
            commands::get_dep_names,
            commands::list_config_files,
            commands::read_config_file,
            commands::write_config_file,
            commands::parse_config_file,
            commands::save_structured_config,
            commands::read_history_journal,
            commands::write_history_journal,
            commands::create_mc_instance,
            commands::list_mc_instances,
            commands::debug_instance_scan,
            commands::launch_mc_instance,
            commands::stop_mc_instance,
            commands::remove_mc_instance,
            commands::get_mc_logs,
            commands::resolve_mc_loader_version,
            commands::deploy_companion_mod_for_project,
            commands::get_project_companion_status,
            commands::import_modrinth_mrpack,
            commands::import_instance_folder,
            commands::import_packwiz,
            commands::import_curseforge_zip,
            commands::auto_import_pack,
            commands::pick_import_file,
            commands::export_modrinth_mrpack,
            commands::export_curseforge_zip,
            commands::get_curseforge_api_key,
            commands::set_curseforge_api_key,
            commands::search_modpacks_curseforge,
            commands::search_modpacks_all,
            commands::download_modpack_modrinth,
            commands::import_modpack_via_prism,
            commands::import_curseforge_via_prism,
            commands::open_prism_launcher,
            commands::get_progression_graph,
            commands::save_progression_graph,
            commands::add_progression_node,
            commands::update_progression_node,
            commands::delete_progression_node,
            commands::add_progression_edge,
            commands::delete_progression_edge,
            commands::analyze_progression,
            commands::auto_generate_progression,
            commands::get_quest_graph,
            commands::save_quest_graph,
            commands::add_quest_node,
            commands::update_quest_node,
            commands::delete_quest_node,
            commands::add_quest_edge,
            commands::delete_quest_edge,
            commands::analyze_quest_graph,
            commands::auto_generate_quest,
            commands::write_quest_graph_to_instance,
            commands::save_project,
            commands::test_project,
            commands::log_debug,
            commands::get_pack_icon,
            commands::import_ftb_quests_from_dir,
            commands::import_ftb_quests_one_click,
            commands::export_ftb_quests_to_dir,
            ws_ipc::ws_ipc_send_event,
            ws_ipc::ws_ipc_get_status,
            ws_ipc::ws_ipc_restart,
            commands::scan_instance_mods,
            commands::get_packwiz_workspace,
            commands::get_kubejs_scripts,
            commands::get_all_kubejs_scripts,
            commands::list_prism_instances,
            commands::search_items,
            commands::search_tags,
            commands::get_item_details,
            commands::generate_recipe_scripts,
            commands::write_script_files,
            crate::recipes::scan_pack_recipes_cmd,
            crate::recipe_disable::comment_out_recipe_call,
            crate::recipe_disable::uncomment_recipe_call,
            crate::indexer::scan_instance_items_cmd,
            crate::ingest::ingest_active_instance_cmd,
            crate::ingest::get_texture_file,
            crate::ingest::get_texture_files,
            crate::instance_textures::scan_instance_textures_cmd,
            crate::instance_textures::scan_instance_animations_cmd,
            crate::instance_textures::resolve_item_tags_cmd,
            crate::instance_textures::list_item_tags_cmd,
            crate::ftb_theme::get_quest_theme_background,
            crate::engine_renders::get_engine_renders_cmd,
            crate::engine_renders::save_engine_renders_cmd,
            crate::runtime_textures::get_runtime_textures_cmd,
            crate::runtime_textures::save_runtime_textures_cmd,
            crate::instance_textures::prune_caches_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Minecraft Modpack Maker");
}

pub fn set_test_instance_id(id: String) {
    TEST_INSTANCE_ID.set(id).ok();
}
