//! Unit tests for the WS IPC hub's pure routing/parsing seams (`routing`).
//!
//! These lock the handshake/forward/broadcast decision rules and the
//! malformed-frame drop behavior without needing a live WebSocket listener.

use crate::ws_protocol::{events, ClientRole};
use serde_json::json;

use super::routing::{
    is_app_target, is_broadcast_target, parse_frame, route_decision, FrameAction,
};

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
