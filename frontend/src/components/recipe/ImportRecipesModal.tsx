import { useState } from 'react';
import { importRecipeJson } from '../../core/recipe/json-import';
import type { ImportedRecipe } from '../../core/recipe/json-import';

interface ImportRecipesModalProps {
  onClose: () => void;
  onImport: (recipes: ImportedRecipe[]) => void;
}

const EXAMPLES = [
  `{
  "type": "minecraft:crafting_shaped",
  "pattern": ["AAA", "ABA", "AAA"],
  "key": { "A": { "tag": "forge:ingots/iron" }, "B": { "item": "minecraft:diamond" } },
  "result": { "item": "minecraft:diamond_block", "count": 1 }
}`,
  `{
  "type": "minecraft:crafting_shapeless",
  "ingredients": [{ "item": "minecraft:dirt" }, { "item": "minecraft:stick" }],
  "result": { "item": "minecraft:stone_sword" }
}`,
  `{
  "type": "minecraft:smelting",
  "ingredient": { "item": "minecraft:iron_ore" },
  "result": { "item": "minecraft:iron_ingot" },
  "experience": 0.7,
  "cookingtime": 200
}`,
];

/** Modal to paste vanilla/KubeJS recipe JSON and turn it into editable recipes. */
export function ImportRecipesModal({ onClose, onImport }: ImportRecipesModalProps) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ ok: number; errors: number } | null>(null);
  const [resultMessage, setResultMessage] = useState('');

  const startPreview = (value: string) => {
    const res = importRecipeJson(value);
    setPreview({ ok: res.recipes.length, errors: res.errors.length });
  };

  const doImport = () => {
    const res = importRecipeJson(text);
    if (res.recipes.length === 0) {
      setResultMessage(res.errors[0]?.message || 'Nothing to import.');
      return;
    }
    onImport(res.recipes);
    onClose();
  };

  const loadExample = () => {
    const ex = EXAMPLES[0];
    setText(ex);
    startPreview(ex);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import Recipe JSON</h2>
        <p>Paste a vanilla / KubeJS recipe (single object or an array) to turn it into an editable recipe.</p>

        <textarea
          className="import-textarea"
          placeholder='{ "type": "minecraft:crafting_shaped", ... }'
          value={text}
          onChange={(e) => { setText(e.target.value); startPreview(e.target.value); }}
          spellCheck={false}
        />

        <div className="import-actions-row">
          <button className="btn-secondary" onClick={loadExample}>Load example</button>
          {preview && (
            <span className="import-preview">
              {preview.ok} ready{preview.errors > 0 ? `, ${preview.errors} error${preview.errors > 1 ? 's' : ''}` : ''}
            </span>
          )}
        </div>

        {resultMessage && <div className="import-error">{resultMessage}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={doImport} disabled={preview?.ok === 0}>
            Import {preview && preview.ok > 0 ? `(${preview.ok})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportRecipesModal;