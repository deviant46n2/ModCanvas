//! Unit tests for the WS IPC hub's pure routing/parsing seams (`routing`)
//! and the pure registry operations (broadcast counting, status derivation,
//! handshake role mutation) that the live-socket path runs on.

use std::collections::HashMap;

use crate::ws_protocol::{events, ClientRole, ConnectionStatus};
use serde_json::json;
use tokio::sync::mpsc;

use super::routing::{
    is_app_target, is_broadcast_target, parse_frame, route_decision, FrameAction,
};
use super::{
    broadcast_recipient_count, register_client, set_client_role, status_from_registry, WsClient,
};

/// Build a registry with one peer per role, each with a real (unused) channel.
fn registry_with_roles(roles: &[ClientRole]) -> HashMap<String, WsClient> {
    let mut clients = HashMap::new();
    for (i, role) in roles.iter().enumerate() {
        let id = format!("peer-{}", i);
        let (sender, _rx) = mpsc::unbounded_channel();
        let client = WsClient {
            id: id.clone(),
            sender,
            role: *role,
        };
        clients.insert(id, client);
    }
    clients
}

#[test]
fn broadcast_count_includes_companions_and_unidentified_only() {
    let clients = registry_with_roles(&[
        ClientRole::App,
        ClientRole::Companion,
        ClientRole::Unidentified,
        ClientRole::Tool,
        ClientRole::Companion,
    ]);
    // App and tool never receive commands; the two companions + the
    // unidentified (stale-jar) peer do.
    assert_eq!(broadcast_recipient_count(&clients), 3);
}

#[test]
fn broadcast_count_empty_registry_is_zero() {
    let clients = HashMap::new();
    assert_eq!(broadcast_recipient_count(&clients), 0);
}

#[test]
fn broadcast_count_app_and_tool_only_is_zero() {
    let clients = registry_with_roles(&[ClientRole::App, ClientRole::Tool]);
    assert_eq!(broadcast_recipient_count(&clients), 0);
}

#[test]
fn status_is_connected_only_when_broadcast_targets_exist() {
    let app_only = registry_with_roles(&[ClientRole::App]);
    assert_eq!(
        status_from_registry(&app_only, 9876),
        ConnectionStatus { connected: false, client_count: 0, port: 9876 }
    );

    let with_companion = registry_with_roles(&[ClientRole::App, ClientRole::Companion]);
    assert_eq!(
        status_from_registry(&with_companion, 9876),
        ConnectionStatus { connected: true, client_count: 1, port: 9876 }
    );
}

#[test]
fn status_counts_unidentified_as_connected() {
    // A stale companion jar (never sent CLIENT_INFO) still makes the bridge
    // look connected — that is the pill contract.
    let clients = registry_with_roles(&[ClientRole::Unidentified]);
    assert_eq!(
        status_from_registry(&clients, 1234),
        ConnectionStatus { connected: true, client_count: 1, port: 1234 }
    );
}

#[test]
fn status_port_is_reported() {
    let clients = registry_with_roles(&[ClientRole::Companion]);
    assert_eq!(status_from_registry(&clients, 9999).port, 9999);
}

#[test]
fn register_client_starts_unidentified() {
    let mut clients = HashMap::new();
    let (sender, _rx) = mpsc::unbounded_channel();
    register_client(&mut clients, "peer-a".into(), sender);
    let client = clients.get("peer-a").expect("registered");
    assert_eq!(client.role, ClientRole::Unidentified);
    assert_eq!(client.id, "peer-a");
}

#[test]
fn set_client_role_classifies_registered_peer() {
    let mut clients = registry_with_roles(&[ClientRole::Unidentified]);
    set_client_role(&mut clients, "peer-0", ClientRole::Companion);
    assert_eq!(clients.get("peer-0").map(|c| c.role), Some(ClientRole::Companion));
    // The status view follows the handshake.
    let status = status_from_registry(&clients, 9876);
    assert_eq!(status.client_count, 1);
}

#[test]
fn set_client_role_unknown_id_is_noop() {
    let mut clients = registry_with_roles(&[ClientRole::Unidentified]);
    set_client_role(&mut clients, "no-such-peer", ClientRole::Companion);
    assert_eq!(clients.len(), 1);
    assert_eq!(clients.get("peer-0").map(|c| c.role), Some(ClientRole::Unidentified));
}

