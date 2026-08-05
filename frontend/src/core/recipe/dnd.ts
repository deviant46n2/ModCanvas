// Drag-and-drop payload contract shared by the palette and all recipe editors.
// The palette sets this custom MIME on `dataTransfer`; slots read it back to
// receive items. Tags arrive as `#namespace:path` item values with `tag: true`.
//
// Transport robustness: webkit2gtk (Tauri's Linux webview) strips custom
// `dataTransfer` MIME types, so `getData(custom)` returns empty on drop. We
// therefore write the payload to the custom MIME **and** `text/plain`, and also
// stash it in a same-window module variable as a final fallback. Readers try
// custom → text/plain → stash. Helpers take the `dataTransfer` object directly
// so they are testable without a real DOM DragEvent.

import type { RecipeIngredient } from './recipe-store';

export const SLOT_DRAG_MIME = 'application/x-modcanvas-recipe-ingredient';
export const SLOT_DRAG_TEXT_MIME = 'text/plain';

export interface SlotDragPayload {
  item: string;
  name: string;
  tag?: boolean;
}

let lastDragPayload: SlotDragPayload | null = null;

export function recipeIngredientFromPayload(payload: SlotDragPayload): RecipeIngredient {
  const isTag = payload.tag || payload.item.startsWith('#');
  return {
    item: isTag && !payload.item.startsWith('#') ? `#${payload.item}` : payload.item,
    tag: isTag,
  };
}

/** Minimal shape of a `dataTransfer` used for writing a payload. */
export interface DragWriteTarget {
  setData: (type: string, data: string) => void;
  effectAllowed?: string;
}

/** Minimal shape of a `dataTransfer` used for reading a payload. */
export interface DragReadSource {
  getData: (type: string) => string;
}

/** Parse a raw payload string; null for empty/invalid. */
export function parsePayload(raw: string | null | undefined): SlotDragPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SlotDragPayload;
  } catch {
    return null;
  }
}

/** Write a drag payload: custom MIME + `text/plain` + the module stash. */
export function setDragPayload(
  dataTransfer: DragWriteTarget | undefined,
  payload: SlotDragPayload,
): void {
  lastDragPayload = payload;
  if (!dataTransfer) return;
  const data = JSON.stringify(payload);
  try {
    dataTransfer.setData(SLOT_DRAG_MIME, data);
    dataTransfer.setData(SLOT_DRAG_TEXT_MIME, data);
    dataTransfer.effectAllowed = 'copy';
  } catch {
    /* dataTransfer unusable — the stash still carries the payload */
  }
}

/** Clear the module stash (call on the source's `dragend`). */
export function clearDragPayload(): void {
  lastDragPayload = null;
}

/** Read a drag payload on drop, trying custom MIME → `text/plain` → stash. */
export function readDragPayload(dataTransfer: DragReadSource | undefined): SlotDragPayload | null {
  if (dataTransfer?.getData) {
    const raw =
      dataTransfer.getData(SLOT_DRAG_MIME) ||
      dataTransfer.getData(SLOT_DRAG_TEXT_MIME);
    const parsed = parsePayload(raw);
    if (parsed) return parsed;
  }
  return lastDragPayload;
}
