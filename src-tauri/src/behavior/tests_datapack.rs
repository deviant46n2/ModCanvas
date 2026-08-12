//! Golden-output tests for the DATAPACK backend of the behavior compiler
//! (roadmap §11.2: "Datapack (advancement-based triggers)").
//!
//! The KubeJS backend's tests lock script strings; these lock the
//! advancement JSON + reward-function bodies for the faithful subset, and
//! lock the ERROR paths for everything the datapack format cannot express.
//! The honest boundary is a hard CompileError — never a silent drop or a
//! silent coarsening.

use super::compile_datapack::*;
use super::{Action, Backend, Behavior, CompileOutput, Condition, Trigger};

fn datapack_kit() -> Behavior {
    Behavior {
        id: "starter:kit".to_string(),
        name: "Starter Kit".to_string(),
        backend: Backend::Datapack,
        trigger: Trigger::PlayerKillsEntity {
            entity: Some("minecraft:zombie".to_string()),
        },
        conditions: vec![],
        actions: vec![Action::GiveItem {
            item: "minecraft:diamond".to_string(),
            count: 1,
        }],
    }
}

#[test]
fn kills_emits_player_killed_entity_advancement() {
    let (out, warnings) = compile_to_datapack(&datapack_kit()).unwrap();
    assert!(warnings.is_empty());
    assert_eq!(out.advancement_name, "behavior_starter_kit");
    assert_eq!(out.function_name, "behavior_starter_kit");
    let json: serde_json::Value = serde_json::from_str(&out.advancement_json).unwrap();
    assert_eq!(
        json["criteria"]["modcanvas_trigger"]["trigger"],
        "minecraft:player_killed_entity"
    );
    assert_eq!(
        json["criteria"]["modcanvas_trigger"]["conditions"]["entity"]["type"],
        "minecraft:zombie"
    );
    assert_eq!(json["rewards"]["function"], "modcanvas:behavior_starter_kit");
    assert!(json.get("parent").is_none(), "kills is a root, no parent");
    assert_eq!(out.function_body, "give @s minecraft:diamond 1");
}

#[test]
fn kills_any_entity_has_no_type_predicate() {
    let b = Behavior {
        trigger: Trigger::PlayerKillsEntity { entity: None },
        ..datapack_kit()
    };
    let (out, _) = compile_to_datapack(&b).unwrap();
    let json: serde_json::Value = serde_json::from_str(&out.advancement_json).unwrap();
    let entity = &json["criteria"]["modcanvas_trigger"]["conditions"]["entity"];
    assert_eq!(entity["type"], serde_json::Value::Null);
}

#[test]
fn entity_type_condition_folds_into_kill_predicate() {
    let b = Behavior {
        trigger: Trigger::PlayerKillsEntity { entity: None },
        conditions: vec![Condition::EntityType {
            entity: "minecraft:creeper".to_string(),
        }],
        ..datapack_kit()
    };
    let (out, warnings) = compile_to_datapack(&b).unwrap();
    assert!(warnings.is_empty(), "the fold is faithful, no warning");
    let json: serde_json::Value = serde_json::from_str(&out.advancement_json).unwrap();
    assert_eq!(
        json["criteria"]["modcanvas_trigger"]["conditions"]["entity"]["type"],
        "minecraft:creeper"
    );
}

#[test]
fn non_foldable_condition_is_an_error() {
    let b = Behavior {
        conditions: vec![Condition::RandomChance { chance: 0.5 }],
        ..datapack_kit()
    };
    let err = compile_to_datapack(&b).unwrap_err();
    assert!(err.0.contains("KubeJS backend"));
}

#[test]
fn crafted_emits_inventory_changed_with_coarseness_warning() {
    let b = Behavior {
        trigger: Trigger::ItemCrafted {
            item: Some("minecraft:stick".to_string()),
        },
        ..datapack_kit()
    };
    let (out, warnings) = compile_to_datapack(&b).unwrap();
    let json: serde_json::Value = serde_json::from_str(&out.advancement_json).unwrap();
    assert_eq!(
        json["criteria"]["modcanvas_trigger"]["trigger"],
        "minecraft:inventory_changed"
    );
    assert_eq!(
        json["criteria"]["modcanvas_trigger"]["conditions"]["items"][0]["items"][0],
        "minecraft:stick"
    );
    assert!(
        warnings.iter().any(|w| w.0.contains("inventory_changed")),
        "the coarsening must be a deterministic warning"
    );
}

#[test]
fn placed_block_emits_placed_block() {
    let b = Behavior {
        trigger: Trigger::BlockPlaced {
            block: Some("minecraft:oak_log".to_string()),
        },
        ..datapack_kit()
    };
    let (out, _) = compile_to_datapack(&b).unwrap();
    let json: serde_json::Value = serde_json::from_str(&out.advancement_json).unwrap();
    assert_eq!(
        json["criteria"]["modcanvas_trigger"]["trigger"],
        "minecraft:placed_block"
    );
    assert_eq!(
        json["criteria"]["modcanvas_trigger"]["conditions"]["location"]["block"]["blocks"][0],
        "minecraft:oak_log"
    );
}

