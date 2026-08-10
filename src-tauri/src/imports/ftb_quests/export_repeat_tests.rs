//! Quest repeatability / visibility field export round-trip tests.

use super::*;
use crate::quest::*;
use tempfile;

#[test]
fn per_quest_repeat_and_visibility_fields_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("repeat.snbt"), r#"{
    id = "ch_repeat"
    filename = "repeat"
    title = "repeat"
    quests = [
        {
            id = "q_repeat"
            title = "Repeat Quest"
            can_repeat: 1b
            repeat_cooldown: 120
            hide_lock_icon: 1b
            guide_page: "quests:guide/my_guide"
            max_completable_dependents: 3
            dependencies = []
        }
        {
            id = "q_default"
            title = "Plain Quest"
            dependencies = []
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let mut graph = import_result.graph;
    let qr = graph.nodes.iter().find(|n| n.id == "q_repeat").expect("repeat quest imported");
    assert!(qr.can_be_repeatable, "can_repeat 1b -> can_be_repeatable true");
    assert_eq!(qr.repeat_cooldown, 120, "repeat_cooldown seconds parsed");
    assert!(qr.hide_lock_icon, "hide_lock_icon parsed");
    assert_eq!(qr.guide_page, "quests:guide/my_guide", "guide_page parsed");
    assert_eq!(qr.max_completable_dependents, 3, "max_completable_dependents parsed");

    let qd = graph.nodes.iter().find(|n| n.id == "q_default").expect("plain quest imported");
    assert!(!qd.can_be_repeatable, "plain quest not repeatable");
    assert_eq!(qd.repeat_cooldown, 0);
    assert!(!qd.hide_lock_icon);
    assert!(qd.guide_page.is_empty());
    assert_eq!(qd.max_completable_dependents, 0);

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();

    let import_result2 = import_ftb_quests(export_dir.path()).unwrap();
    let mut graph2 = import_result2.graph;
    let qr2 = graph2.nodes.iter().find(|n| n.id == "q_repeat").expect("repeat quest re-imported");
    assert!(qr2.can_be_repeatable, "repeatability survived export");
    assert_eq!(qr2.repeat_cooldown, 120, "repeat_cooldown survived export");
    assert!(qr2.hide_lock_icon, "hide_lock_icon survived export");
    assert_eq!(qr2.guide_page, "quests:guide/my_guide", "guide_page survived export");
    assert_eq!(qr2.max_completable_dependents, 3, "max_completable_dependents survived export");

    // Mutate then round-trip again through export to confirm fields persist.
    let node = graph2.nodes.iter_mut().find(|n| n.id == "q_repeat").unwrap();
    node.repeat_cooldown = 300;
    node.max_completable_dependents = 5;
    node.hide_lock_icon = false;

    let export_dir2 = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph2, export_dir2.path(), &import_result2.sidecar).unwrap();
    let graph3 = import_ftb_quests(export_dir2.path()).unwrap().graph;
    let qr3 = graph3.nodes.iter().find(|n| n.id == "q_repeat").expect("repeat quest re-imported again");
    assert_eq!(qr3.repeat_cooldown, 300, "edited repeat_cooldown persisted");
    assert_eq!(qr3.max_completable_dependents, 5, "edited max_completable_dependents persisted");
    assert!(!qr3.hide_lock_icon, "edited hide_lock_icon persisted");
    assert_eq!(qr3.guide_page, "quests:guide/my_guide", "guide_page still present");
}

#[test]
fn repeat_fields_export_uses_ftb_canonical_keys() {
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();
    std::fs::write(chapters_dir.join("legacy.snbt"), r#"{
    id = "ch_legacy"
    filename = "legacy"
    title = "legacy"
    quests = [
        {
            id = "q_legacy"
            title = "Legacy Repeat"
            can_repeat: 1b
            repeat_time: 60
            repeat_min_delay: 5
            repeat_max_delay: 10
            dependencies = []
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    let q = graph.nodes.iter().find(|n| n.id == "q_legacy").expect("legacy quest imported");
    assert!(q.can_be_repeatable, "legacy can_repeat parsed");
    assert_eq!(q.repeat_cooldown, 0, "legacy repeat_time does not map to cooldown");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    let exported = std::fs::read_to_string(
        export_dir.path().join("config").join("ftbquests").join("quests").join("chapters").join("legacy.snbt")
    ).unwrap();
    assert!(exported.contains("can_repeat: 1b"), "exports can_repeat");
    assert!(exported.contains("repeat_cooldown: 60"), "legacy repeat_time promoted to repeat_cooldown");
    assert!(!exported.contains("repeat_time"), "no legacy repeat_time key emitted");
    assert!(!exported.contains("repeat_min_delay"), "no legacy repeat_min_delay emitted");
    assert!(!exported.contains("repeat_max_delay"), "no legacy repeat_max_delay emitted");
    assert!(!exported.contains("repeatability"), "no legacy repeatability emitted");
}
