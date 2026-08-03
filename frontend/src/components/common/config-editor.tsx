import { useState } from 'react'
import type { ConfigValue } from '../../core/config/types'
import { matchesQuery } from '../../core/config/tree'

export type { ConfigValue, ParsedConfig, ConfigFileInfo } from '../../core/config/types'

interface ConfigValueEditorProps {
  value: ConfigValue
  path: string[]
  onChange: (path: string[], value: ConfigValue) => void
  depth?: number
  query?: string
  collapsed?: boolean
  onAddArrayItem?: (path: string[]) => void
  onRemoveAt?: (path: string[]) => void
  onAddField?: (path: string[]) => void
  onMoveArrayItem?: (arrayPath: string[], from: number, to: number) => void
  onDuplicateAt?: (path: string[]) => void
}

function keyName(path: string[]): string {
  const last = path[path.length - 1]
  return last === '[]' ? '[item]' : last
}

export function ConfigValueEditor({
  value,
  path,
  onChange,
  depth = 0,
  query = '',
  collapsed = false,
  onAddArrayItem,
  onRemoveAt,
  onAddField,
  onMoveArrayItem,
  onDuplicateAt,
}: ConfigValueEditorProps) {
  const [expanded, setExpanded] = useState(!collapsed && depth < 2)
  const label = keyName(path)
  const matching = query.trim().length === 0 || matchesQuery(value, label, query, [])

  if (!matching) return null

  const fieldControls = onRemoveAt || onDuplicateAt ? (
    <span className="config-field-controls">
      {onDuplicateAt && (
        <button
          className="config-icon-btn config-duplicate"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicateAt(path)
          }}
          title="Duplicate"
          aria-label={`Duplicate ${label}`}
        >
          {'\u2398'}
        </button>
      )}
      {onRemoveAt && (
        <button
          className="config-icon-btn config-remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemoveAt(path)
          }}
          title="Remove"
          aria-label={`Remove ${label}`}
        >
          {'\u00D7'}
        </button>
      )}
    </span>
  ) : null

  if (value.type === 'string') {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{label}</label>
        <input
          type="text"
          className="config-input"
          value={value.value as string}
          onChange={(e) => onChange(path, { ...value, value: e.target.value })}
        />
        {value.comment && <span className="config-comment">{value.comment}</span>}
        {fieldControls}
      </div>
    )
  }

  if (value.type === 'number') {
    const hasRange = value.min !== undefined && value.max !== undefined
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{label}</label>
        {hasRange ? (
          <div className="config-slider-group">
            <input
              type="range"
              className="config-slider"
              min={value.min}
              max={value.max}
              step={value.step || 1}
              value={value.value as number}
              onChange={(e) => onChange(path, { ...value, value: parseFloat(e.target.value) })}
            />
            <span className="config-value-display">
              {value.value}{value.unit ? ` ${value.unit}` : ''}
            </span>
          </div>
        ) : (
          <input
            type="number"
            className="config-input config-number"
            value={value.value as number}
            step={value.step || 'any'}
            onChange={(e) => onChange(path, { ...value, value: parseFloat(e.target.value) })}
          />
        )}
        {value.comment && <span className="config-comment">{value.comment}</span>}
        {fieldControls}
      </div>
    )
  }

  if (value.type === 'boolean') {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{label}</label>
        <button
          className={`config-toggle ${value.value ? 'on' : 'off'}`}
          onClick={() => onChange(path, { ...value, value: !value.value })}
          aria-pressed={value.value as boolean}
        >
          {value.value ? 'ON' : 'OFF'}
        </button>
        {value.comment && <span className="config-comment">{value.comment}</span>}
        {fieldControls}
      </div>
    )
  }

  if (value.type === 'enum' && value.options) {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{label}</label>
        <select
          className="config-select"
          value={value.value as string}
          onChange={(e) => onChange(path, { ...value, value: e.target.value })}
        >
          {value.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {value.comment && <span className="config-comment">{value.comment}</span>}
        {fieldControls}
      </div>
    )
  }

  if (value.type === 'color') {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{label}</label>
        <div className="config-color-group">
          <input
            type="color"
            className="config-color-picker"
            value={value.value as string}
            onChange={(e) => onChange(path, { ...value, value: e.target.value })}
          />
          <input
            type="text"
            className="config-input config-color-text"
            value={value.value as string}
            onChange={(e) => onChange(path, { ...value, value: e.target.value })}
          />
        </div>
        {value.comment && <span className="config-comment">{value.comment}</span>}
        {fieldControls}
      </div>
    )
  }

  if (value.type === 'object' || value.type === 'group') {
    const fields = value.fields || {}
    const fieldCount = Object.keys(fields).length
    const searching = query.trim().length > 0
    const showExpanded = searching || expanded
    const title = value.type === 'group' && value.label ? value.label : label
    return (
      <div className="config-section" style={{ marginLeft: depth * 16 }}>
        <div className="config-section-header" onClick={() => setExpanded(!expanded)}>
          <span className="config-expand-icon">{showExpanded ? '\u25BC' : '\u25B6'}</span>
          <span className="config-section-title">{title}</span>
          <span className="config-field-count">{fieldCount} fields</span>
          {fieldControls}
        </div>
        {value.comment && <span className="config-comment" style={{ marginLeft: 20 }}>{value.comment}</span>}
        {showExpanded && (
          <div className="config-section-body">
            {Object.entries(fields).map(([k, val]) => (
              <ConfigValueEditor
                key={k}
                value={val}
                path={[...path, k]}
                onChange={onChange}
                depth={depth + 1}
                query={query}
                collapsed={collapsed}
                onAddArrayItem={onAddArrayItem}
                onRemoveAt={onRemoveAt}
                onAddField={onAddField}
                onMoveArrayItem={onMoveArrayItem}
                onDuplicateAt={onDuplicateAt}
              />
            ))}
            {onAddField && (
              <button
                className="config-add-btn"
                onClick={() => onAddField(path)}
                title="Add field"
              >
                + Add field
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (value.type === 'array' && value.items) {
    const showExpanded = query.trim().length > 0 || expanded
    return (
      <div className="config-section" style={{ marginLeft: depth * 16 }}>
        <div className="config-section-header" onClick={() => setExpanded(!expanded)}>
          <span className="config-expand-icon">{showExpanded ? '\u25BC' : '\u25B6'}</span>
          <span className="config-section-title">{label}</span>
          <span className="config-field-count">{value.items.length} items</span>
          {fieldControls}
        </div>
        {value.comment && <span className="config-comment" style={{ marginLeft: 20 }}>{value.comment}</span>}
        {showExpanded && (
          <div className="config-section-body">
            {value.items.map((item, i) => (
              <div className="config-array-row" key={i}>
                {onMoveArrayItem && (
                  <span className="config-reorder-controls">
                    <button
                      className="config-icon-btn config-reorder"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMoveArrayItem(path, i, i - 1)
                      }}
                      disabled={i === 0}
                      title="Move up"
                      aria-label={`Move item ${i} up`}
                    >
                      {'\u2191'}
                    </button>
                    <button
                      className="config-icon-btn config-reorder-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onMoveArrayItem(path, i, i + 1)
                      }}
                      disabled={i >= value.items!.length - 1}
                      title="Move down"
                      aria-label={`Move item ${i} down`}
                    >
                      {'\u2193'}
                    </button>
                  </span>
                )}
                <ConfigValueEditor
                  value={item}
                  path={[...path, i.toString()]}
                  onChange={onChange}
                  depth={depth + 1}
                  query={query}
                  collapsed={collapsed}
                  onAddArrayItem={onAddArrayItem}
                  onRemoveAt={onRemoveAt}
                  onAddField={onAddField}
                  onMoveArrayItem={onMoveArrayItem}
                  onDuplicateAt={onDuplicateAt}
                />
              </div>
            ))}
            {onAddArrayItem && (
              <button
                className="config-add-btn"
                onClick={() => onAddArrayItem(path)}
                title="Add item"
              >
                + Add item
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return <div className="config-unknown">Unsupported: {value.type}</div>
}
