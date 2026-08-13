//! FTB id validity + re-base export round-trip tests (s42).
//! The serialization side of the dependency-line fix: invalid ids are
//! re-based deterministically and dependencies survive export + re-import.

#[cfg(test)]
mod tests {
    use crate::imports::ftb_quests::export::{is_valid_ftb_id, rebase_invalid_ids};
    use crate::imports::ftb_quests::{export_ftb_quests_snbt_for_layout, import_ftb_quests};
    use crate::quest::*;
    use crate::templates::scaffold_template;

    #[test]
    fn invalid_ids_are_detected() {
        // 0xA... > Long.MAX_VALUE → FTB's parseLong throws (s42 root cause).
        assert!(!is_valid_ftb_id("A000000000000101"));
        assert!(!is_valid_ftb_id("F5C978FE592C4C5F"));
        assert!(!is_valid_ftb_id("0")); // FTB regenerates 0
        assert!(!is_valid_ftb_id("1")); // and 1
        assert!(!is_valid_ftb_id("not-hex"));
        // Positive ids parse fine.
        assert!(is_valid_ftb_id("310969B8FE0A94DE"));
        assert!(is_valid_ftb_id("1000000000000101"));
        assert!(is_valid_ftb_id("7FFFFFFFFFFFFFFF"));
    }

    #[test]
    fn rebase_is_deterministic_and_consistent() {
    let mut graph = QuestGraph::new("p", "t");
    // One chapter, one quest, one task, one reward, one edge — all with
    // the invalid A/B/C-prefixed ids the template used to ship.
    graph.chapters.push(QuestChapter {
        id: "A000000000000001".into(),
        title: "Early Game".into(),
        description: String::new(),
        icon: String::new(),
        background_image: String::new(),
        order_index: 0,
        hide_until_first_quest_complete: false,
        default_quest_size: QuestSize::default(),
        quest_color: String::new(),
        group_id: None,
        default_quest_shape: QuestShape::Default,
        default_enabled: true,
        progression_mode: QuestProgressionMode::Default,
        images: Vec::new(),
        subtitle: String::new(),
        default_min_width: 0,
        always_invisible: false,
        default_hide_dependency_lines: false,
        hide_quest_details_until_startable: false,
        hide_quest_until_deps_visible: false,
        hide_quest_until_deps_complete: false,
        hide_text_until_complete: false,
        autofocus_id: String::new(),
        default_repeatable: false,
        require_sequential_tasks: false,
    });
        graph.nodes.push(QuestNode {
            id: "A000000000000101".into(),
            node_type: QuestNodeType::Quest,
            label: "Start".into(),
            chapter_id: Some("A000000000000001".into()),
            objectives: vec![QuestObjective {
                id: "B000000000000101".into(),
                ..Default::default()
            }],
            rewards: vec![QuestReward {
                id: "C000000000000101".into(),
                ..Default::default()
            }],
            ..Default::default()
        });
        graph.nodes.push(QuestNode {
            id: "A000000000000102".into(),
            node_type: QuestNodeType::Quest,
            label: "Next".into(),
            chapter_id: Some("A000000000000001".into()),
            ..Default::default()
        });
        graph.edges.push(QuestEdge {
            source: "A000000000000101".into(),
            target: "A000000000000102".into(),
            ..Default::default()
        });
        // A non-FTB-shaped id (synthetic/test data) is out of scope — it
        // must survive the re-base untouched.
        graph.nodes.push(QuestNode {
            id: "q_synthetic".into(),
            node_type: QuestNodeType::Quest,
            label: "Synthetic".into(),
            ..Default::default()
        });

        let a = rebase_invalid_ids(&graph);
        let b = rebase_invalid_ids(&graph);
        // Deterministic: both passes produce the same ids.
        assert_eq!(
            a.nodes.iter().map(|n| n.id.clone()).collect::<Vec<_>>(),
            b.nodes.iter().map(|n| n.id.clone()).collect::<Vec<_>>()
        );
        // Every FTB-shaped id is now valid (the synthetic id is out of scope).
        for n in &a.nodes {
            if n.id == "q_synthetic" {
                continue;
            }
            assert!(is_valid_ftb_id(&n.id), "node id {}", n.id);
            for o in &n.objectives {
                assert!(is_valid_ftb_id(&o.id), "objective id {}", o.id);
            }
            for r in &n.rewards {
                assert!(is_valid_ftb_id(&r.id), "reward id {}", r.id);
            }
        }
        // References stayed consistent: the edge still links the same quests,
        // and the chapter_id still points at the (re-based) chapter.
        let edge = &a.edges[0];
        assert!(a.nodes.iter().any(|n| n.id == edge.source));
        assert!(a.nodes.iter().any(|n| n.id == edge.target));
        let ch = a.nodes[0].chapter_id.as_ref().unwrap();
        assert!(a.chapters.iter().any(|c| &c.id == ch));
        // The synthetic id is out of scope and untouched.
        assert!(a.nodes.iter().any(|n| n.id == "q_synthetic"));
    }

