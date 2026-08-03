// Curated vanilla Minecraft progression template, grounded in the vanilla
// advancement tree (Minecraft / Nether / The End / Adventure / Husbandry tabs).
// Pure data — no I/O, no UI. Demonstrates the Progression screen with a
// faithful, detailed vanilla journey from punching wood to killing the Wither.

import type {
  ProgressionGraphData,
  ProgressionNodeData,
  ProgressionEdgeData,
} from '../../services/progression-types'

export const VANILLA_TEMPLATE_ID = 'template_vanilla'

export const VANILLA_PHASES = [
  'The Story',
  'The Nether',
  'The End',
  'Adventure',
  'Husbandry',
]

interface TemplateNode {
  id: string
  type: ProgressionNodeData['node_type']
  label: string
  description: string
  phase: string
  icon?: string
  item_refs?: string[]
}

interface TemplateEdge {
  from: string
  to: string
  label?: string
}

// ─── The Story (Minecraft tab): the core gear/dimension chain ───────────────
const NODES: TemplateNode[] = [
  // Story root → wood → stone
  { id: 's_root', type: 'milestone', label: 'The Story Begins', description: 'Open your inventory and craft your first crafting table.', phase: 'The Story', icon: 'minecraft:crafting_table', item_refs: ['minecraft:crafting_table'] },
  { id: 's_wood', type: 'achievement', label: 'Getting Wood', description: 'Punch trees for logs, then craft planks and sticks.', phase: 'The Story', icon: 'minecraft:oak_log', item_refs: ['minecraft:oak_log', 'minecraft:oak_planks'] },
  { id: 's_stone_age', type: 'achievement', label: 'Stone Age', description: 'Mine stone (cobblestone, blackstone, or cobbled deepslate) with a wooden pickaxe.', phase: 'The Story', icon: 'minecraft:wooden_pickaxe', item_refs: ['minecraft:cobblestone', 'minecraft:wooden_pickaxe'] },
  { id: 's_upgrade', type: 'achievement', label: 'Getting an Upgrade', description: 'Construct a stone pickaxe to mine deeper and faster.', phase: 'The Story', icon: 'minecraft:stone_pickaxe', item_refs: ['minecraft:stone_pickaxe'] },
  { id: 's_food', type: 'achievement', label: 'A Seedy Place', description: 'Plant and grow your first crop to secure a food supply.', phase: 'The Story', icon: 'minecraft:wheat', item_refs: ['minecraft:wheat_seeds', 'minecraft:wheat'] },
  { id: 's_sleep', type: 'achievement', label: 'Sweet Dreams', description: 'Craft a bed to skip the night and set your spawn point.', phase: 'The Story', icon: 'minecraft:red_bed', item_refs: ['minecraft:red_bed'] },

  // Iron tier
  { id: 's_iron', type: 'milestone', label: 'Acquire Hardware', description: 'Smelt your first iron ingot — the foundation of mid-game gear.', phase: 'The Story', icon: 'minecraft:iron_ingot', item_refs: ['minecraft:iron_ingot', 'minecraft:raw_iron'] },
  { id: 's_iron_pick', type: 'achievement', label: 'Iron Pickaxe', description: 'Upgrade to an iron pickaxe to mine diamonds and redstone.', phase: 'The Story', icon: 'minecraft:iron_pickaxe', item_refs: ['minecraft:iron_pickaxe'] },
  { id: 's_suit_up', type: 'achievement', label: 'Suit Up', description: 'Protect yourself with iron armor.', phase: 'The Story', icon: 'minecraft:iron_chestplate', item_refs: ['minecraft:iron_chestplate', 'minecraft:iron_helmet'] },
  { id: 's_shield', type: 'achievement', label: 'Not Today, Thank You', description: 'Craft a shield and deflect a projectile to block incoming damage.', phase: 'The Story', icon: 'minecraft:shield', item_refs: ['minecraft:shield'] },
  { id: 's_hot_stuff', type: 'achievement', label: 'Hot Stuff', description: 'Fill a bucket with lava — needed to make obsidian.', phase: 'The Story', icon: 'minecraft:lava_bucket', item_refs: ['minecraft:lava_bucket', 'minecraft:bucket'] },

  // Diamond tier
  { id: 's_diamonds', type: 'milestone', label: 'Diamonds!', description: 'Mine your first diamond deep underground (Y -59).', phase: 'The Story', icon: 'minecraft:diamond', item_refs: ['minecraft:diamond'] },
  { id: 's_obsidian', type: 'achievement', label: 'Ice Bucket Challenge', description: 'Pour water on lava to obtain obsidian.', phase: 'The Story', icon: 'minecraft:obsidian', item_refs: ['minecraft:obsidian'] },
  { id: 's_enchanter', type: 'achievement', label: 'Enchanter', description: 'Craft an enchanting table and enchant an item using lapis and bookshelves.', phase: 'The Story', icon: 'minecraft:enchanted_book', item_refs: ['minecraft:enchanting_table', 'minecraft:enchanted_book', 'minecraft:lapis_lazuli'] },
  { id: 's_diamond_armor', type: 'achievement', label: 'Cover Me with Diamonds', description: 'Craft a full set of diamond armor for the Nether.', phase: 'The Story', icon: 'minecraft:diamond_chestplate', item_refs: ['minecraft:diamond_chestplate'] },
  { id: 's_portal', type: 'milestone', label: 'We Need to Go Deeper', description: 'Build, light, and enter a Nether portal with flint and steel.', phase: 'The Story', icon: 'minecraft:flint_and_steel', item_refs: ['minecraft:flint_and_steel', 'minecraft:obsidian'] },
  { id: 's_eye_spy', type: 'achievement', label: 'Eye Spy', description: 'Combine blaze powder and ender pearls to make eyes of ender, then follow them to a stronghold.', phase: 'The Story', icon: 'minecraft:ender_eye', item_refs: ['minecraft:ender_eye'] },
  { id: 's_cure_villager', type: 'achievement', label: 'Zombie Doctor', description: 'Weaken a zombie villager, then cure it with a golden apple — cheap villager trades.', phase: 'The Story', icon: 'minecraft:golden_apple', item_refs: ['minecraft:golden_apple', 'minecraft:splash_potion'] },
  { id: 's_end_portal', type: 'milestone', label: 'The End?', description: 'Enter the End portal found beneath the stronghold.', phase: 'The Story', icon: 'minecraft:end_stone', item_refs: ['minecraft:end_portal_frame'] },
]

