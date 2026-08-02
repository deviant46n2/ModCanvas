export interface QuestTileFooterProps {
  canBeRepeatable: boolean
  silentlyComplete: boolean
  repeatCooldown: number
}

export function QuestTileFooter({
  canBeRepeatable,
  silentlyComplete,
  repeatCooldown,
}: QuestTileFooterProps) {
  if (!canBeRepeatable) return null

  return (
    <div className="quest-tile-repeatable" title="Repeatable">
      🔄 {silentlyComplete ? 'Silent' : `${repeatCooldown}s`}
    </div>
  )
}

export default QuestTileFooter
