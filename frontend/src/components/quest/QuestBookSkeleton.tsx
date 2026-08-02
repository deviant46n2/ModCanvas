const CHAPTER_ROWS = 9

const NODE_TILES = [
  { w: 96, h: 56, x: '12%', y: '22%' },
  { w: 72, h: 72, x: '28%', y: '48%' },
  { w: 110, h: 64, x: '46%', y: '30%' },
  { w: 64, h: 64, x: '62%', y: '58%' },
  { w: 88, h: 52, x: '74%', y: '24%' },
  { w: 100, h: 60, x: '36%', y: '70%' },
  { w: 72, h: 72, x: '82%', y: '68%' },
]

export function QuestBookSkeleton() {
  return (
    <div className="quest-editor quest-skeleton" role="status" aria-label="Loading quest book">
      <div className="quest-editor-toolbar quest-skeleton-toolbar">
        <div className="quest-skeleton-row">
          <div className="quest-skeleton-block" style={{ width: 90, height: 28 }} />
          <div className="quest-skeleton-block" style={{ width: 70, height: 28 }} />
          <div className="quest-skeleton-block" style={{ width: 60, height: 28 }} />
        </div>
        <div className="quest-skeleton-row">
          <div className="quest-skeleton-block" style={{ width: 120, height: 28 }} />
          <div className="quest-skeleton-block" style={{ width: 44, height: 28 }} />
        </div>
      </div>
      <div className="quest-editor-body">
        <aside className="quest-editor-chapters" aria-hidden="true">
          {Array.from({ length: CHAPTER_ROWS }, (_, i) => (
            <div className="quest-skeleton-chapter" key={i}>
              <div className="quest-skeleton-block quest-skeleton-avatar" />
              <div className="quest-skeleton-chapter-lines">
                <div
                  className="quest-skeleton-block"
                  style={{ width: `${42 + ((i * 13) % 44)}%`, height: 12 }}
                />
                <div className="quest-skeleton-block" style={{ width: '30%', height: 10 }} />
              </div>
              <div
                className="quest-skeleton-block quest-skeleton-count"
                style={{ width: 26, height: 14 }}
              />
            </div>
          ))}
        </aside>
        <main className="quest-editor-canvas quest-skeleton-canvas" aria-hidden="true">
          <div className="quest-skeleton-canvas-toolbar">
            <div className="quest-skeleton-block" style={{ width: 140, height: 20 }} />
            <div className="quest-skeleton-block" style={{ width: 96, height: 20 }} />
          </div>
          <div className="quest-skeleton-grid" />
          <div className="quest-skeleton-nodes">
            {NODE_TILES.map((tile, i) => (
              <div
                key={i}
                className="quest-skeleton-node"
                style={{ width: tile.w, height: tile.h, left: tile.x, top: tile.y }}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