// ─── The Nether (Nether tab) ───────────────────────────────────────────────
const NETHER: TemplateNode[] = [
  { id: 'n_root', type: 'milestone', label: 'Enter the Nether', description: 'Step through the portal into a hostile dimension — bring fire resistance.', phase: 'The Nether', icon: 'minecraft:red_nether_bricks', item_refs: ['minecraft:netherrack', 'minecraft:red_nether_bricks'] },
  { id: 'n_fortress', type: 'achievement', label: 'A Terrible Fortress', description: 'Locate a Nether Fortress — home to blazes and wither skeletons.', phase: 'The Nether', icon: 'minecraft:nether_bricks', item_refs: ['minecraft:nether_bricks'] },
  { id: 'n_blaze', type: 'achievement', label: 'Into Fire', description: 'Defeat blazes to collect blaze rods — fuel for brewing and eyes of ender.', phase: 'The Nether', icon: 'minecraft:blaze_rod', item_refs: ['minecraft:blaze_rod'] },
  { id: 'n_wither_skull', type: 'achievement', label: 'Spooky Scary Skeleton', description: 'Kill wither skeletons to obtain a wither skeleton skull.', phase: 'The Nether', icon: 'minecraft:wither_skeleton_skull', item_refs: ['minecraft:wither_skeleton_skull'] },
  { id: 'n_ghast', type: 'achievement', label: 'Return to Sender', description: 'Deflect a ghast fireball back to destroy it.', phase: 'The Nether', icon: 'minecraft:fire_charge', item_refs: ['minecraft:fire_charge', 'minecraft:ghast_tear'] },
  { id: 'n_bastion', type: 'achievement', label: 'Those Were the Days', description: 'Enter a Bastion Remnant for gold, gear, and piglin bartering.', phase: 'The Nether', icon: 'minecraft:polished_blackstone_bricks', item_refs: ['minecraft:polished_blackstone_bricks'] },
  { id: 'n_ancient_debris', type: 'achievement', label: 'Hidden in the Depths', description: 'Mine ancient debris at the Nether bedrock ceiling (Y 15 or lower).', phase: 'The Nether', icon: 'minecraft:ancient_debris', item_refs: ['minecraft:ancient_debris'] },
  { id: 'n_netherite', type: 'milestone', label: 'Cover Me in Debris', description: 'Smelt debris into netherite scraps and upgrade diamond gear to netherite.', phase: 'The Nether', icon: 'minecraft:netherite_ingot', item_refs: ['minecraft:netherite_ingot', 'minecraft:netherite_scrap', 'minecraft:smithing_table'] },
  { id: 'n_brewing', type: 'achievement', label: 'Local Brewery', description: 'Brew potions using a brewing stand, nether wart, and blaze powder.', phase: 'The Nether', icon: 'minecraft:brewing_stand', item_refs: ['minecraft:brewing_stand', 'minecraft:nether_wart', 'minecraft:blaze_powder'] },
  { id: 'n_crying_obsidian', type: 'achievement', label: 'Who is Cutting Onions?', description: 'Obtain crying obsidian from ruined portals or piglin bartering.', phase: 'The Nether', icon: 'minecraft:crying_obsidian', item_refs: ['minecraft:crying_obsidian'] },
  { id: 'n_respawn_anchor', type: 'achievement', label: 'Not Quite Nine Lives', description: 'Charge a respawn anchor to the maximum with glowstone to respawn in the Nether.', phase: 'The Nether', icon: 'minecraft:respawn_anchor', item_refs: ['minecraft:respawn_anchor', 'minecraft:glowstone'] },
  { id: 'n_wither', type: 'milestone', label: 'Withering Heights', description: 'Summon the Wither with three skulls and soul sand, then defeat it for a nether star.', phase: 'The Nether', icon: 'minecraft:nether_star', item_refs: ['minecraft:nether_star', 'minecraft:soul_sand'] },
  { id: 'n_beacon', type: 'achievement', label: 'Bring Home the Beacon', description: 'Build a beacon pyramid and place a beacon for status effects.', phase: 'The Nether', icon: 'minecraft:beacon', item_refs: ['minecraft:beacon', 'minecraft:nether_star'] },
]

