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

#[test]
fn alias_keys_roundtrip_with_ftb_canonical_names() {
    // s67 alias unification: FTB writes `min_width`, `invisible`, and
    // `invisible_until_tasks` (verified in the jar's Quest.writeData). The
    // import accepts the legacy app-emitted keys too; the export emits only
    // the canonical names. tags (a string list on every quest object) must
    // round-trip in both layouts.
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    std::fs::write(chapters_dir.join("alias.snbt"), r#"{
    id = "ch_alias"
    filename = "alias"
    title = "alias"
    quests = [
        {
            id = "q_legacy_keys"
            title = "Legacy Keys"
            min_window_width: 150
            invisible_until_completed: 1b
            invisible_until_x_tasks: 3
            dependencies = []
        }
        {
            id = "q_canonical"
            title = "Canonical Keys"
            min_width: 200
            invisible: 1b
            invisible_until_tasks: 5
            tags: ["main", "hidden"]
            dependencies = []
        }
    ]
}"#).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;

    let ql = graph.nodes.iter().find(|n| n.id == "q_legacy_keys").expect("legacy-key quest imported");
    assert_eq!(ql.min_window_width, 150, "legacy min_window_width accepted");
    assert!(ql.invisible_until_completed, "legacy invisible_until_completed accepted");
    assert_eq!(ql.invisible_until_x_tasks, 3, "legacy invisible_until_x_tasks accepted");
    assert!(ql.tags.is_empty(), "no tags on legacy quest");

    let qc = graph.nodes.iter().find(|n| n.id == "q_canonical").expect("canonical quest imported");
    assert_eq!(qc.min_window_width, 200, "canonical min_width parsed");
    assert!(qc.invisible_until_completed, "canonical invisible parsed");
    assert_eq!(qc.invisible_until_x_tasks, 5, "canonical invisible_until_tasks parsed");
    assert_eq!(qc.tags, vec!["main".to_string(), "hidden".to_string()], "tags parsed");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    let exported = std::fs::read_to_string(
        export_dir.path().join("config").join("ftbquests").join("quests").join("chapters").join("alias.snbt")
    ).unwrap();

    // Export emits ONLY canonical keys, no legacy aliases.
    assert!(exported.contains("min_width: 150"), "legacy min_window_width promoted to min_width");
    assert!(!exported.contains("min_window_width"), "no legacy min_window_width emitted");
    assert!(exported.contains("invisible: 1b"), "invisible emitted in both layouts");
    assert!(!exported.contains("invisible_until_completed"), "no legacy invisible_until_completed emitted");
    assert!(exported.contains("invisible_until_tasks: 3"), "legacy x_tasks promoted to invisible_until_tasks");
    assert!(!exported.contains("invisible_until_x_tasks"), "no legacy invisible_until_x_tasks emitted");
    assert!(exported.contains("tags: [ \"main\", \"hidden\" ]"), "tags emitted");

    // Round-trip: canonical output re-imports to the same values.
    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    let ql2 = graph2.nodes.iter().find(|n| n.id == "q_legacy_keys").expect("legacy quest re-imported");
    assert_eq!(ql2.min_window_width, 150, "min_width survived round-trip");
    assert!(ql2.invisible_until_completed, "invisible survived round-trip");
    assert_eq!(ql2.invisible_until_x_tasks, 3, "invisible_until_tasks survived round-trip");
    let qc2 = graph2.nodes.iter().find(|n| n.id == "q_canonical").expect("canonical quest re-imported");
    assert_eq!(qc2.min_window_width, 200, "min_width survived round-trip (canonical quest)");
    assert!(qc2.invisible_until_completed, "invisible survived round-trip (canonical quest)");
    assert_eq!(qc2.invisible_until_x_tasks, 5, "invisible_until_tasks survived round-trip (canonical quest)");
    assert_eq!(qc2.tags, vec!["main".to_string(), "hidden".to_string()], "tags survived round-trip");
}

#[test]
fn exotic_description_lines_roundtrip_verbatim() {
    // FTB descriptions are opaque string lines: JSON chat components, links,
    // and hex-id quest references pass through the round-trip untouched
    // (the parser treats lines as strings; the editor renders them).
    let tmp = tempfile::tempdir().unwrap();
    let quests_dir = tmp.path().join("config").join("ftbquests").join("quests");
    let chapters_dir = quests_dir.join("chapters");
    std::fs::create_dir_all(&chapters_dir).unwrap();
    std::fs::write(quests_dir.join("data.snbt"), "{version: 13}").unwrap();

    let exotic_desc = [
        r#"{"text":"Green text","color":"green"}"#,
        "[Click here](https://example.com/guide)",
        "See quest {4e0f7c2a3b8d4e1f} for details",
        "Plain line with §lbold§r formatting codes",
    ].join("\n");

    std::fs::write(chapters_dir.join("desc.snbt"), format!(r#"{{
    id = "ch_desc"
    filename = "desc"
    title = "desc"
    quests = [
        {{
            id = "q_desc"
            title = "Exotic Description"
            description = [
                "{{\"text\":\"Green text\",\"color\":\"green\"}}"
                "[Click here](https://example.com/guide)"
                "See quest {{4e0f7c2a3b8d4e1f}} for details"
                "Plain line with §lbold§r formatting codes"
            ]
            dependencies = []
        }}
    ]
}}"#)).unwrap();

    let import_result = import_ftb_quests(tmp.path()).unwrap();
    let graph = import_result.graph;
    let q = graph.nodes.iter().find(|n| n.id == "q_desc").expect("exotic-desc quest imported");
    assert_eq!(q.description, exotic_desc, "exotic description lines imported verbatim");

    let export_dir = tempfile::tempdir().unwrap();
    export_ftb_quests_snbt(&graph, export_dir.path(), &import_result.sidecar).unwrap();
    let exported = std::fs::read_to_string(
        export_dir.path().join("config").join("ftbquests").join("quests").join("chapters").join("desc.snbt")
    ).unwrap();
    assert!(exported.contains(r#"\"text\":\"Green text\",\"color\":\"green\""#), "JSON-component line preserved (escaped quotes in SNBT string)");
    assert!(exported.contains("[Click here](https://example.com/guide)"), "link line preserved");
    assert!(exported.contains("{4e0f7c2a3b8d4e1f}"), "hex-id reference preserved");
    assert!(exported.contains("§lbold§r"), "formatting codes preserved");

    let graph2 = import_ftb_quests(export_dir.path()).unwrap().graph;
    let q2 = graph2.nodes.iter().find(|n| n.id == "q_desc").expect("exotic-desc quest re-imported");
    assert_eq!(q2.description, exotic_desc, "exotic description lines survived round-trip verbatim");
}
