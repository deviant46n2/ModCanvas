//! Smoke-suite lock tests (s46): the in-game verification suite in
//! `smoke_suite.json` must stay a COMPLETE coverage matrix — every trigger,
//! every condition, every action, both backends, and the negative controls.
//! The suite is the "test everything at once" artifact; these tests keep it
//! honest: if someone trims a variant, the lock fails and the suite would
//! silently stop verifying that emit path in-game.

use super::Backend;
use crate::behavior::{Action, Behavior, CompileOutput, Condition, Trigger};

/// Load the shipped smoke suite.
fn suite() -> Vec<Behavior> {
    let json = include_str!("smoke_suite.json");
    serde_json::from_str(json).expect("smoke_suite.json must parse as Behavior IR")
}

#[test]
fn smoke_suite_parses_and_compiles_every_behavior() {
    let behaviors = suite();
    assert!(!behaviors.is_empty(), "suite must not be empty");
    for b in &behaviors {
        let out = CompileOutput::from_behavior(b);
        assert!(
            matches!(out, CompileOutput::Ok { .. }),
            "suite behavior '{}' ({:?}) must compile on its backend: {:?}",
            b.name,
            b.backend,
            out
        );
    }
}

#[test]
fn smoke_suite_covers_every_trigger_variant() {
    let behaviors = suite();
    let triggers: Vec<&Trigger> = behaviors.iter().map(|b| &b.trigger).collect();
    let has = |p: &dyn Fn(&Trigger) -> bool| triggers.iter().any(|t| p(t));

    assert!(has(&|t| matches!(t, Trigger::PlayerJoinsGame)), "player_joins_game");
    assert!(has(&|t| matches!(t, Trigger::PlayerLeavesGame)), "player_leaves_game");
    assert!(has(&|t| matches!(t, Trigger::PlayerTakesDamage)), "player_takes_damage");
    assert!(has(&|t| matches!(t, Trigger::PlayerKillsEntity { entity: Some(_) })),
        "player_kills_entity WITH filter");
    assert!(has(&|t| matches!(t, Trigger::PlayerKillsEntity { entity: None })),
        "player_kills_entity WITHOUT filter (any entity)");
    assert!(has(&|t| matches!(t, Trigger::ItemCrafted { item: Some(_) })), "item_crafted with filter");
    assert!(has(&|t| matches!(t, Trigger::ItemPickedUp { item: Some(_) })), "item_picked_up with filter");
    assert!(has(&|t| matches!(t, Trigger::BlockPlaced { block: Some(_) })), "block_placed with filter");
    assert!(has(&|t| matches!(t, Trigger::BlockBroken { block: Some(_) })), "block_broken with filter");
    assert!(has(&|t| matches!(t, Trigger::AdvancementCompleted { .. })), "advancement_completed");
    assert!(has(&|t| matches!(t, Trigger::TimedEvery { .. })), "timed_every");
}

#[test]
fn smoke_suite_covers_every_condition() {
    let behaviors = suite();
    let has = |p: &dyn Fn(&Condition) -> bool| {
        behaviors
            .iter()
            .flat_map(|b| b.conditions.iter())
            .any(|c| p(c))
    };

    assert!(has(&|c| matches!(c, Condition::ItemHeld { .. })), "item_held");
    assert!(has(&|c| matches!(c, Condition::ItemInInventory { .. })), "item_in_inventory");
    assert!(has(&|c| matches!(c, Condition::EntityType { .. })), "entity_type");
    assert!(has(&|c| matches!(c, Condition::Dimension { .. })), "dimension");
    assert!(has(&|c| matches!(c, Condition::RandomChance { .. })), "random_chance");
    assert!(has(&|c| matches!(c, Condition::HealthBelow { .. })), "health_below");
}

#[test]
fn smoke_suite_covers_every_action() {
    let behaviors = suite();
    let has = |p: &dyn Fn(&Action) -> bool| {
        behaviors.iter().flat_map(|b| b.actions.iter()).any(|a| p(a))
    };

    assert!(has(&|a| matches!(a, Action::GiveItem { .. })), "give_item");
    assert!(has(&|a| matches!(a, Action::RemoveItem { .. })), "remove_item");
    assert!(has(&|a| matches!(a, Action::RunCommand { .. })), "run_command");
    assert!(has(&|a| matches!(a, Action::Message { .. })), "message");
    assert!(has(&|a| matches!(a, Action::Heal { .. })), "heal");
    assert!(has(&|a| matches!(a, Action::Teleport { .. })), "teleport");
    assert!(has(&|a| matches!(a, Action::SpawnEntity { .. })), "spawn_entity");
    assert!(has(&|a| matches!(a, Action::SetStage { .. })), "set_stage");
}

#[test]
fn smoke_suite_covers_both_backends_and_negative_controls() {
    let behaviors = suite();
    let backends: std::collections::HashSet<Backend> =
        behaviors.iter().map(|b| b.backend).collect();
    assert!(backends.contains(&Backend::Kubejs), "kubejs backend");
    assert!(backends.contains(&Backend::Datapack), "datapack backend");

    // The negative control: pickup_neg must NOT fire (bread >= 64 is false
    // on a normal pickup). Its presence is the assertion — its message text
    // is the FAIL signal in-game.
    let neg = behaviors.iter().find(|b| b.id == "suite:pickup_neg");
    assert!(neg.is_some(), "the negative control (suite:pickup_neg) must exist");
    assert!(
        neg.unwrap().actions.iter().any(|a| matches!(a, Action::Message { .. })),
        "negative control must carry a FAIL message"
    );
}

#[test]
fn smoke_suite_has_no_duplicate_ids() {
    let behaviors = suite();
    let mut ids: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for b in &behaviors {
        assert!(ids.insert(&b.id), "duplicate suite id: {}", b.id);
    }
}
