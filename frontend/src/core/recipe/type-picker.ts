import type { RecipeType } from './recipe-store';

export const TYPE_LABELS: Record<RecipeType, string> = {
  shaped: 'Shaped',
  shapeless: 'Shapeless',
  smithing: 'Smithing',
  stonecutting: 'Stonecutting',
  smelting: 'Smelting',
  blasting: 'Blasting',
  smoking: 'Smoking',
  campfire: 'Campfire',
};

/** Type-card metadata: label + mini grid glyph (first `cells` of a `cols`
 *  wide grid filled). One entry per `RecipeType`. */
export const TYPE_OPTIONS: { type: RecipeType; cols: number; cells: number }[] = [
  { type: 'shaped', cols: 3, cells: 9 },
  { type: 'shapeless', cols: 3, cells: 4 },
  { type: 'smithing', cols: 3, cells: 2 },
  { type: 'stonecutting', cols: 1, cells: 1 },
  { type: 'smelting', cols: 1, cells: 1 },
  { type: 'blasting', cols: 1, cells: 1 },
  { type: 'smoking', cols: 1, cells: 1 },
  { type: 'campfire', cols: 1, cells: 1 },
];

const CRAFTING: RecipeType[] = ['shaped', 'shapeless'];

/** True when switching `from → to` discards data: moving a crafting recipe
 *  (shaped/shapeless) to any non-crafting type throws away the pattern and
 *  limits the shown ingredients. Furnace-family ↔ stonecutting/smithing swaps
 *  are safe (no confirm). */
export function typeSwitchDiscards(from: RecipeType, to: RecipeType): boolean {
  return CRAFTING.includes(from) && !CRAFTING.includes(to);
}

/** Confirm copy for a data-discarding switch. */
export function typeSwitchConfirmMessage(to: RecipeType): string {
  const keeps = to === 'smithing' ? 'the first two ingredients' : 'only the first ingredient';
  return `Switching to ${TYPE_LABELS[to]} keeps ${keeps}; the pattern will be discarded. Continue?`;
}
