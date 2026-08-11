import { useState } from 'react'
import { generateRecipeScripts, writeScriptFiles, wsIpcSendEvent } from '../services/api'
import { selectSaveableRecipes } from '../core/recipe/validation'
import { useRecipeStore, type Recipe } from '../core/recipe/recipe-store'
import { KUBEJS_HOTSWAP_ENABLED } from '../core/sync/config'

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
      // KubeJS hotswap is DISABLED until its reload evidence shape is probed
      // (core/sync/config.ts): firing RELOAD_KUBEJS_SCRIPTS unverified was
      // silent divergence — the app would not know if the reload landed.
      // Until then the honest statement is: saved to disk, restart to apply.
      if (KUBEJS_HOTSWAP_ENABLED) {
        await wsIpcSendEvent('RELOAD_KUBEJS_SCRIPTS', recipeScriptPath)
        setSaveMessage('Scripts saved + reload sent (unverified — log evidence probe pending).')
      } else {
        setSaveMessage('Scripts saved — restart the game to apply.')
      }
      markClean()
      setTimeout(() => { setShowSaveDialog(false); setSaveMessage('') }, 3000)
    } catch (e) {
      console.error('Save failed:', e)
      setSaveMessage(`Error: ${e}`)
    }
  }

  return { showSaveDialog, saveMessage, save }
}
