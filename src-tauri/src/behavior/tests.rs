//! Golden-output tests for the KubeJS backend of the behavior compiler
//! (roadmap §11.2 — "the compiler must be covered by golden-output tests
//! (input IR → expected script string)"). Base shapes: the chunk-1 pair,
//! error paths, and the UI-facing CompileOutput. The s46 vocabulary tests
//! live in `tests_vocabulary.rs` / `tests_conditions_actions.rs`.

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
