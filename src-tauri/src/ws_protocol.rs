//! The ModCanvas <-> Companion WebSocket protocol: message shapes, event
//! names, and client roles. Shared by the bridge server (`ws_ipc`) and the
//! frontend peer (`companion-socket.ts`).
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Standard event types for ModCanvas <-> Companion Mod communication
pub mod events {
    pub const RELOAD_KUBEJS_SCRIPTS: &str = "RELOAD_KUBEJS_SCRIPTS";
    pub const RELOAD_CRAFTTWEAKER: &str = "RELOAD_CRAFTTWEAKER";
    pub const RELOAD_CONFIG: &str = "RELOAD_CONFIG";
    pub const RELOAD_QUESTS: &str = "RELOAD_QUESTS";
    pub const RELOAD_PROGRESSION: &str = "RELOAD_PROGRESSION";
    pub const ASSETS_READY: &str = "ASSETS_READY";
    pub const CLIENT_INFO: &str = "CLIENT_INFO";
    /// ModCanvas -> companion: render a batch of item ids with the real
    /// Minecraft renderer (payload: `requestId`, `size`, `items[]`).
    pub const RENDER_ITEMS_REQUEST: &str = "RENDER_ITEMS_REQUEST";
    /// companion -> ModCanvas: base64 PNG data URLs for rendered items
    /// (payload: `requestId`, `rendered: {itemId: dataUrl}`).
    pub const RENDER_ITEMS_RESULT: &str = "RENDER_ITEMS_RESULT";
    /// ModCanvas -> companion: extract runtime-resolvable textures for the
    /// given namespaces via the in-game ResourceManager (payload: `requestId`,
    /// `namespaces[]`, optional `maxTextures`).
    pub const EXTRACT_TEXTURES_REQUEST: &str = "EXTRACT_TEXTURES_REQUEST";
    /// companion -> ModCanvas: base64 PNG data URLs keyed by full resource
    /// location (payload: `requestId`, `textures: {ns:textures/path.png: url}`).
    pub const EXTRACT_TEXTURES_RESULT: &str = "EXTRACT_TEXTURES_RESULT";
    /// ModCanvas -> companion: dump the game's authoritative item registry
    /// (BuiltInRegistries.ITEM). Replaces the app's lang-key-scanned registry
    /// — lang keys lie (effect-variant floods, banner pattern keys); the game
    /// registry has exactly the real items (no payload).
    pub const ITEM_REGISTRY_REQUEST: &str = "ITEM_REGISTRY_REQUEST";
    /// companion -> ModCanvas: the authoritative item list (payload:
    /// `items: [{id, name}]`). The app caches it to disk so offline sessions
    /// after the first launch keep a real registry.
    pub const ITEM_REGISTRY_RESULT: &str = "ITEM_REGISTRY_RESULT";
    /// Server -> app peer: companion bridge state changed.
    /// payload: `ConnectionStatus` (camelCase).
    pub const CONNECTION_STATUS: &str = "CONNECTION_STATUS";
    /// App -> companion: gracefully stop the game (Minecraft.getInstance().stop()).
    pub const STOP_INSTANCE: &str = "STOP_INSTANCE";
    /// Tool peer -> app peer: restart the running instance (stop, wait for
    /// exit, relaunch). Handled by the frontend orchestrator, not the hub.
    pub const RESTART_INSTANCE: &str = "RESTART_INSTANCE";
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModEvent {
    pub event: String,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

impl ModEvent {
    pub fn new(event: impl Into<String>) -> Self {
        Self {
            event: event.into(),
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            path: None,
            payload: None,
        }
    }

    pub fn with_path(mut self, path: impl Into<String>) -> Self {
        self.path = Some(path.into());
        self
    }

    pub fn with_payload(mut self, payload: Value) -> Self {
        self.payload = Some(payload);
        self
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

/// Bridge state reported to the app peer. `connected`/`client_count` count
/// companion (and unidentified) peers only — the app's own socket never makes
/// the bridge look connected.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub connected: bool,
    pub client_count: usize,
    pub port: u16,
}

/// Which peer a connected socket claims to be. The server routes frames by
/// role: app peers receive companion frames and status pushes; companion
/// peers receive broadcast commands. Unidentified clients are treated as
/// companions until they identify (keeps stale companion jars working).
/// Tool peers are external dev/automation clients (e.g. a restart trigger
/// script): their frames route to app peers like companion frames, but they
/// are never counted as a connected companion (no pill lie) and receive no
/// broadcast commands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientRole {
    Unidentified,
    Companion,
    App,
    Tool,
}

/// Classify a peer from its CLIENT_INFO payload (`client` field).
pub fn classify_client_info(payload: Option<&Value>) -> ClientRole {
    let client = payload.and_then(|p| p.get("client")).and_then(Value::as_str);
    match client {
        Some("modcanvas-app") => ClientRole::App,
        Some("modcanvas-tool") => ClientRole::Tool,
        Some(_) => ClientRole::Companion,
        None => ClientRole::Unidentified,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_mod_event_serialization() {
        let event = ModEvent::new("RELOAD_QUESTS")
            .with_path("config/ftbquests/quests/chapter1.snbt")
            .with_payload(json!({"reason": "file_changed"}));

        let json = event.to_json().unwrap();
        let parsed: ModEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.event, "RELOAD_QUESTS");
        assert_eq!(parsed.path, Some("config/ftbquests/quests/chapter1.snbt".to_string()));
        assert_eq!(parsed.payload, Some(json!({"reason": "file_changed"})));
        assert!(parsed.timestamp > 0);
    }

    #[test]
    fn test_mod_event_minimal() {
        let event = ModEvent::new("TEST_EVENT");
        let json = event.to_json().unwrap();
        let parsed: ModEvent = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.event, "TEST_EVENT");
        assert_eq!(parsed.path, None);
        assert_eq!(parsed.payload, None);
    }

    #[test]
    fn test_classify_client_info() {
        assert_eq!(
            classify_client_info(Some(&json!({"client": "modcanvas-app"}))),
            ClientRole::App
        );
        assert_eq!(
            classify_client_info(Some(&json!({"client": "workbench-companion", "version": "1.0.0"}))),
            ClientRole::Companion
        );
        assert_eq!(
            classify_client_info(Some(&json!({"client": "modcanvas-tool"}))),
            ClientRole::Tool
        );
        assert_eq!(classify_client_info(Some(&json!({"foo": 1}))), ClientRole::Unidentified);
        assert_eq!(classify_client_info(None), ClientRole::Unidentified);
    }
}
