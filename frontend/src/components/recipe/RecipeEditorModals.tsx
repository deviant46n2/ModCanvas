import { ImportRecipesModal } from './ImportRecipesModal';
import { BulkReplaceModal } from './BulkReplaceModal';
import { RecipeItemPicker } from './RecipeItemPicker';
import type { RecipePickValue } from './ItemBrowser';
import type { IngredientRef } from '../../core/recipe/bulk-replace';
import type { Recipe } from '../../core/recipe/recipe-store';
import type { ImportedRecipe } from '../../core/recipe/json-import';
import type { ItemRegistryEntry, ItemTagInfo } from '../../services/api';

interface RecipeEditorModalsProps {
  showImport: boolean;
  onCloseImport: () => void;
  onImport: (imported: ImportedRecipe[]) => void;
  pickTarget: { kind: 'cell'; row: number; col: number } | { kind: 'output' } | null;
  onPickItem: (value: RecipePickValue) => void;
  onClosePick: () => void;
  bulkReplaceIds: string[] | null;
  recipes: Recipe[];
  itemRegistry: ItemRegistryEntry[];
  tags: ItemTagInfo[];
  getTextureUrl: (itemId: string) => string | null;
  onCloseBulk: () => void;
  onApplyBulk: (from: IngredientRef, to: IngredientRef, affectedIds: string[]) => void;
}

export function RecipeEditorModals({
  showImport,
  onCloseImport,
  onImport,
  pickTarget,
  onPickItem,
  onClosePick,
  bulkReplaceIds,
  recipes,
  itemRegistry,
  tags,
  getTextureUrl,
  onCloseBulk,
  onApplyBulk,
}: RecipeEditorModalsProps) {
  return (
    <>
      {showImport && (
        <ImportRecipesModal onClose={onCloseImport} onImport={onImport} />
      )}

      {pickTarget && (
        <RecipeItemPicker
          items={itemRegistry}
          tags={tags}
          getTextureUrl={getTextureUrl}
          allowTags={pickTarget.kind === 'cell'}
          onSelect={onPickItem}
          onClose={onClosePick}
        />
      )}

      {bulkReplaceIds && (
        <BulkReplaceModal
          recipes={recipes}
          selectedIds={bulkReplaceIds}
          items={itemRegistry}
          tags={tags}
          getTextureUrl={getTextureUrl}
          onClose={onCloseBulk}
          onApply={onApplyBulk}
        />
      )}
    </>
  );
}

export default RecipeEditorModals;