#[test]
fn advancement_completed_chains_as_child() {
    let b = Behavior {
        trigger: Trigger::AdvancementCompleted {
            advancement: "minecraft:story/root".to_string(),
        },
        ..datapack_kit()
    };
    let (out, _) = compile_to_datapack(&b).unwrap();
    let json: serde_json::Value = serde_json::from_str(&out.advancement_json).unwrap();
    assert_eq!(json["parent"], "minecraft:story/root");
    assert_eq!(
        json["criteria"]["modcanvas_trigger"]["trigger"],
        "minecraft:impossible"
    );
}

#[test]
fn unsupported_triggers_are_errors() {
    for trigger in [
        Trigger::PlayerJoinsGame,
        Trigger::PlayerLeavesGame,
        Trigger::PlayerTakesDamage,
        Trigger::TimedEvery { ticks: 100 },
    ] {
        let b = Behavior {
            trigger,
            ..datapack_kit()
        };
        let err = compile_to_datapack(&b).unwrap_err();
        assert!(
            err.0.contains("no datapack criterion"),
            "unexpected: {}",
            err.0
        );
    }
}

#[test]
fn set_stage_action_is_an_error() {
    let b = Behavior {
        actions: vec![Action::SetStage {
            stage: "done".to_string(),
        }],
        ..datapack_kit()
    };
    let err = compile_to_datapack(&b).unwrap_err();
    assert!(err.0.contains("SetStage"));
}

#[test]
fn function_actions_emit_commands() {
    let b = Behavior {
        actions: vec![
            Action::GiveItem {
                item: "minecraft:bread".to_string(),
                count: 8,
            },
            Action::RemoveItem {
                item: "minecraft:stone".to_string(),
            },
            Action::RunCommand {
                command: "say hello".to_string(),
            },
            Action::Message {
                text: "Hello \"world\"!".to_string(),
            },
            Action::Teleport {
                x: 1.0,
                y: 2.0,
                z: 3.0,
                yaw: 0.0,
                pitch: 0.0,
            },
            Action::SpawnEntity {
                entity: "minecraft:creeper".to_string(),
            },
        ],
        ..datapack_kit()
    };
    let (out, _) = compile_to_datapack(&b).unwrap();
    let body = out.function_body;
    assert!(body.contains("give @s minecraft:bread 8"));
    assert!(body.contains("clear @s minecraft:stone"));
    assert!(body.contains("say hello"));
    assert!(body.contains("tellraw @s \"Hello \\\"world\\\"!\""));
    assert!(body.contains("tp @s 1 2 3"));
    assert!(body.contains("summon minecraft:creeper ~ ~ ~"));
    // Order is preserved — the compiler must not reorder actions.
    let give_pos = body.find("give").unwrap();
    let clear_pos = body.find("clear").unwrap();
    let summon_pos = body.find("summon").unwrap();
    assert!(give_pos < clear_pos && clear_pos < summon_pos);
}

#[test]
fn heal_maps_to_instant_health_with_warning() {
    let b = Behavior {
        actions: vec![Action::Heal { amount: 4.0 }],
        ..datapack_kit()
    };
    let (out, warnings) = compile_to_datapack(&b).unwrap();
    assert!(out.function_body.contains("effect give @s minecraft:instant_health 1 1"));
    assert!(warnings.iter().any(|w| w.0.contains("instant_health")));
}

#[test]
fn datapack_dispatch_via_compile_output() {
    let out = CompileOutput::from_behavior(&datapack_kit());
    match out {
        CompileOutput::Ok { backend, script, .. } => {
            assert_eq!(backend, Backend::Datapack);
            assert!(script.contains("player_killed_entity"));
            assert!(script.contains("give @s minecraft:diamond 1"));
        }
        CompileOutput::Err { .. } => panic!("valid datapack behavior must compile"),
    }
}

#[test]
fn unsupported_datapack_behavior_err_via_output() {
    let b = Behavior {
        trigger: Trigger::PlayerJoinsGame,
        ..datapack_kit()
    };
    match CompileOutput::from_behavior(&b) {
        CompileOutput::Err { backend, reason } => {
            assert_eq!(backend, Backend::Datapack);
            assert!(reason.contains("no datapack criterion"));
        }
        CompileOutput::Ok { .. } => panic!("joins has no datapack criterion"),
    }
}

#[test]
fn default_backend_is_kubejs() {
    // A behavior serialized without `backend` (pre-s46 files) must deserialize
    // as kubejs — stored behaviors keep their compile path.
    let json = r#"{
        "id": "old:kit",
        "name": "Old Kit",
        "trigger": { "kind": "player_joins_game" },
        "conditions": [],
        "actions": [{ "kind": "give_item", "item": "minecraft:diamond", "count": 1 }]
    }"#;
    let b: Behavior = serde_json::from_str(json).unwrap();
    assert_eq!(b.backend, Backend::Kubejs);
}