    #[test]
    fn rebased_export_keeps_dependencies() {
        // The s42 regression: a graph with edges + invalid ids must export
        // dependencies that reference the re-based ids — a re-import of the
        // output must rebuild the edges (the editor's dependency lines).
        let tmp = tempfile::tempdir().unwrap();
        let mut graph = QuestGraph::new("p", "t");
        graph.layout = "FlatChapters".into();
        graph.chapters.push(QuestChapter {
            id: "A000000000000001".into(),
            title: "Early Game".into(),
            description: String::new(),
            icon: String::new(),
            background_image: String::new(),
            order_index: 0,
            hide_until_first_quest_complete: false,
            default_quest_size: QuestSize::default(),
            quest_color: String::new(),
            group_id: None,
            default_quest_shape: QuestShape::Default,
            default_enabled: true,
            progression_mode: QuestProgressionMode::Default,
            images: Vec::new(),
            subtitle: String::new(),
            default_min_width: 0,
            always_invisible: false,
            default_hide_dependency_lines: false,
            hide_quest_details_until_startable: false,
            hide_quest_until_deps_visible: false,
            hide_quest_until_deps_complete: false,
            hide_text_until_complete: false,
            autofocus_id: String::new(),
            default_repeatable: false,
            require_sequential_tasks: false,
        });
        graph.nodes.push(QuestNode {
            id: "A000000000000001".into(),
            node_type: QuestNodeType::Chapter,
            label: "Early Game".into(),
            ..Default::default()
        });
        graph.nodes.push(QuestNode {
            id: "A000000000000101".into(),
            node_type: QuestNodeType::Quest,
            label: "Start".into(),
            chapter_id: Some("A000000000000001".into()),
            ..Default::default()
        });
        graph.nodes.push(QuestNode {
            id: "A000000000000102".into(),
            node_type: QuestNodeType::Quest,
            label: "Next".into(),
            chapter_id: Some("A000000000000001".into()),
            ..Default::default()
        });
        graph.edges.push(QuestEdge {
            source: "A000000000000101".into(),
            target: "A000000000000102".into(),
            ..Default::default()
        });

        crate::imports::ftb_quests::export_ftb_quests_snbt_for_layout(&graph, tmp.path(), &Default::default(), None).unwrap();
        let out = tmp.path().join("config").join("ftbquests").join("quests");
        let chapter_file = std::fs::read_dir(out.join("chapters")).unwrap()
            .next().unwrap().unwrap().path();
        let content = std::fs::read_to_string(&chapter_file).unwrap();
        for e in std::fs::read_dir(out.clone()).unwrap().flatten() {
            eprintln!("TREE: quests/{}", e.file_name().to_string_lossy());
            if e.path().is_dir() {
                for f in std::fs::read_dir(e.path()).unwrap().flatten() {
                    eprintln!("  TREE: quests/{}/{}", e.file_name().to_string_lossy(), f.file_name().to_string_lossy());
                }
            }
        }
        eprintln!("EXPORTED CHAPTER:\n{content}");
        assert!(content.contains("dependencies"), "dependencies must survive the re-base:\n{content}");

        // The re-import must rebuild the edge.
        let reimport = crate::imports::ftb_quests::import_ftb_quests(tmp.path()).unwrap();
        eprintln!("REIMPORT: chapters={} quests={} edges={}", reimport.chapter_count, reimport.quest_count, reimport.graph.edges.len());
        assert!(reimport.graph.edges.len() >= 1, "edge must rebuild from the rebased export");
    }
}

#[cfg(test)]
mod real_path_tests {
    use super::*;
    use crate::imports::ftb_quests::import_ftb_quests;

    #[test]
    fn template_graph_keeps_deps_through_rebase_export() {
        // The full realistic path: scaffold the app's own template (FlatChapters,
        // 1/2/3-prefixed ids, dependencies), import it, export with the re-base,
        // and re-import — the edges must survive end to end.
        let tmp = tempfile::tempdir().unwrap();
        crate::templates::scaffold_template(&tmp.path().to_path_buf(), "ide-tour").unwrap();

        let imported = import_ftb_quests(tmp.path()).unwrap();
        assert!(imported.graph.edges.len() >= 5, "template graph must import with edges, got {}", imported.graph.edges.len());

        let export_dir = tempfile::tempdir().unwrap();
        crate::imports::ftb_quests::export_ftb_quests_snbt_for_layout(&imported.graph, export_dir.path(), &Default::default(), None).unwrap();
        let out = export_dir.path().join("config").join("ftbquests").join("quests");
        for f in std::fs::read_dir(out.join("chapters")).unwrap().flatten() {
            let content = std::fs::read_to_string(f.path()).unwrap();
            assert!(content.contains("dependencies"), "re-based export must keep deps in {}:\n{}", f.path().display(), content);
        }

        let reimport = import_ftb_quests(export_dir.path()).unwrap();
        assert!(reimport.graph.edges.len() >= 5, "edges must survive the rebased export round-trip, got {}", reimport.graph.edges.len());
    }
}
