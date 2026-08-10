use super::*;
use crate::quest::*;

#[test]
fn editor_only_fields_roundtrip_through_json() {
    // The bezier curve data + book theme palette are editor-only fields that
    // must survive the graph's JSON persistence (save_quest_graph → quests.json
    // → get_quest_graph) even though they are never written to SNBT.
    let mut graph = QuestGraph::new("p", "Book");
    graph.edge_color = Some("#f2c94c".to_string());
    graph.edge_cycle_color = Some("#ff6b6b".to_string());
    graph.active_theme = Some("slate".to_string());
    graph.edges.push(QuestEdge {
        id: "e1".to_string(),
        source: "a".to_string(),
        target: "b".to_string(),
        label: None,
        edge_type: EdgeType::Prerequisite,
        inverted: false,
        bezier: Some(EdgeBezier {
            source_control: [120.5, -40.25],
            target_control: [-80.0, 30.0],
        }),
    });

    let json = serde_json::to_string(&graph).unwrap();
    let back: QuestGraph = serde_json::from_str(&json).unwrap();
    assert_eq!(back.active_theme.as_deref(), Some("slate"));
    assert_eq!(back.edge_color.as_deref(), Some("#f2c94c"));
    let edge = &back.edges[0];
    let bezier = edge.bezier.as_ref().expect("bezier survives");
    assert_eq!(bezier.source_control, [120.5, -40.25]);
    assert_eq!(bezier.target_control, [-80.0, 30.0]);
}

#[test]
fn editor_only_fields_default_when_absent() {
    let json = r#"{"id":"g","project_id":"p","name":"","description":"","nodes":[],"edges":[{"id":"e1","source":"a","target":"b","label":null,"edge_type":"prerequisite","inverted":false}],"reward_tables":[],"chapters":[],"chapter_groups":[],"book_progression_mode":"default","book_icon":"","book_background_image":"","quest_color":"","default_quest_size":{"width":24,"height":24},"default_quest_shape":"default","grid_scale":0.5,"default_reward_team":false,"default_consume_items":false,"default_autoclaim_rewards":"disabled","detection_delay":20}"#;
    let graph: QuestGraph = serde_json::from_str(json).unwrap();
    assert!(graph.edges[0].bezier.is_none());
    assert!(graph.edge_color.is_none());
    assert!(graph.active_theme.is_none());
}