// ─── The End (The End tab) ─────────────────────────────────────────────────
const END: TemplateNode[] = [
  { id: 'e_root', type: 'milestone', label: 'The End', description: 'Arrive on the obsidian platform in the End dimension.', phase: 'The End', icon: 'minecraft:end_stone', item_refs: ['minecraft:end_stone'] },
  { id: 'e_crystals', type: 'achievement', label: 'Destroy the Crystals', description: 'Break the end crystals atop obsidian pillars to stop the dragon healing.', phase: 'The End', icon: 'minecraft:end_crystal', item_refs: ['minecraft:end_crystal'] },
  { id: 'e_dragon', type: 'milestone', label: 'Free the End', description: 'Slay the Ender Dragon to unlock the exit portal.', phase: 'The End', icon: 'minecraft:dragon_head', item_refs: ['minecraft:dragon_head'] },
  { id: 'e_egg', type: 'achievement', label: 'The Next Generation', description: 'Claim the dragon egg — a decorative trophy for your base.', phase: 'The End', icon: 'minecraft:dragon_egg', item_refs: ['minecraft:dragon_egg'] },
  { id: 'e_breath', type: 'achievement', label: 'You Need a Mint', description: 'Collect dragons breath in a glass bottle before the fight ends.', phase: 'The End', icon: 'minecraft:dragon_breath', item_refs: ['minecraft:dragon_breath', 'minecraft:glass_bottle'] },
  { id: 'e_rematch', type: 'achievement', label: 'The End... Again...', description: 'Respawn the Ender Dragon with end crystals to farm the End.', phase: 'The End', icon: 'minecraft:end_crystal', item_refs: ['minecraft:end_crystal'] },
  { id: 'e_city', type: 'milestone', label: 'The City at the End of the Game', description: 'Cross the void with an end gateway to reach an End City.', phase: 'The End', icon: 'minecraft:purpur_block', item_refs: ['minecraft:purpur_block'] },
  { id: 'e_elytra', type: 'achievement', label: 'Skys the Limit', description: 'Find an elytra in an End Ship — your wings for flight.', phase: 'The End', icon: 'minecraft:elytra', item_refs: ['minecraft:elytra'] },
  { id: 'e_shulker', type: 'achievement', label: 'Great View From Up Here', description: 'Collect shulker shells to craft portable shulker boxes.', phase: 'The End', icon: 'minecraft:shulker_shell', item_refs: ['minecraft:shulker_shell', 'minecraft:shulker_box'] },
]

