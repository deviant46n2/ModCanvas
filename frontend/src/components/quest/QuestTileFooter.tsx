import React from 'react'

export interface QuestTileFooterProps {
  canBeRepeatable: boolean
  silentlyComplete: boolean
  repeatTime: number
}

export function QuestTileFooter({
  canBeRepeatable,
  silentlyComplete,
  repeatTime,
}: QuestTileFooterProps) {
  if (!canBeRepeatable) return null

  return (
    <div className="quest-tile-repeatable" title="Repeatable">
      🔄 {silentlyComplete ? 'Silent' : `${repeatTime}t`}
    </div>
  )
}

export default QuestTileFooter
