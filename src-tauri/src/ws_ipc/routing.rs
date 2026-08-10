//! Pure frame-routing decisions for the WS IPC hub — no sockets, no Tauri.
//!
//! The hub's routing rules live here as testable free functions so the
//! handshake/forward/broadcast decisions can be locked without spinning up a
//! WebSocket listener. [`route_decision`] mirrors exactly what `route_frame`
//! does; the async side effects stay in `handlers`.

use crate::ws_protocol::{events, ClientRole, ModEvent};

/// What the hub must do with an inbound frame, decided purely from the frame's
/// event name, the sender's role, and (for handshakes) payload presence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameAction {
    /// CLIENT_INFO from an app peer: push current status + replay the last
    /// companion identity to the freshly-connected app peer.
    HandshakeApp,
    /// CLIENT_INFO from a companion carrying a payload: cache the identity
    /// and forward it to app peers.
    HandshakeCompanion,
    /// CLIENT_INFO that needs no action (unidentified/tool peer, or a
    /// companion frame with no payload).
    HandshakeNoop,
    /// Regular frame from a companion/tool/unidentified peer: forward to app
    /// peers (the frontend orchestrator).
    ForwardToApp,
    /// Regular frame from the app peer: broadcast to companion peers.
    BroadcastToCompanions,
}

/// Decide the routing action for one parsed frame. For handshake frames the
/// role is the freshly-classified role; for regular frames it is the sender's
/// stored role.
pub fn route_decision(event_name: &str, role: ClientRole, has_payload: bool) -> FrameAction {
    if event_name == events::CLIENT_INFO {
        return match role {
            ClientRole::App => FrameAction::HandshakeApp,
            ClientRole::Companion if has_payload => FrameAction::HandshakeCompanion,
            _ => FrameAction::HandshakeNoop,
        };
    }
    match role {
        ClientRole::App => FrameAction::BroadcastToCompanions,
        ClientRole::Companion | ClientRole::Unidentified | ClientRole::Tool => {
            FrameAction::ForwardToApp
        }
    }
}

/// Roles that receive broadcast commands (companions and unidentified peers).
/// Unidentified clients are treated as companions so stale companion jars keep
/// working; tool peers never receive commands.
pub fn is_broadcast_target(role: ClientRole) -> bool {
    role == ClientRole::Companion || role == ClientRole::Unidentified
}

/// Roles that receive companion frames and status pushes (the app peer).
pub fn is_app_target(role: ClientRole) -> bool {
    role == ClientRole::App
}

/// Parse a raw text frame into a [`ModEvent`]. Malformed input yields `None`
/// and the hub silently drops the frame (it is not a fatal error).
pub fn parse_frame(text: &str) -> Option<ModEvent> {
    serde_json::from_str::<ModEvent>(text).ok()
}