// ─── Adventure (Adventure tab): combat & exploration ───────────────────────
const ADVENTURE: TemplateNode[] = [
  { id: 'a_root', type: 'milestone', label: 'Adventure', description: 'Explore, fight, and survive the world beyond your base.', phase: 'Adventure', icon: 'minecraft:map', item_refs: ['minecraft:map'] },
  { id: 'a_hunt', type: 'achievement', label: 'Monster Hunter', description: 'Kill any hostile monster to begin your combat journey.', phase: 'Adventure', icon: 'minecraft:iron_sword', item_refs: ['minecraft:iron_sword'] },
  { id: 'a_bow', type: 'achievement', label: 'Take Aim', description: 'Shoot something with a bow and arrow.', phase: 'Adventure', icon: 'minecraft:bow', item_refs: ['minecraft:bow', 'minecraft:arrow'] },
  { id: 'a_crossbow', type: 'achievement', label: 'Ol Betsy', description: 'Craft and fire a crossbow for rapid, powerful shots.', phase: 'Adventure', icon: 'minecraft:crossbow', item_refs: ['minecraft:crossbow'] },
  { id: 'a_trade', type: 'achievement', label: 'What a Deal!', description: 'Trade with a villager to turn resources into emeralds.', phase: 'Adventure', icon: 'minecraft:emerald', item_refs: ['minecraft:emerald'] },
  { id: 'a_iron_golem', type: 'achievement', label: 'Hired Help', description: 'Summon an iron golem to defend a village.', phase: 'Adventure', icon: 'minecraft:carved_pumpkin', item_refs: ['minecraft:iron_block', 'minecraft:carved_pumpkin'] },
  { id: 'a_raid', type: 'achievement', label: 'Hero of the Village', description: 'Defeat a raid captain and survive a full village raid.', phase: 'Adventure', icon: 'minecraft:white_banner', item_refs: ['minecraft:white_banner'] },
  { id: 'a_trial', type: 'milestone', label: 'Minecraft: Trial(s) Edition', description: 'Step into a trial chamber beneath the surface for trial keys and rewards.', phase: 'Adventure', icon: 'minecraft:chiseled_tuff', item_refs: ['minecraft:chiseled_tuff'] },
  { id: 'a_trial_key', type: 'achievement', label: 'Under Lock and Key', description: 'Defeat trial spawners to earn a trial key and open a vault.', phase: 'Adventure', icon: 'minecraft:trial_key', item_refs: ['minecraft:trial_key'] },
  { id: 'a_mace', type: 'achievement', label: 'Over-Overkill', description: 'Craft a mace and deal 50 hearts of damage with a wind-charge smash.', phase: 'Adventure', icon: 'minecraft:mace', item_refs: ['minecraft:mace', 'minecraft:wind_charge'] },
  { id: 'a_biomes', type: 'achievement', label: 'Adventuring Time', description: 'Travel to every biome in the game.', phase: 'Adventure', icon: 'minecraft:diamond_boots', item_refs: ['minecraft:diamond_boots'] },
]

