//! Golden-output tests for the s46 CONDITION + ACTION vocabulary of the
//! KubeJS backend. Condition guards, action emission, and the action-order
//! invariant are locked byte-for-byte here.

use super::compile::*;
use super::{Action, Backend, Behavior, Condition, Trigger};

fn cond_kit(cond: Condition) -> Behavior {
    Behavior {
        conditions: vec![cond],
        ..starter_kit()
    }
}


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
fn condition_item_held() {
    let (script, _) = compile_to_kubejs(&cond_kit(Condition::ItemHeld {
        item: "minecraft:diamond".to_string(),
    }))
    .unwrap();
    assert!(script.contains("if (event.player.mainHandItem.id != 'minecraft:diamond') return;"));
}

#[test]
fn condition_item_in_inventory() {
    let (script, _) = compile_to_kubejs(&cond_kit(Condition::ItemInInventory {
        item: "minecraft:bread".to_string(),
        min_count: 3,
    }))
    .unwrap();
    assert!(script.contains("if (event.player.inventory.count('minecraft:bread') < 3) return;"));
}

#[test]
fn condition_entity_type_on_kills_uses_event_entity() {
    let b = Behavior {
        trigger: Trigger::PlayerKillsEntity { entity: None },
        conditions: vec![Condition::EntityType {
            entity: "minecraft:zombie".to_string(),
        }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("if (event.entity.type != 'minecraft:zombie') return;"));
}

#[test]
fn condition_entity_type_on_join_is_an_error() {
    let b = cond_kit(Condition::EntityType {
        entity: "minecraft:zombie".to_string(),
    });
    let err = compile_to_kubejs(&b).unwrap_err();
    assert!(err.0.contains("no entity in scope"));
}

#[test]
fn condition_dimension() {
    let (script, _) = compile_to_kubejs(&cond_kit(Condition::Dimension {
        dimension: "minecraft:the_nether".to_string(),
    }))
    .unwrap();
    assert!(script.contains(
        "if (event.player.level.dimension != 'minecraft:the_nether') return;"
    ));
}

#[test]
fn condition_random_chance() {
    let (script, _) = compile_to_kubejs(&cond_kit(Condition::RandomChance { chance: 0.25 }))
        .unwrap();
    assert!(script.contains("if (Math.random() >= 0.25) return;"));
}

#[test]
fn condition_random_chance_out_of_range_is_an_error() {
    let b = cond_kit(Condition::RandomChance { chance: 1.5 });
    let err = compile_to_kubejs(&b).unwrap_err();
    assert!(err.0.contains("between 0.0 and 1.0"));
}

#[test]
fn condition_health_below() {
    let (script, _) = compile_to_kubejs(&cond_kit(Condition::HealthBelow { health: 6.0 }))
        .unwrap();
    assert!(script.contains("if (event.player.health >= 6) return;"));
}

#[test]
fn conditions_guard_before_actions() {
    let b = Behavior {
        conditions: vec![
            Condition::RandomChance { chance: 0.5 },
            Condition::HealthBelow { health: 10.0 },
        ],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    let chance_pos = script.find("Math.random()").unwrap();
    let health_pos = script.find("player.health").unwrap();
    let give_pos = script.find("player.give").unwrap();
    assert!(chance_pos < health_pos && health_pos < give_pos);
}

// --- s46 vocabulary: actions --------------------------------------------------

#[test]
fn action_remove_item_clears_inventory() {
    let b = Behavior {
        actions: vec![Action::RemoveItem {
            item: "minecraft:stone".to_string(),
        }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("event.player.inventory.clear('minecraft:stone')"));
}

#[test]
fn action_run_command_uses_server_silent() {
    let b = Behavior {
        actions: vec![Action::RunCommand {
            command: "say hello".to_string(),
        }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("event.server.runCommandSilent('say hello')"));
}

#[test]
fn action_run_command_with_slash_warns() {
    let b = Behavior {
        actions: vec![Action::RunCommand {
            command: "/say hello".to_string(),
        }],
        ..starter_kit()
    };
    let (script, warnings) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("runCommandSilent('/say hello')"));
    assert!(
        warnings.iter().any(|w| w.0.contains("starts with")),
        "a leading slash must surface as a warning"
    );
}

#[test]
fn action_message_tells_the_player() {
    let b = Behavior {
        actions: vec![Action::Message {
            text: "Welcome!".to_string(),
        }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("event.player.tell('Welcome!')"));
}

#[test]
fn action_heal() {
    let b = Behavior {
        actions: vec![Action::Heal { amount: 8.0 }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("event.player.heal(8)"));
}

#[test]
fn action_teleport() {
    let b = Behavior {
        actions: vec![Action::Teleport {
            x: 10.0,
            y: 64.0,
            z: -20.0,
            yaw: 0.0,
            pitch: 0.0,
        }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains(
        "event.player.setPositionAndRotation(10, 64, -20, 0, 0)"
    ));
}

#[test]
fn action_spawn_entity() {
    let b = Behavior {
        actions: vec![Action::SpawnEntity {
            entity: "minecraft:creeper".to_string(),
        }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("event.player.level.spawnEntity('minecraft:creeper', e => {})"));
}

#[test]
fn action_set_stage() {
    let b = Behavior {
        actions: vec![Action::SetStage {
            stage: "starter_done".to_string(),
        }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("event.player.stages.add('starter_done')"));
}

#[test]
fn action_run_command_quotes_escaped() {
    let b = Behavior {
        actions: vec![Action::RunCommand {
            command: "say it's fine".to_string(),
        }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("runCommandSilent('say it\\'s fine')"));
}
