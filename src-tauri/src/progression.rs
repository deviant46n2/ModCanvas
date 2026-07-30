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

/// Mod categories for progression classification
#[derive(Debug, Clone, PartialEq)]
pub enum ModCategory {
    /// Core libraries and APIs
    Library,
    /// Performance and optimization
    Performance,
    /// Quality of life improvements
    QualityOfLife,
    /// Technology mods (Create, Mekanism, etc.)
    Technology,
    /// Magic mods (Botania, Ars Nouveau, etc.)
    Magic,
    /// Exploration and adventure (Biomes O' Plenty, dungeons)
    Exploration,
    /// Storage and organization
    Storage,
    /// Farming and agriculture
    Agriculture,
    /// Combat and weapons
    Combat,
    /// Building and decoration
    Building,
    /// Redstone and automation
    Automation,
    /// World generation
    WorldGen,
    /// Utility and helper mods
    Utility,
    /// Unknown or unclassified
    Unknown,
}

/// Mod progression phases
#[derive(Debug, Clone, PartialEq)]
pub enum ModPhase {
    Foundation,
    Early,
    Mid,
    Late,
}

impl ModPhase {
    pub fn phase_index(&self) -> usize {
        match self {
            ModPhase::Foundation => 0,
            ModPhase::Early => 1,
            ModPhase::Mid => 2,
            ModPhase::Late => 3,
        }
    }
}

