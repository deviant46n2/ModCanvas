import { useState } from 'react'

export interface ConfigValue {
  type: string
  value?: string | number | boolean
  fields?: Record<string, ConfigValue>
  items?: ConfigValue[]
  options?: string[]
  comment?: string
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface ParsedConfig {
  format: string
  root: ConfigValue
  raw: string
}

export interface ConfigFileInfo {
  path: string
  name: string
  format: string
  size: number
}

export function ConfigValueEditor({
  value,
  path,
  onChange,
  depth = 0,
}: {
  value: ConfigValue
  path: string[]
  onChange: (path: string[], value: ConfigValue) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (value.type === 'string') {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
        <input
          type="text"
          className="config-input"
          value={value.value as string}
          onChange={(e) => onChange(path, { ...value, value: e.target.value })}
        />
        {value.comment && <span className="config-comment">{value.comment}</span>}
      </div>
    )
  }

  if (value.type === 'number') {
    const hasRange = value.min !== undefined && value.max !== undefined
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
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
      </div>
    )
  }

  if (value.type === 'boolean') {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
        <button
          className={`config-toggle ${value.value ? 'on' : 'off'}`}
          onClick={() => onChange(path, { ...value, value: !value.value })}
          aria-pressed={value.value as boolean}
        >
          {value.value ? 'ON' : 'OFF'}
        </button>
        {value.comment && <span className="config-comment">{value.comment}</span>}
      </div>
    )
  }

  if (value.type === 'enum' && value.options) {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
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
      </div>
    )
  }

  if (value.type === 'color') {
    return (
      <div className="config-field" style={{ marginLeft: depth * 16 }}>
        <label className="config-key">{path[path.length - 1]}</label>
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
      </div>
    )
  }

  if (value.type === 'object' || value.type === 'group') {
    const fields = value.fields || {}
    const fieldCount = Object.keys(fields).length
    return (
      <div className="config-section" style={{ marginLeft: depth * 16 }}>
        <div className="config-section-header" onClick={() => setExpanded(!expanded)}>
          <span className="config-expand-icon">{expanded ? '\u25BC' : '\u25B6'}</span>
          <span className="config-section-title">
            {value.type === 'group' ? (value as any).label : path[path.length - 1]}
          </span>
          <span className="config-field-count">{fieldCount} fields</span>
        </div>
        {value.comment && <span className="config-comment" style={{ marginLeft: 20 }}>{value.comment}</span>}
        {expanded && (
          <div className="config-section-body">
            {Object.entries(fields).map(([key, val]) => (
              <ConfigValueEditor
                key={key}
                value={val}
                path={[...path, key]}
                onChange={onChange}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (value.type === 'array' && value.items) {
    return (
      <div className="config-section" style={{ marginLeft: depth * 16 }}>
        <div className="config-section-header" onClick={() => setExpanded(!expanded)}>
          <span className="config-expand-icon">{expanded ? '\u25BC' : '\u25B6'}</span>
          <span className="config-section-title">{path[path.length - 1]}</span>
          <span className="config-field-count">{value.items.length} items</span>
        </div>
        {value.comment && <span className="config-comment" style={{ marginLeft: 20 }}>{value.comment}</span>}
        {expanded && (
          <div className="config-section-body">
            {value.items.map((item, i) => (
              <ConfigValueEditor
                key={i}
                value={item}
                path={[...path, i.toString()]}
                onChange={onChange}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return <div className="config-unknown">Unsupported: {value.type}</div>
}
