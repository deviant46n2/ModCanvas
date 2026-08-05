interface EngineRenderPromptProps {
  /** Texture keys still waiting on a real in-game render (software bakes). */
  bakedCount: number
  /** Companion mod connected to the WebSocket server. */
  connected: boolean
  /** A launch is already in progress (disables the Run Instance button). */
  isTesting: boolean
  /** Launch the instance with the companion mod (reuses the Test action). */
  onRunInstance: () => void
  /** Hide the prompt for this session/project. */
  onDismiss: () => void
}

/**
 * Prompt shown while some item icons cannot be resolved offline (they are
 * software-baked 3D models). Offers to launch the instance so the companion
 * mod's real Minecraft renderer captures and caches them. While the game is
 * connected the banner instead reports capture progress and hides itself once
 * every bake has been replaced by a real engine render.
 */
export function EngineRenderPrompt({
  bakedCount,
  connected,
  isTesting,
  onRunInstance,
  onDismiss,
}: EngineRenderPromptProps) {
  const label = connected
    ? `Capturing item textures from the game… (${bakedCount} remaining)`
    : isTesting
      ? 'Launching the instance to capture item textures…'
      : `Some item icons can't be resolved offline (${bakedCount} need the game's renderer). Run the instance to capture real textures.`

  return (
    <div className="engine-render-prompt" role="status" aria-live="polite">
      <span className="engine-render-prompt-icon" aria-hidden="true">&#10022;</span>
      <span className="engine-render-prompt-text">{label}</span>
      {!connected && !isTesting && (
        <button className="btn-primary engine-render-prompt-btn" onClick={onRunInstance}>
          Run Instance
        </button>
      )}
      {!connected && (
        <button
          className="btn-icon engine-render-prompt-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
        >
          &times;
        </button>
      )}
    </div>
  )
}
