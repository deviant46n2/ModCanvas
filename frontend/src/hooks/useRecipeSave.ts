import { useState } from 'react'
import { generateRecipeScripts, writeScriptFiles, wsIpcSendEvent } from '../services/api'
import { validateRecipe, hasErrors } from '../core/recipe/validation'
import type { Recipe } from '../core/recipe/recipe-store'

export function useRecipeSave(projectId: string, recipeScriptPath: string) {
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const save = async (recipes: Recipe[], markClean: () => void) => {
    if (!projectId) return
    try {
      setShowSaveDialog(true)
      setSaveMessage('Generating scripts...')
      const valid = recipes.filter((r) => r.output.item && !hasErrors(validateRecipe(r)))
      if (valid.length !== recipes.length) {
        setSaveMessage(`Saving ${valid.length}/${recipes.length} recipes (skipped invalid).`)
      }
      const { kubejsScript, crafttweakerScript } = await generateRecipeScripts(projectId, valid)
      await writeScriptFiles(projectId, kubejsScript, crafttweakerScript)
      setSaveMessage('Scripts saved successfully!')
      markClean()
      await wsIpcSendEvent('RELOAD_KUBEJS_SCRIPTS', recipeScriptPath)
      setTimeout(() => { setShowSaveDialog(false); setSaveMessage('') }, 3000)
    } catch (e) {
      console.error('Save failed:', e)
      setSaveMessage(`Error: ${e}`)
    }
  }

  return { showSaveDialog, saveMessage, save }
}
