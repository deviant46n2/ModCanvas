//! Golden-output tests for the behavior compiler (roadmap §11.2 — "the
//! compiler must be covered by golden-output tests (input IR → expected
//! script string)"). Every emitted string is locked byte-for-byte here, for
//! the full §11.1 vocabulary the s46 arc added: 10 triggers, 6 conditions,
//! 8 actions. The strings lock what the compiler EMITS; the jar verification
//! (s46) locks the APIs; the in-game smoke test locks the runtime.

use super::compile::*;
use super::{Action, Backend, Behavior, Condition, Trigger};

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
fn player_joins_give_single_item() {
    let (script, warnings) = compile_to_kubejs(&starter_kit()).unwrap();
    assert!(warnings.is_empty());
    assert_eq!(
        script,
        "// ModCanvas Generated Behavior\n\
         // starter:kit — Starter Kit\n\
         \n\
         PlayerEvents.loggedIn(event => {\n\
         \x20 event.player.give('minecraft:diamond')\n\
         })"
    );
}

#[test]
fn give_with_count_uses_item_factory() {
    let b = Behavior {
        actions: vec![Action::GiveItem {
            item: "minecraft:diamond".to_string(),
            count: 4,
        }],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert!(script.contains("event.player.give(Item.of('minecraft:diamond', 4))"));
    assert!(!script.contains("event.player.give('minecraft:diamond')"));
}

#[test]
fn multiple_actions_run_in_order() {
    let b = Behavior {
        actions: vec![
            Action::GiveItem {
                item: "minecraft:diamond".to_string(),
                count: 1,
            },
            Action::GiveItem {
                item: "minecraft:bread".to_string(),
                count: 8,
            },
        ],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    let diamond_pos = script.find("diamond").unwrap();
    let bread_pos = script.find("bread").unwrap();
    assert!(diamond_pos < bread_pos, "actions must run in declared order");
}

#[test]
fn unnamespaced_item_is_a_compile_error() {
    let b = Behavior {
        actions: vec![Action::GiveItem {
            item: "diamond".to_string(),
            count: 1,
        }],
        ..starter_kit()
    };
    let err = compile_to_kubejs(&b).unwrap_err();
    assert!(err.0.contains("diamond"), "error must name the bad item");
    assert!(err.0.contains("namespaced"));
}

#[test]
fn empty_actions_emit_empty_event_body() {
    let b = Behavior {
        actions: vec![],
        ..starter_kit()
    };
    let (script, _) = compile_to_kubejs(&b).unwrap();
    assert_eq!(
        script,
        "// ModCanvas Generated Behavior\n\
         // starter:kit — Starter Kit\n\
         \n\
         PlayerEvents.loggedIn(event => {\n\
         })"
    );
}

#[test]
fn compile_output_ok_shape_for_ui() {
    let out = CompileOutput::from_behavior(&starter_kit());
    match out {
        CompileOutput::Ok { backend, script, warnings } => {
            assert_eq!(backend, super::Backend::Kubejs);
            assert!(script.contains("PlayerEvents.loggedIn"));
            assert!(warnings.is_empty());
        }
        CompileOutput::Err { .. } => panic!("valid behavior must compile to Ok"),
    }
}

#[test]
fn compile_output_err_shape_for_ui() {
    let bad = Behavior {
        actions: vec![Action::GiveItem {
            item: "diamond".to_string(),
            count: 1,
        }],
        ..starter_kit()
    };
    let out = CompileOutput::from_behavior(&bad);
    match out {
        CompileOutput::Err { reason, .. } => assert!(reason.contains("namespaced")),
        CompileOutput::Ok { .. } => panic!("unnamespaced item must not compile"),
    }
}

// --- s46 vocabulary: triggers -------------------------------------------------

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

fn cond_kit(cond: Condition) -> Behavior {
    Behavior {
        conditions: vec![cond],
        ..starter_kit()
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
