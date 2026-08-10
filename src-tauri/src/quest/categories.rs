/// Mod categories for quest analysis
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

/// Mod phases (early/mid/late) for quest analysis
#[derive(Debug, Clone, PartialEq)]
pub enum ModPhase {    Foundation,
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
