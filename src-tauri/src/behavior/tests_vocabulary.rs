//! Golden-output tests for the s46 TRIGGER vocabulary of the KubeJS backend.
//! Every trigger's event registration, target filter, and subject guard is
//! locked byte-for-byte here. The strings lock what the compiler EMITS; the
//! jar verification (s46) locks the APIs; the in-game smoke test locks the
//! runtime.

use super::compile::*;
use super::{Action, Backend, Behavior, Trigger};

fn starter_kit() -> Behavior {
    Behavior {
        id: "starter:kit".to_string(),
        name: "Starter Kit".to_string(),
        backend: Backend::Kubejs,
        trigger: Trigger::PlayerJoinsGame,
        conditions: vec![],
        actions: vec![Action::GiveItem {
            item: "minecraft:diamond".to_string(),
            count: 1,
        }],
    }
}

#[test]
fn player_leaves_game_uses_logged_out() {
    let b = Behavior {
        trigger: Trigger::PlayerLeavesGame,
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("PlayerEvents.loggedOut(event => {"));
}

#[test]
fn player_takes_damage_targets_player_entity() {
    let b = Behavior {
        trigger: Trigger::PlayerTakesDamage,
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("EntityEvents.afterHurt('minecraft:player', event => {"));
}

#[test]
fn kills_guards_on_source_player() {
    let b = Behavior {
        trigger: Trigger::PlayerKillsEntity { entity: None },
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("EntityEvents.death(event => {"));
    assert!(script.contains("const player = event.source.player; if (!player) return;"));
}

#[test]
fn kills_with_entity_filter_targets_the_type() {
    let b = Behavior {
        trigger: Trigger::PlayerKillsEntity {
            entity: Some("minecraft:zombie".to_string()),
        },
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("EntityEvents.death('minecraft:zombie', event => {"));
}

#[test]
fn crafted_targets_item() {
    let b = Behavior {
        trigger: Trigger::ItemCrafted {
            item: Some("minecraft:stick".to_string()),
        },
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("ItemEvents.crafted('minecraft:stick', event => {"));
}

#[test]
fn picked_up_untargeted_has_no_filter() {
    let b = Behavior {
        trigger: Trigger::ItemPickedUp { item: None },
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("ItemEvents.pickedUp(event => {"));
}

#[test]
fn block_placed_guards_the_placer() {
    let b = Behavior {
        trigger: Trigger::BlockPlaced {
            block: Some("minecraft:oak_log".to_string()),
        },
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("BlockEvents.placed('minecraft:oak_log', event => {"));
    assert!(script.contains("const player = event.player; if (!player) return;"));
}

#[test]
fn block_broken_guards_the_breaker() {
    let b = Behavior {
        trigger: Trigger::BlockBroken { block: None },
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("BlockEvents.broken(event => {"));
    assert!(script.contains("const player = event.player; if (!player) return;"));
}

#[test]
fn advancement_completed_targets_the_id() {
    let b = Behavior {
        trigger: Trigger::AdvancementCompleted {
            advancement: "minecraft:story/root".to_string(),
        },
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("PlayerEvents.advancement('minecraft:story/root', event => {"));
}

#[test]
fn timed_every_iterates_online_players() {
    let b = Behavior {
        trigger: Trigger::TimedEvery { ticks: 600 },
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("ServerEvents.loaded(event => {"));
    assert!(script.contains("event.server.scheduleRepeatingInTicks(600, () => {"));
    assert!(script.contains("event.server.players.forEach(player => {"));
    assert!(script.contains("player.give('minecraft:diamond')"));
}

#[test]
fn timed_every_zero_ticks_is_an_error() {
    let b = Behavior {
        trigger: Trigger::TimedEvery { ticks: 0 },
        ..starter_kit()
    };
    let err = compile_to_kubejs(&b).unwrap_err();
    assert!(err.0.contains("at least 1 tick"));
}

// --- s46 vocabulary: conditions ----------------------------------------------

