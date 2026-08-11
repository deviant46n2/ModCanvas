import { XIcon } from '../ui/icons'
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api'
import { ItemBrowser, type RecipePickValue } from './ItemBrowser'
import '../../recipe-styles/recipe-item-picker.css'

interface RecipeItemPickerProps {
  items: ItemRegistryEntry[]
  tags: ItemTagInfo[]
  getTextureUrl: (itemId: string) => string | null
  onSelect: (value: RecipePickValue) => void
  onClose: () => void
  /** Output slots take items only — hides the tag section. */
  allowTags?: boolean
}

/**
 * The recipe editor's ingredient picker — a slide-in shell (the drawer pop,
 * matching the quest detail surface) around the shared JEI-style ItemBrowser
 * in pick mode. Same grid, search and tooltip as the recipes-tab palette, so
 * the two surfaces can never drift.
 */
export function RecipeItemPicker({
  items,
  tags,
  getTextureUrl,
  onSelect,
  onClose,
  allowTags = true,
}: RecipeItemPickerProps) {
  return (
    <div className="recipe-picker-overlay">
      <div className="recipe-picker-backdrop" onClick={onClose} />
      <div className="recipe-picker-panel">
        <div className="recipe-picker-header">
          <span className="recipe-picker-title">Item or #tag</span>
          <button className="recipe-picker-close" onClick={onClose} aria-label="Close item browser"><XIcon size={14} /></button>
        </div>
        <div className="recipe-picker-body">
          <ItemBrowser
            items={items}
            tags={tags}
            getTextureUrl={getTextureUrl}
            mode="pick"
            onSelect={onSelect}
            allowTags={allowTags}
          />
        </div>
      </div>
    </div>
  )
}

export default RecipeItemPicker
