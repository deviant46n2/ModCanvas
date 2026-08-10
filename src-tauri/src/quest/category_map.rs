use crate::quest::categories::ModCategory;

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