/// Known mod categorizations (mod_id -> category)
pub fn get_known_mod_category(mod_id: &str) -> Option<ModCategory> {
    let mod_id_lower = mod_id.to_lowercase();

    // Libraries
    if mod_id_lower.contains("fabric-api")
        || mod_id_lower.contains("forge")
        || mod_id_lower.contains("neoforge")
        || mod_id_lower.contains("quilt")
        || mod_id_lower.contains("cloth-config")
        || mod_id_lower.contains("architectury")
        || mod_id_lower.contains("jetbrains-annotations")
        || mod_id_lower.contains("mixinextras")
    {
        return Some(ModCategory::Library);
    }

    // Performance
    if mod_id_lower.contains("sodium")
        || mod_id_lower.contains("lithium")
        || mod_id_lower.contains("phosphor")
        || mod_id_lower.contains("starlight")
        || mod_id_lower.contains("lazydfu")
        || mod_id_lower.contains("smoothboot")
        || mod_id_lower.contains("entityculling")
        || mod_id_lower.contains("modernfix")
        || mod_id_lower.contains("ferritecore")
        || mod_id_lower.contains("embeddium")
    {
        return Some(ModCategory::Performance);
    }

    // Quality of Life
    if mod_id_lower.contains("jei")
        || mod_id_lower.contains("rei")
        || mod_id_lower.contains("emi")
        || mod_id_lower.contains("roughlyenoughitems")
        || mod_id_lower.contains("wthit")
        || mod_id_lower.contains("jade")
        || mod_id_lower.contains("hwyla")
        || mod_id_lower.contains("justenoughresources")
        || mod_id_lower.contains("appleskin")
        || mod_id_lower.contains("inventory-profiles")
        || mod_id_lower.contains("shulkerboxtooltip")
        || mod_id_lower.contains("xercapaint")
        || mod_id_lower.contains("comforts")
        || mod_id_lower.contains("crafttweaker")
    {
        return Some(ModCategory::QualityOfLife);
    }

    // Technology
    if mod_id_lower.contains("create")
        || mod_id_lower.contains("mekanism")
        || mod_id_lower.contains("thermal")
        || mod_id_lower.contains("immersive")
        || mod_id_lower.contains("applied-energistics")
        || mod_id_lower.contains("ae2")
        || mod_id_lower.contains("refined-storage")
        || mod_id_lower.contains("ender-io")
        || mod_id_lower.contains("industrial-foregoing")
        || mod_id_lower.contains("endergetic")
        || mod_id_lower.contains("pneumaticcraft")
        || mod_id_lower.contains("mekanism")
        || mod_id_lower.contains("flux-networks")
        || mod_id_lower.contains("power")
    {
        return Some(ModCategory::Technology);
    }

    // Magic
    if mod_id_lower.contains("botania")
        || mod_id_lower.contains("ars-nouveau")
        || mod_id_lower.contains("ars")
        || mod_id_lower.contains("blood-magic")
        || mod_id_lower.contains("bloodmagic")
        || mod_id_lower.contains("thaumcraft")
        || mod_id_lower.contains("totemic")
        || mod_id_lower.contains("eidolon")
        || mod_id_lower.contains("occultism")
        || mod_id_lower.contains("irons-spells")
        || mod_id_lower.contains("spell")
        || mod_id_lower.contains("enchant")
    {
        return Some(ModCategory::Magic);
    }

    // Exploration
    if mod_id_lower.contains("biomes-o-plenty")
        || mod_id_lower.contains("terralith")
        || mod_id_lower.contains("dungeons")
        || mod_id_lower.contains("structures")
        || mod_id_lower.contains("towers")
        || mod_id_lower.contains("villages")
        || mod_id_lower.contains("travel")
        || mod_id_lower.contains("exploration")
        || mod_id_lower.contains("adventure")
        || mod_id_lower.contains("roguelike")
        || mod_id_lower.contains("stoneholm")
        || mod_id_lower.contains("paradise")
    {
        return Some(ModCategory::Exploration);
    }

    // Storage
    if mod_id_lower.contains("storage")
        || mod_id_lower.contains("sophisticated")
        || mod_id_lower.contains("compact-storage")
        || mod_id_lower.contains("storage-drawers")
        || mod_id_lower.contains("drawers")
        || mod_id_lower.contains("barrel")
        || mod_id_lower.contains("iron-chests")
        || mod_id_lower.contains("backpack")
    {
        return Some(ModCategory::Storage);
    }

    // Agriculture
    if mod_id_lower.contains("farm")
        || mod_id_lower.contains("crop")
        || mod_id_lower.contains("harvest")
        || mod_id_lower.contains("agriculture")
        || mod_id_lower.contains("croptopia")
        || mod_id_lower.contains("pam")
        || mod_id_lower.contains("cooking")
        || mod_id_lower.contains("delight")
    {
        return Some(ModCategory::Agriculture);
    }

    // Combat
    if mod_id_lower.contains("weapon")
        || mod_id_lower.contains("combat")
        || mod_id_lower.contains("sword")
        || mod_id_lower.contains("shield")
        || mod_id_lower.contains("armor")
        || mod_id_lower.contains("tough-as-nails")
        || mod_id_lower.contains("spartan")
        || mod_id_lower.contains("parry")
    {
        return Some(ModCategory::Combat);
    }

    // Building
    if mod_id_lower.contains("building")
        || mod_id_lower.contains("decoration")
        || mod_id_lower.contains("furniture")
        || mod_id_lower.contains("chisel")
        || mod_id_lower.contains("bits")
        || mod_id_lower.contains("macaw")
        || mod_id_lower.contains("every-compat")
    {
        return Some(ModCategory::Building);
    }

    // Automation
    if mod_id_lower.contains("redstone")
        || mod_id_lower.contains("automation")
        || mod_id_lower.contains("pipe")
        || mod_id_lower.contains("conduit")
        || mod_id_lower.contains("cable")
        || mod_id_lower.contains("transport")
    {
        return Some(ModCategory::Automation);
    }

    // World Gen
    if mod_id_lower.contains("world-gen")
        || mod_id_lower.contains("worldgen")
        || mod_id_lower.contains("ores")
        || mod_id_lower.contains("generation")
    {
        return Some(ModCategory::WorldGen);
    }

    None
}

/// Determine the phase for a mod based on its category
pub fn get_mod_phase(category: &ModCategory, mod_name: &str) -> ModPhase {
    let name_lower = mod_name.to_lowercase();

    match category {
        ModCategory::Library | ModCategory::Performance => ModPhase::Foundation,
        ModCategory::QualityOfLife | ModCategory::Utility => ModPhase::Early,
        ModCategory::Agriculture | ModCategory::Building => ModPhase::Early,
        ModCategory::Storage => ModPhase::Early,
        ModCategory::Exploration | ModCategory::WorldGen => ModPhase::Mid,
        ModCategory::Technology => {
            if name_lower.contains("create") || name_lower.contains("simple") {
                ModPhase::Early
            } else if name_lower.contains("mekanism") || name_lower.contains("thermal") {
                ModPhase::Mid
            } else {
                ModPhase::Late
            }
        }
        ModCategory::Magic => {
            if name_lower.contains("botania") {
                ModPhase::Early
            } else if name_lower.contains("ars") {
                ModPhase::Mid
            } else {
                ModPhase::Late
            }
        }
        ModCategory::Automation => ModPhase::Mid,
        ModCategory::Combat => ModPhase::Late,
        ModCategory::Unknown => ModPhase::Mid,
    }
}

