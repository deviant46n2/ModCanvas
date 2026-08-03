// Drag-and-drop payload contract shared by the palette and all recipe editors.
// The palette sets this custom MIME on `dataTransfer`; slots read it back to
// receive items. Tags arrive as `#namespace:path` item values with `tag: true`.

import type { RecipeIngredient } from './recipe-store';

export const SLOT_DRAG_MIME = 'application/x-modcanvas-recipe-ingredient';

export interface SlotDragPayload {
  item: string;
  name: string;
  tag?: boolean;
}

export function recipeIngredientFromPayload(payload: SlotDragPayload): RecipeIngredient {
  const isTag = payload.tag || payload.item.startsWith('#');
  return {
    item: isTag && !payload.item.startsWith('#') ? `#${payload.item}` : payload.item,
    tag: isTag,
  };
}