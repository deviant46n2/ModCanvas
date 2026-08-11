import { useState } from 'react'
import { generateRecipeScripts, writeScriptFiles } from '../services/api'
import { selectSaveableRecipes } from '../core/recipe/validation'
import { useRecipeStore, type Recipe } from '../core/recipe/recipe-store'
import { KUBEJS_HOTSWAP_ENABLED } from '../core/sync/config'
import { reloadKubeJSInGame } from '../services/hotswap'

export function useRecipeSave(projectId: string) {
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
      // KubeJS hotswap runs the evidence-gated loop (core/sync/config.ts s44):
      // the companion runs `kubejs reload server-scripts` + `/reload`, and the
      // app reports PASS only when BOTH evidence lines land after the pin. A
      // FAIL or no-companion is surfaced honestly — never a claimed reload.
      if (KUBEJS_HOTSWAP_ENABLED) {
        const outcome = await reloadKubeJSInGame(projectId)
        if (outcome.status === 'passed') {
          setSaveMessage('Scripts saved + hot-reloaded (evidence verified).')
        } else if (outcome.status === 'no-companion') {
          setSaveMessage('Scripts saved — game not connected; restart the game to apply.')
        } else if (outcome.status === 'rotated') {
          setSaveMessage('Scripts saved — reload inconclusive (log rotated); restart the game to apply.')
        } else {
          setSaveMessage('Scripts saved — reload sent but NOT verified; restart the game to apply.')
        }
      } else {
        setSaveMessage('Scripts saved — restart the game to apply.')
      }
      markClean()
      setTimeout(() => { setShowSaveDialog(false); setSaveMessage('') }, 5000)
    } catch (e) {
      console.error('Save failed:', e)
      setSaveMessage(`Error: ${e}`)
    }
  }

  return { showSaveDialog, saveMessage, save }
}
