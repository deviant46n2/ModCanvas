import { useState } from 'react'

/** New Table form (P3-LOOT follow-up): namespace + resource path. The dir
 *  name comes from the adapter (version boundary), never from here. */
export function NewLootTableForm({
  dirName,
  onCancel,
  onCreate,
}: {
  dirName: 'loot_table' | 'loot_tables'
  onCancel: () => void
  onCreate: (namespace: string, name: string) => void
}) {
  const [namespace, setNamespace] = useState('minecraft')
  const [name, setName] = useState('chests/')
  const [error, setError] = useState('')

  const submit = () => {
    if (!namespace.trim() || !name.trim()) {
      setError('Namespace and name are required.')
      return
    }
    onCreate(namespace.trim(), name.trim())
  }

  return (
    <div className="loot-new-form" data-testid="loot-new-form">
      <div className="loot-new-fields">
        <label className="loot-field">
          Namespace
          <input
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            placeholder="minecraft"
            spellCheck={false}
          />
        </label>
        <label className="loot-field">
          Resource path (no .json)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="chests/my_dungeon"
            spellCheck={false}
          />
        </label>
        <span className="loot-new-dir">
          → <code>data/{namespace}/{dirName}/{name}.json</code>
        </span>
      </div>
      {error && <p className="loot-error">{error}</p>}
      <div className="loot-new-actions">
        <button className="loot-btn" onClick={submit}>Create</button>
        <button className="loot-btn loot-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
