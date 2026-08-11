// GuidedQuestStep — the first-pack wizard's step 5 (roadmap §9.3 step 5):
// the guided-first-quest handoff. It explains the zero-code proof point and
// offers to open the guided-quest modal in the quest editor (P0-MINIWIZ).
// Pure presentation: the handoff itself lives in the App (close wizard,
// switch to the quests tab, open the modal).
interface GuidedQuestStepProps {
  onAdd: () => void
  onSkip: () => void
}

export function GuidedQuestStep({ onAdd, onSkip }: GuidedQuestStepProps) {
  return (
    <div style={{ fontSize: 14 }}>
      <p style={{ margin: '0 0 12px', color: 'var(--color-text-secondary)' }}>
        Your pack is ready to shape. Let's add your first quest — pick an item,
        pick a goal, and ModCanvas writes the quest for you. You'll see it on the
        canvas immediately, and you can edit or undo it right there.
      </p>
      <button className="btn-primary" onClick={onAdd}>
        Add my first quest
      </button>
      <button
        className="btn-secondary"
        style={{ marginLeft: 8 }}
        onClick={onSkip}
      >
        Skip for now
      </button>
    </div>
  )
}