// ─── Husbandry (Husbandry tab): farming, breeding, and friends ─────────────
const HUSBANDRY: TemplateNode[] = [
  { id: 'h_root', type: 'milestone', label: 'Husbandry', description: 'Farm the land, breed animals, and befriend the world.', phase: 'Husbandry', icon: 'minecraft:hay_block', item_refs: ['minecraft:hay_block'] },
  { id: 'h_farm', type: 'achievement', label: 'The Parrots and the Bats', description: 'Breed two animals together to grow your farm.', phase: 'Husbandry', icon: 'minecraft:wheat', item_refs: ['minecraft:wheat'] },
  { id: 'h_tame', type: 'achievement', label: 'Best Friends Forever', description: 'Tame an animal — a wolf, cat, or horse.', phase: 'Husbandry', icon: 'minecraft:lead', item_refs: ['minecraft:lead', 'minecraft:bone'] },
  { id: 'h_all', type: 'achievement', label: 'Two by Two', description: 'Breed every kind of animal for a sustainable farm.', phase: 'Husbandry', icon: 'minecraft:golden_carrot', item_refs: ['minecraft:golden_carrot'] },
  { id: 'h_fish', type: 'achievement', label: 'Fishy Business', description: 'Catch a fish to feed yourself and breed cats.', phase: 'Husbandry', icon: 'minecraft:fishing_rod', item_refs: ['minecraft:fishing_rod'] },
  { id: 'h_axolotl', type: 'achievement', label: 'The Cutest Predator', description: 'Catch an axolotl and team up to win an underwater fight.', phase: 'Husbandry', icon: 'minecraft:axolotl_bucket', item_refs: ['minecraft:axolotl_bucket'] },
  { id: 'h_bee', type: 'achievement', label: 'Bee Our Guest', description: 'Collect honey safely from a bee nest using a campfire.', phase: 'Husbandry', icon: 'minecraft:honey_bottle', item_refs: ['minecraft:honey_bottle'] },
  { id: 'h_sniffer', type: 'achievement', label: 'Smells Interesting', description: 'Obtain a sniffer egg from a warm ocean ruin and hatch it.', phase: 'Husbandry', icon: 'minecraft:sniffer_egg', item_refs: ['minecraft:sniffer_egg'] },
  { id: 'h_diet', type: 'achievement', label: 'A Balanced Diet', description: 'Eat every kind of food in the game.', phase: 'Husbandry', icon: 'minecraft:apple', item_refs: ['minecraft:apple', 'minecraft:golden_carrot'] },
]

const ALL_NODES: TemplateNode[] = [
  ...NODES,
  ...NETHER,
  ...END,
  ...ADVENTURE,
  ...HUSBANDRY,
]

// Prerequisite edges within and across the phases.
const EDGES: TemplateEdge[] = [
  // Story chain
  { from: 's_root', to: 's_wood' },
  { from: 's_wood', to: 's_stone_age' },
  { from: 's_stone_age', to: 's_upgrade' },
  { from: 's_upgrade', to: 's_food' },
  { from: 's_upgrade', to: 's_sleep' },
  { from: 's_upgrade', to: 's_iron' },
  { from: 's_food', to: 's_sleep' },
  { from: 's_iron', to: 's_iron_pick' },
  { from: 's_iron', to: 's_suit_up' },
  { from: 's_suit_up', to: 's_shield' },
  { from: 's_iron', to: 's_hot_stuff' },
  { from: 's_iron_pick', to: 's_diamonds' },
  { from: 's_hot_stuff', to: 's_obsidian' },
  { from: 's_diamonds', to: 's_enchanter' },
  { from: 's_diamonds', to: 's_diamond_armor' },
  { from: 's_obsidian', to: 's_portal' },
  { from: 's_diamond_armor', to: 's_portal' },
  { from: 's_portal', to: 's_eye_spy' },
  { from: 's_portal', to: 's_cure_villager' },
  { from: 's_eye_spy', to: 's_end_portal' },
  { from: 's_end_portal', to: 'e_root' },

  // Nether chain
  { from: 's_portal', to: 'n_root' },
  { from: 'n_root', to: 'n_fortress' },
  { from: 'n_root', to: 'n_ghast' },
  { from: 'n_root', to: 'n_bastion' },
  { from: 'n_root', to: 'n_ancient_debris' },
  { from: 'n_fortress', to: 'n_blaze' },
  { from: 'n_fortress', to: 'n_wither_skull' },
  { from: 'n_blaze', to: 'n_brewing' },
  { from: 'n_wither_skull', to: 'n_wither' },
  { from: 'n_ancient_debris', to: 'n_netherite' },
  { from: 'n_bastion', to: 'n_crying_obsidian' },
  { from: 'n_crying_obsidian', to: 'n_respawn_anchor' },
  { from: 'n_wither', to: 'n_beacon' },
  { from: 'n_blaze', to: 's_eye_spy' },

  // The End chain
  { from: 'e_root', to: 'e_crystals' },
  { from: 'e_crystals', to: 'e_dragon' },
  { from: 'e_dragon', to: 'e_egg' },
  { from: 'e_dragon', to: 'e_breath' },
  { from: 'e_dragon', to: 'e_rematch' },
  { from: 'e_dragon', to: 'e_city' },
  { from: 'e_city', to: 'e_elytra' },
  { from: 'e_city', to: 'e_shulker' },

  // Adventure chain
  { from: 's_suit_up', to: 'a_root' },
  { from: 'a_root', to: 'a_hunt' },
  { from: 'a_hunt', to: 'a_bow' },
  { from: 'a_bow', to: 'a_crossbow' },
  { from: 'a_root', to: 'a_trade' },
  { from: 'a_trade', to: 'a_iron_golem' },
  { from: 'a_root', to: 'a_trial' },
  { from: 'a_trial', to: 'a_trial_key' },
  { from: 'a_trial', to: 'a_mace' },
  { from: 'a_iron_golem', to: 'a_raid' },
  { from: 's_diamonds', to: 'a_biomes' },

  // Husbandry chain
  { from: 's_food', to: 'h_root' },
  { from: 'h_root', to: 'h_farm' },
  { from: 'h_farm', to: 'h_tame' },
  { from: 'h_farm', to: 'h_fish' },
  { from: 'h_tame', to: 'h_all' },
  { from: 'h_fish', to: 'h_axolotl' },
  { from: 'h_root', to: 'h_bee' },
  { from: 'h_root', to: 'h_sniffer' },
  { from: 'h_farm', to: 'h_diet' },
]

