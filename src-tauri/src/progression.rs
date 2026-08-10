use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

pub use crate::shared::{EdgeType, Position};

/// A node in the progression graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressionNode {
    pub id: String,
    pub node_type: ProgressionNodeType,
    pub label: String,
    pub description: String,
    pub position: Position,
    pub data: HashMap<String, String>,
    pub mod_refs: Vec<String>,
    pub item_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProgressionNodeType {
    /// A major milestone in the pack
    Milestone,
    /// An unlock that gates content
    Unlock,
    /// A gameplay phase (early, mid, late, endgame)
    Phase,
    /// A specific achievement or task
    Achievement,
    /// A mod or content introduction
    ContentIntroduction,
}

impl ProgressionNodeType {
    pub fn to_string(&self) -> String {
        match self {
            ProgressionNodeType::Milestone => "milestone".to_string(),
            ProgressionNodeType::Unlock => "unlock".to_string(),
            ProgressionNodeType::Phase => "phase".to_string(),
            ProgressionNodeType::Achievement => "achievement".to_string(),
            ProgressionNodeType::ContentIntroduction => "content".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "milestone" => ProgressionNodeType::Milestone,
            "unlock" => ProgressionNodeType::Unlock,
            "phase" => ProgressionNodeType::Phase,
            "achievement" => ProgressionNodeType::Achievement,
            "content" => ProgressionNodeType::ContentIntroduction,
            _ => ProgressionNodeType::Milestone,
        }
    }
}

/// An edge connecting two nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressionEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: Option<String>,
    pub edge_type: EdgeType,
}

/// The complete progression graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressionGraph {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub nodes: Vec<ProgressionNode>,
    pub edges: Vec<ProgressionEdge>,
    #[serde(default)]
    pub mod_names: HashMap<String, String>,
}

impl ProgressionGraph {
    pub fn new(project_id: &str, name: &str) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            name: name.to_string(),
            description: String::new(),
            nodes: Vec::new(),
            edges: Vec::new(),
            mod_names: HashMap::new(),
        }
    }
}

/// Analysis results for the progression graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressionAnalysis {
    pub total_nodes: usize,
    pub total_edges: usize,
    pub phases: Vec<String>,
    pub bottlenecks: Vec<Bottleneck>,
    pub dead_ends: Vec<String>,
    pub unreachable_nodes: Vec<String>,
    pub coverage: ProgressionCoverage,
    pub issues: Vec<ProgressionIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bottleneck {
    pub node_id: String,
    pub node_label: String,
    pub incoming_count: usize,
    pub outgoing_count: usize,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressionCoverage {
    pub mods_used: Vec<String>,
    pub mods_unused: Vec<String>,
    pub total_mods: usize,
    pub coverage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressionIssue {
    pub severity: String,
    pub message: String,
    pub node_id: Option<String>,
}

/// Analyze a progression graph for issues and insights
pub fn analyze_progression(graph: &ProgressionGraph) -> ProgressionAnalysis {
    let mut bottlenecks = Vec::new();
    let mut dead_ends = Vec::new();
    let mut unreachable_nodes = Vec::new();
    let mut issues = Vec::new();

    // Count incoming/outgoing edges per node
    let mut incoming: HashMap<String, usize> = HashMap::new();
    let mut outgoing: HashMap<String, usize> = HashMap::new();

    for node in &graph.nodes {
        incoming.entry(node.id.clone()).or_insert(0);
        outgoing.entry(node.id.clone()).or_insert(0);
    }

    for edge in &graph.edges {
        *outgoing.entry(edge.source.clone()).or_insert(0) += 1;
        *incoming.entry(edge.target.clone()).or_insert(0) += 1;
    }

    // Find bottlenecks (nodes with many incoming edges)
    for node in &graph.nodes {
        let in_count = incoming.get(&node.id).unwrap_or(&0);
        let out_count = outgoing.get(&node.id).unwrap_or(&0);

        if *in_count >= 3 {
            bottlenecks.push(Bottleneck {
                node_id: node.id.clone(),
                node_label: node.label.clone(),
                incoming_count: *in_count,
                outgoing_count: *out_count,
                severity: if *in_count >= 5 {
                    "high".to_string()
                } else {
                    "medium".to_string()
                },
            });
        }
    }

    // Find dead ends (nodes with no outgoing edges that aren't phase/end nodes)
    for node in &graph.nodes {
        let out_count = outgoing.get(&node.id).unwrap_or(&0);
        if *out_count == 0 && !matches!(node.node_type, ProgressionNodeType::Phase) {
            dead_ends.push(node.id.clone());
        }
    }

    // Find unreachable nodes (no incoming edges, except the first node)
    let mut first_node = true;
    for node in &graph.nodes {
        let in_count = incoming.get(&node.id).unwrap_or(&0);
        if *in_count == 0 && !first_node {
            unreachable_nodes.push(node.id.clone());
        }
        first_node = false;
    }

    // Collect mod references
    let mut mods_used: Vec<String> = graph
        .nodes
        .iter()
        .flat_map(|n| n.mod_refs.clone())
        .collect();
    mods_used.sort();
    mods_used.dedup();

    // Collect phases
    let phases: Vec<String> = graph
        .nodes
        .iter()
        .filter(|n| matches!(n.node_type, ProgressionNodeType::Phase))
        .map(|n| n.label.clone())
        .collect();

    // Generate issues
    if !bottlenecks.is_empty() {
        issues.push(ProgressionIssue {
            severity: "warning".to_string(),
            message: format!("{} bottleneck(s) detected", bottlenecks.len()),
            node_id: None,
        });
    }

    if !dead_ends.is_empty() {
        issues.push(ProgressionIssue {
            severity: "warning".to_string(),
            message: format!("{} dead end(s) found", dead_ends.len()),
            node_id: None,
        });
    }

    if !unreachable_nodes.is_empty() {
        issues.push(ProgressionIssue {
            severity: "error".to_string(),
            message: format!("{} unreachable node(s)", unreachable_nodes.len()),
            node_id: None,
        });
    }

    if graph.nodes.len() > 100 {
        issues.push(ProgressionIssue {
            severity: "info".to_string(),
            message: "Large progression graph may impact performance".to_string(),
            node_id: None,
        });
    }

    let coverage_percent = if graph.nodes.is_empty() {
        0.0
    } else {
        (mods_used.len() as f64 / graph.nodes.len().max(1) as f64) * 100.0
    };

    ProgressionAnalysis {
        total_nodes: graph.nodes.len(),
        total_edges: graph.edges.len(),
        phases,
        bottlenecks,
        dead_ends,
        unreachable_nodes,
        coverage: ProgressionCoverage {
            mods_used: mods_used.clone(),
            mods_unused: Vec::new(),
            total_mods: mods_used.len(),
            coverage_percent,
        },
        issues,
    }
}

// ———— split-out submodules (s29: 876-line file → hub + 3 submodules) ————
mod categories;
mod category_map;
mod generation;

pub use categories::{categorize_by_name, get_mod_phase, ModCategory, ModPhase};
pub use category_map::get_known_mod_category;
pub use generation::auto_generate_progression;
