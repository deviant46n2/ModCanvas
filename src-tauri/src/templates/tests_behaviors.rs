//! Template behavior fidelity tests (split out of tests.rs at s70 — the
//! behavior-coverage lock pushed the scaffold-fidelity file past the 300-line
//! soft limit; same pattern as the s46 behavior-test split).
//!
//! The load-bearing guarantee: the scaffolded `.modcanvas/behaviors.json`
//! must (a) be valid IR the app's own store reads, (b) compile on its
//! declared backend — a template behavior that errors on open would teach
//! the wrong lesson — and (c) demonstrate the FULL vocabulary (every trigger
//! variant, every condition, every action), because the template is the
//! no-code showcase: a beginner assembles a pack from what they can SEE
//! exists. The template ships the minimal complete set (14 examples) — the
//! smoke suite owns exhaustive variety.

use tempfile::tempdir;

fn scaffolded_root(template_id: &str) -> (tempfile::TempDir, std::path::PathBuf) {
    let tmp = tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    super::scaffold_template(&root, template_id)
        .unwrap_or_else(|e| panic!("{template_id} template scaffolds: {e}"));
    (tmp, root)
}

#[test]
fn scaffold_writes_example_behaviors_state() {
    // The IDE tour ships example behaviors (the Behaviors tab demonstrates on
    // first open). The intro deliberately ships none — its core loop never
    // reaches Behaviors.
    let (_tmp, root) = scaffolded_root("ide-tour");
    let behaviors_file = root.join(".modcanvas").join("behaviors.json");
    assert!(behaviors_file.exists(), "template behaviors state missing");

    let contents = std::fs::read_to_string(&behaviors_file).unwrap();
    let behaviors: Vec<crate::behavior::Behavior> =
        serde_json::from_str(&contents).expect("template behaviors must be valid IR");
    assert_eq!(behaviors.len(), 14, "template ships exactly 14 example behaviors");

    // Every example behavior compiles on its declared backend — a broken
    // template behavior would fail in the editor's live preview on first open.
    for b in &behaviors {
        let out = crate::behavior::CompileOutput::from_behavior(b);
        assert!(
            matches!(out, crate::behavior::CompileOutput::Ok { .. }),
            "template behavior '{}' ({:?}) must compile: {:?}",
            b.name,
            b.backend,
            out
        );
    }
    // The template demonstrates both backends (roadmap §11.2: KubeJS first,
    // datapack second).
    let backends: std::collections::HashSet<_> =
        behaviors.iter().map(|b| b.backend).collect();
    assert_eq!(backends.len(), 2, "template examples cover kubejs + datapack");
}

#[test]
fn example_behaviors_scaffold_through_state_path() {
    let (_tmp, root) = scaffolded_root("ide-tour");
    // The scaffold must NOT place behaviors under config/ (the s45 recipe-writer
    // bug class) — they are project-root private state.
    assert!(!root.join("config").join(".modcanvas").exists());
    assert!(
        !root.join("config").join("ftbquests").join("quests").join(".modcanvas").exists()
    );
}

/// The template is the no-code showcase — a beginner assembles a pack from
/// what they can SEE in the Behaviors tab. If a vocabulary variant never
/// appears in the template, it is invisible to the product's target user.
/// This lock (the template sibling of `tests_smoke_suite.rs`) forces the
/// template to keep demonstrating the FULL vocabulary: every trigger, every
/// condition, every action. When the vocabulary grows, the template must
/// grow with it.
#[test]
fn template_examples_cover_the_full_vocabulary() {
    let (_tmp, root) = scaffolded_root("ide-tour");
    let contents = std::fs::read_to_string(root.join(".modcanvas").join("behaviors.json")).unwrap();
    let behaviors: Vec<crate::behavior::Behavior> =
        serde_json::from_str(&contents).expect("template behaviors must be valid IR");

    use crate::behavior::{Action, Condition, Trigger};
    let triggers: Vec<&Trigger> = behaviors.iter().map(|b| &b.trigger).collect();
    let has_trigger = |p: &dyn Fn(&Trigger) -> bool| triggers.iter().any(|t| p(t));

    assert!(has_trigger(&|t| matches!(t, Trigger::PlayerJoinsGame)), "player_joins_game");
    assert!(has_trigger(&|t| matches!(t, Trigger::PlayerLeavesGame)), "player_leaves_game");
    assert!(has_trigger(&|t| matches!(t, Trigger::PlayerTakesDamage)), "player_takes_damage");
    assert!(has_trigger(&|t| matches!(t, Trigger::PlayerKillsEntity { .. })), "player_kills_entity");
    assert!(has_trigger(&|t| matches!(t, Trigger::ItemCrafted { .. })), "item_crafted");
    assert!(has_trigger(&|t| matches!(t, Trigger::ItemPickedUp { .. })), "item_picked_up");
    assert!(has_trigger(&|t| matches!(t, Trigger::BlockPlaced { .. })), "block_placed");
    assert!(has_trigger(&|t| matches!(t, Trigger::BlockBroken { .. })), "block_broken");
    assert!(has_trigger(&|t| matches!(t, Trigger::AdvancementCompleted { .. })), "advancement_completed");
    assert!(has_trigger(&|t| matches!(t, Trigger::TimedEvery { .. })), "timed_every");

    let conditions: Vec<&Condition> = behaviors
        .iter()
        .flat_map(|b| b.conditions.iter())
        .collect();
    let has_condition = |p: &dyn Fn(&Condition) -> bool| conditions.iter().any(|c| p(c));

    assert!(has_condition(&|c| matches!(c, Condition::ItemHeld { .. })), "item_held");
    assert!(has_condition(&|c| matches!(c, Condition::ItemInInventory { .. })), "item_in_inventory");
    assert!(has_condition(&|c| matches!(c, Condition::EntityType { .. })), "entity_type");
    assert!(has_condition(&|c| matches!(c, Condition::Dimension { .. })), "dimension");
    assert!(has_condition(&|c| matches!(c, Condition::RandomChance { .. })), "random_chance");
    assert!(has_condition(&|c| matches!(c, Condition::HealthBelow { .. })), "health_below");

    let actions: Vec<&Action> = behaviors.iter().flat_map(|b| b.actions.iter()).collect();
    let has_action = |p: &dyn Fn(&Action) -> bool| actions.iter().any(|a| p(a));

    assert!(has_action(&|a| matches!(a, Action::GiveItem { .. })), "give_item");
    assert!(has_action(&|a| matches!(a, Action::RemoveItem { .. })), "remove_item");
    assert!(has_action(&|a| matches!(a, Action::RunCommand { .. })), "run_command");
    assert!(has_action(&|a| matches!(a, Action::Message { .. })), "message");
    assert!(has_action(&|a| matches!(a, Action::Heal { .. })), "heal");
    assert!(has_action(&|a| matches!(a, Action::Teleport { .. })), "teleport");
    assert!(has_action(&|a| matches!(a, Action::SpawnEntity { .. })), "spawn_entity");
    assert!(has_action(&|a| matches!(a, Action::SetStage { .. })), "set_stage");
}

#[test]
fn intro_ships_no_behaviors_state() {
    // s49: the intro is the core loop only — Behaviors is a full-IDE surface
    // the intro never reaches, so no example behaviors are scaffolded.
    let (_tmp, root) = scaffolded_root("intro");
    assert!(
        !root.join(".modcanvas").join("behaviors.json").exists(),
        "intro must not ship example behaviors"
    );
}