/** X positions per phase so the five tabs lay out left-to-right. */
const PHASE_X: Record<string, number> = {
  'The Story': 0,
  'The Nether': 520,
  'The End': 1040,
  'Adventure': 1560,
  'Husbandry': 2080,
}

/** Build the vanilla progression template graph. */
export function buildVanillaTemplate(projectId: string): ProgressionGraphData {
  // Distribute each phase's nodes down its column so nothing overlaps.
  const perPhase = new Map<string, number>()
  for (const n of ALL_NODES) perPhase.set(n.phase, (perPhase.get(n.phase) ?? 0) + 1)
  const rowsUsed = new Map<string, number>()

  const nodes: ProgressionNodeData[] = ALL_NODES.map((n) => {
    const count = perPhase.get(n.phase) ?? 1
    const spacing = Math.min(150, Math.max(90, 1400 / count))
    const row = rowsUsed.get(n.phase) ?? 0
    rowsUsed.set(n.phase, row + 1)
    return {
      id: n.id,
      node_type: n.type,
      label: n.label,
      description: n.description,
      position: { x: PHASE_X[n.phase] ?? 0, y: 60 + row * spacing },
      data: {},
      mod_refs: [],
      item_refs: n.item_refs ?? [],
      chapter_id: n.phase,
      phase: n.phase,
      stage_name: n.phase,
      icon: n.icon ?? '',
      color: '',
    }
  })

  const edges: ProgressionEdgeData[] = EDGES.map((e, i) => ({
    id: `${VANILLA_TEMPLATE_ID}_e${i}`,
    source: e.from,
    target: e.to,
    label: e.label ?? null,
    edge_type: 'prerequisite',
  }))

  return {
    id: VANILLA_TEMPLATE_ID,
    project_id: projectId,
    name: 'Vanilla Progression',
    description: 'A faithful vanilla Minecraft journey across all five advancement tabs — from the first crafting table to the Wither and beyond.',
    nodes,
    edges,
    mod_names: {},
    chapters: VANILLA_PHASES.map((title, i) => ({
      id: title,
      title,
      description: `${title} objectives`,
      order_index: i,
    })),
  }
}

/** All item ids referenced by the template (for texture preloading, if needed). */
export function vanillaTemplateItemRefs(): string[] {
  const ids = new Set<string>()
  for (const n of ALL_NODES) {
    if (n.icon) ids.add(n.icon)
    for (const ref of n.item_refs ?? []) ids.add(ref)
  }
  return [...ids]
}