#[test]
fn client_info_from_app_is_handshake_app() {
    assert_eq!(
        route_decision(events::CLIENT_INFO, ClientRole::App, true),
        FrameAction::HandshakeApp
    );
}

#[test]
fn client_info_from_app_without_payload_is_still_handshake_app() {
    // The App arm does not require a payload — status push + replay always fire.
    assert_eq!(
        route_decision(events::CLIENT_INFO, ClientRole::App, false),
        FrameAction::HandshakeApp
    );
}

#[test]
fn client_info_from_companion_with_payload_is_handshake_companion() {
    assert_eq!(
        route_decision(events::CLIENT_INFO, ClientRole::Companion, true),
        FrameAction::HandshakeCompanion
    );
}

#[test]
fn client_info_from_companion_without_payload_is_noop() {
    // A companion handshake with no payload must not be cached or forwarded.
    assert_eq!(
        route_decision(events::CLIENT_INFO, ClientRole::Companion, false),
        FrameAction::HandshakeNoop
    );
}

#[test]
fn client_info_from_tool_is_noop() {
    // Tool peers get no status replay and no companion-identity forward.
    assert_eq!(
        route_decision(events::CLIENT_INFO, ClientRole::Tool, true),
        FrameAction::HandshakeNoop
    );
}

#[test]
fn client_info_from_unidentified_is_noop() {
    assert_eq!(
        route_decision(events::CLIENT_INFO, ClientRole::Unidentified, true),
        FrameAction::HandshakeNoop
    );
}

#[test]
fn app_regular_frame_broadcasts_to_companions() {
    assert_eq!(
        route_decision(events::RELOAD_QUESTS, ClientRole::App, false),
        FrameAction::BroadcastToCompanions
    );
}

#[test]
fn companion_regular_frame_forwards_to_app() {
    assert_eq!(
        route_decision(events::ASSETS_READY, ClientRole::Companion, false),
        FrameAction::ForwardToApp
    );
}

#[test]
fn unidentified_regular_frame_forwards_to_app() {
    // Stale companion jars never send CLIENT_INFO; they are treated as
    // companions for routing until they identify.
    assert_eq!(
        route_decision(events::ASSETS_READY, ClientRole::Unidentified, false),
        FrameAction::ForwardToApp
    );
}

#[test]
fn tool_regular_frame_forwards_to_app() {
    assert_eq!(
        route_decision(events::RESTART_INSTANCE, ClientRole::Tool, false),
        FrameAction::ForwardToApp
    );
}

#[test]
fn broadcast_targets_are_companions_and_unidentified_only() {
    assert!(is_broadcast_target(ClientRole::Companion));
    assert!(is_broadcast_target(ClientRole::Unidentified));
    assert!(!is_broadcast_target(ClientRole::App));
    assert!(!is_broadcast_target(ClientRole::Tool));
}

#[test]
fn app_target_is_only_the_app_role() {
    assert!(is_app_target(ClientRole::App));
    assert!(!is_app_target(ClientRole::Companion));
    assert!(!is_app_target(ClientRole::Unidentified));
    assert!(!is_app_target(ClientRole::Tool));
}

#[test]
fn parse_frame_accepts_valid_event_json() {
    let event = parse_frame(
        r#"{"event":"RELOAD_QUESTS","timestamp":123,"path":"chapter1.snbt","payload":{"x":1}}"#,
    )
    .expect("valid event parses");
    assert_eq!(event.event, "RELOAD_QUESTS");
    assert_eq!(event.path.as_deref(), Some("chapter1.snbt"));
    assert_eq!(event.payload, Some(json!({"x": 1})));
}

#[test]
fn parse_frame_drops_malformed_json() {
    assert!(parse_frame("not json at all").is_none());
    assert!(parse_frame("").is_none());
}

#[test]
fn parse_frame_drops_non_event_json() {
    // Valid JSON that is not a ModEvent (missing event/timestamp fields).
    assert!(parse_frame(r#"{"foo":1}"#).is_none());
    assert!(parse_frame("42").is_none());
}

#[test]
fn parse_frame_ignores_unknown_fields() {
    let event = parse_frame(r#"{"event":"ASSETS_READY","timestamp":1,"extra":{"unused":true}}"#)
        .expect("unknown fields are ignored by serde");
    assert_eq!(event.event, "ASSETS_READY");
}