/// Categorize a mod by its name using heuristics
pub fn categorize_by_name(name: &str) -> ModCategory {
    let name_lower = name.to_lowercase();

    if name_lower.contains("lib")
        || name_lower.contains("api")
        || name_lower.contains("core")
        || name_lower.contains("compat")
    {
        ModCategory::Library
    } else if name_lower.contains("optim")
        || name_lower.contains("fast")
        || name_lower.contains("perf")
        || name_lower.contains("fps")
    {
        ModCategory::Performance
    } else if name_lower.contains("tech")
        || name_lower.contains("machine")
        || name_lower.contains("energy")
        || name_lower.contains("electric")
        || name_lower.contains("factory")
    {
        ModCategory::Technology
    } else if name_lower.contains("magic")
        || name_lower.contains("spell")
        || name_lower.contains("ritual")
        || name_lower.contains("arcane")
        || name_lower.contains("mystic")
    {
        ModCategory::Magic
    } else if name_lower.contains("dungeon")
        || name_lower.contains("adventure")
        || name_lower.contains("explore")
        || name_lower.contains("biome")
        || name_lower.contains("terrain")
    {
        ModCategory::Exploration
    } else if name_lower.contains("storage")
        || name_lower.contains("chest")
        || name_lower.contains("inventory")
    {
        ModCategory::Storage
    } else if name_lower.contains("farm")
        || name_lower.contains("crop")
        || name_lower.contains("food")
        || name_lower.contains("cook")
    {
        ModCategory::Agriculture
    } else if name_lower.contains("weapon")
        || name_lower.contains("armor")
        || name_lower.contains("combat")
        || name_lower.contains("fight")
    {
        ModCategory::Combat
    } else if name_lower.contains("build")
        || name_lower.contains("deco")
        || name_lower.contains("furniture")
        || name_lower.contains("aesthetic")
    {
        ModCategory::Building
    } else {
        ModCategory::Unknown
    }
}

/// A chain of related mods that form a progression path
struct ProgressionChain {
    _name: String,
    nodes: Vec<ChainNode>,
}

struct ChainNode {
    label: String,
    description: String,
    node_type: ProgressionNodeType,
    mod_refs: Vec<String>,
}

