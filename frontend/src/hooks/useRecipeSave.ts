import { useState } from 'react'
import { generateRecipeScripts, writeScriptFiles, wsIpcSendEvent } from '../services/api'
import { selectSaveableRecipes } from '../core/recipe/validation'
import { useRecipeStore, type Recipe } from '../core/recipe/recipe-store'
import { HOTSWAP_FROZEN } from '../core/sync/config'

export function useRecipeSave(projectId: string, recipeScriptPath: string) {
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const save = async (recipes: Recipe[], markClean: () => void) => {
    if (!projectId) return
    try {
      setShowSaveDialog(true)
      setSaveMessage('Generating scripts...')
      const valid = selectSaveableRecipes(recipes)
      if (valid.length !== recipes.length) {
        setSaveMessage(`Saving ${valid.length}/${recipes.length} recipes (skipped invalid).`)
      }
      const { disabledIds } = useRecipeStore.getState()
      const { kubejs, crafttweaker } = await generateRecipeScripts(projectId, valid, disabledIds)
      await writeScriptFiles(projectId, kubejs, crafttweaker)
      setSaveMessage('Scripts saved successfully!')
      markClean()
      // Hotswap frozen (todo.md Phase 3): the RELOAD_KUBEJS_SCRIPTS push stays
      // dormant behind the flag; scripts are written to disk only.
      if (!HOTSWAP_FROZEN) {
        await wsIpcSendEvent('RELOAD_KUBEJS_SCRIPTS', recipeScriptPath)
      }
      setTimeout(() => { setShowSaveDialog(false); setSaveMessage('') }, 3000)
    } catch (e) {
      console.error('Save failed:', e)
      setSaveMessage(`Error: ${e}`)
    }
  }

  return { showSaveDialog, saveMessage, save }
}
