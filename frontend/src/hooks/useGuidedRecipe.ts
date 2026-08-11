// useGuidedRecipe — the P0-MINIWIZ "Add a recipe" create path (roadmap §9.5).
//
// Owns the guided-wizard modal state and builds the recipe from the spec
// through the SAME store path as the editor's "New Recipe" button — undoable
// via the recipe store, saves through useRecipeSave. Extracted from
// RecipeEditor.tsx to keep it under the 300-line limit (s22 meta-rule).
import { useState } from 'react'
import { useRecipeStore } from '../core/recipe/recipe-store'
import type { GuidedRecipeSpec } from '../components/recipe/GuidedRecipeWizard'

export function useGuidedRecipe() {
  const addRecipe = useRecipeStore((s) => s.addRecipe)
  const selectRecipe = useRecipeStore((s) => s.selectRecipe)
  const [open, setOpen] = useState(false)

  const handleCreate = (spec: GuidedRecipeSpec) => {
    const id = addRecipe({
      type: 'shapeless',
      name: `Craft ${spec.output.split(':').pop() || spec.output}`,
      group: '',
      ingredients: spec.ingredients.map((i) => ({ item: i.item, count: i.count })),
      output: { item: spec.output, count: spec.outputCount },
    })
    selectRecipe(id)
  }

  return {
    open,
    openWizard: () => setOpen(true),
    closeWizard: () => setOpen(false),
    handleCreate,
  }
}