/// Auto-generate a progression graph from a list of mods
pub fn auto_generate_progression(
    project_id: &str,
    mods: &[(String, String, String)], // (mod_id, slug, mod_name)
) -> ProgressionGraph {
    let mut graph = ProgressionGraph::new(project_id, "Auto-Generated Progression");

    // Build sets for quick lookup — slugs are used for matching, mod_ids for refs
    let slugs: std::collections::HashSet<String> = mods.iter().map(|(_, slug, _)| slug.to_lowercase()).collect();

    // Categorize all mods using slugs (which match known names)
    let mut categorized: Vec<(String, String, String, ModCategory, ModPhase)> = mods
        .iter()
        .map(|(mod_id, slug, mod_name)| {
            let category = get_known_mod_category(slug)
                .unwrap_or_else(|| categorize_by_name(mod_name));
            let phase = get_mod_phase(&category, mod_name);
            (mod_id.clone(), slug.clone(), mod_name.clone(), category, phase)
        })
        .collect();

    // Sort by phase
    categorized.sort_by_key(|(_, _, _, _, phase)| phase.phase_index());

    // === Build actual mod chains based on known relationships ===
    let mut chains: Vec<ProgressionChain> = Vec::new();

    // Tech chain: Create -> Mechanical/Mekanism -> AE2/RS -> Endgame
    if slugs.contains("create") {
        let mut chain = ProgressionChain {
            _name: "Technology Path".to_string(),
            nodes: vec![],
        };
        chain.nodes.push(ChainNode {
            label: "Create".to_string(),
            description: "Mechanical power and automation".to_string(),
            node_type: ProgressionNodeType::ContentIntroduction,
            mod_refs: mods.iter().filter(|(_, slug, _)| slug == "create").map(|(id, _, _)| id.clone()).collect(),
        });
        if slugs.iter().any(|s| s.contains("mekanism")) {
            chain.nodes.push(ChainNode {
                label: "Mekanism".to_string(),
                description: "Advanced machines and ore processing".to_string(),
                node_type: ProgressionNodeType::ContentIntroduction,
                mod_refs: mods.iter().filter(|(_, slug, _)| slug.contains("mekanism")).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("applied-energistics") || s.contains("ae2")) {
            chain.nodes.push(ChainNode {
                label: "AE2".to_string(),
                description: "Digital storage and autocrafting".to_string(),
                node_type: ProgressionNodeType::Milestone,
                mod_refs: mods.iter().filter(|(_, slug, _)| {
                    slug.contains("applied-energistics") || slug.contains("ae2")
                }).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("refined-storage")) {
            chain.nodes.push(ChainNode {
                label: "Refined Storage".to_string(),
                description: "Simpler digital storage".to_string(),
                node_type: ProgressionNodeType::Milestone,
                mod_refs: mods.iter().filter(|(_, slug, _)| slug.contains("refined-storage")).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        chains.push(chain);
    }

    // Magic chain: Botania -> Ars Nouveau -> Blood Magic
    if slugs.iter().any(|s| s.contains("botania") || s.contains("ars")) {
        let mut chain = ProgressionChain {
            _name: "Magic Path".to_string(),
            nodes: vec![],
        };
        if slugs.iter().any(|s| s.contains("botania")) {
            chain.nodes.push(ChainNode {
                label: "Botania".to_string(),
                description: "Nature magic and mana generation".to_string(),
                node_type: ProgressionNodeType::ContentIntroduction,
                mod_refs: mods.iter().filter(|(_, slug, _)| slug.contains("botania")).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("ars")) {
            chain.nodes.push(ChainNode {
                label: "Ars Nouveau".to_string(),
                description: "Spell crafting and rituals".to_string(),
                node_type: ProgressionNodeType::ContentIntroduction,
                mod_refs: mods.iter().filter(|(_, slug, _)| slug.contains("ars")).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("blood") || s.contains("occultism")) {
            chain.nodes.push(ChainNode {
                label: "Blood Magic / Occultism".to_string(),
                description: "Dark rituals and demonology".to_string(),
                node_type: ProgressionNodeType::Milestone,
                mod_refs: mods.iter().filter(|(_, slug, _)| {
                    slug.contains("blood") || slug.contains("occultism")
                }).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        chains.push(chain);
    }

    // Exploration chain
    if slugs.iter().any(|s| s.contains("biomes") || s.contains("terralith") || s.contains("dungeon")) {
        let mut chain = ProgressionChain {
            _name: "Exploration Path".to_string(),
            nodes: vec![],
        };
        if slugs.iter().any(|s| s.contains("biomes") || s.contains("terralith")) {
            chain.nodes.push(ChainNode {
                label: "World Generation".to_string(),
                description: "New biomes and terrain".to_string(),
                node_type: ProgressionNodeType::ContentIntroduction,
                mod_refs: mods.iter().filter(|(_, slug, _)| {
                    slug.contains("biomes") || slug.contains("terralith")
                }).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        if slugs.iter().any(|s| s.contains("dungeon") || s.contains("roguelike")) {
            chain.nodes.push(ChainNode {
                label: "Dungeons & Structures".to_string(),
                description: "Combat challenges and loot".to_string(),
                node_type: ProgressionNodeType::Milestone,
                mod_refs: mods.iter().filter(|(_, slug, _)| {
                    slug.contains("dungeon") || slug.contains("roguelike") || slug.contains("structure")
                }).map(|(id, _, _)| id.clone()).collect(),
            });
        }
        chains.push(chain);
    }

    // === Build the graph from chains ===

    // Create a "Start" node
    let start_node = ProgressionNode {
        id: Uuid::new_v4().to_string(),
        node_type: ProgressionNodeType::Phase,
        label: "Start Here".to_string(),
        description: "Basic resources and setup".to_string(),
        position: Position { x: 400.0, y: 0.0 },
        data: HashMap::new(),
        mod_refs: Vec::new(),
        item_refs: Vec::new(),
    };
    graph.nodes.push(start_node.clone());

    // Add QoL/Foundation mods to start node
    let foundation_mods: Vec<String> = categorized.iter()
        .filter(|(_, _, _, cat, phase)| matches!(cat, ModCategory::Library | ModCategory::Performance | ModCategory::QualityOfLife) && matches!(phase, ModPhase::Foundation | ModPhase::Early))
        .map(|(id, _, _, _, _)| id.clone())
        .collect();

    if !foundation_mods.is_empty() {
        let foundation_node = ProgressionNode {
            id: Uuid::new_v4().to_string(),
            node_type: ProgressionNodeType::Milestone,
            label: "Core Setup".to_string(),
            description: format!("{} mods", foundation_mods.len()),
            position: Position { x: 100.0, y: 100.0 },
            data: HashMap::new(),
            mod_refs: foundation_mods,
            item_refs: Vec::new(),
        };
        graph.edges.push(ProgressionEdge {
            id: Uuid::new_v4().to_string(),
            source: start_node.id.clone(),
            target: foundation_node.id.clone(),
            label: None,
            edge_type: EdgeType::Prerequisite,
        });
        graph.nodes.push(foundation_node);
    }

    // Create chain nodes
    let mut chain_x_offset = 0.0;
    let chain_start_y = 300.0;

    for chain in &chains {
        let mut prev_node_id = start_node.id.clone();
        let mut chain_y = chain_start_y;

        for chain_node in &chain.nodes {
            let node = ProgressionNode {
                id: Uuid::new_v4().to_string(),
                node_type: chain_node.node_type.clone(),
                label: chain_node.label.clone(),
                description: chain_node.description.clone(),
                position: Position {
                    x: 150.0 + chain_x_offset,
                    y: chain_y,
                },
                data: HashMap::new(),
                mod_refs: chain_node.mod_refs.clone(),
                item_refs: Vec::new(),
            };

            // Connect to previous node in chain
            graph.edges.push(ProgressionEdge {
                id: Uuid::new_v4().to_string(),
                source: prev_node_id.clone(),
                target: node.id.clone(),
                label: None,
                edge_type: EdgeType::Prerequisite,
            });

            prev_node_id = node.id.clone();
            graph.nodes.push(node);
            chain_y += 150.0;
        }

        chain_x_offset += 250.0;
    }

    // Add remaining mods as content nodes grouped by category
    let mut remaining: Vec<&(String, String, String, ModCategory, ModPhase)> = categorized.iter()
        .filter(|(_, _, _, cat, _)| !matches!(cat, ModCategory::Library | ModCategory::Performance | ModCategory::QualityOfLife))
        .collect();

    // Group remaining by category
    let mut cat_groups: HashMap<String, Vec<&(String, String, String, ModCategory, ModPhase)>> = HashMap::new();
    for item in remaining.drain(..) {
        let cat = format!("{:?}", item.3);
        cat_groups.entry(cat).or_default().push(item);
    }

    let mut cat_x = chain_x_offset + 100.0;
    for (cat_name, mods_in_cat) in &cat_groups {
        if mods_in_cat.is_empty() { continue; }

        // Create a category group node
        let group_node = ProgressionNode {
            id: Uuid::new_v4().to_string(),
            node_type: ProgressionNodeType::Milestone,
            label: format!("{} ({})", cat_name, mods_in_cat.len()),
            description: format!("{} mods", mods_in_cat.len()),
            position: Position {
                x: cat_x,
                y: 100.0,
            },
            data: HashMap::new(),
            mod_refs: mods_in_cat.iter().map(|(id, _, _, _, _)| id.clone()).collect(),
            item_refs: Vec::new(),
        };

        graph.edges.push(ProgressionEdge {
            id: Uuid::new_v4().to_string(),
            source: start_node.id.clone(),
            target: group_node.id.clone(),
            label: None,
            edge_type: EdgeType::Optional,
        });

        graph.nodes.push(group_node);
        cat_x += 200.0;
    }

        eprintln!(
            "[ModCanvas] Auto-generated progression: {} nodes, {} edges for {} mods",
            graph.nodes.len(),
            graph.edges.len(),
            mods.len()
        );

        // Populate mod_names map so frontend can resolve IDs to display names
        for (mod_id, _slug, mod_name) in mods {
graph.mod_names.insert(mod_id.clone(), mod_name.clone());
        }

        graph
}
