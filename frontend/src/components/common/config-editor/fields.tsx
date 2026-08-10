// Scalar leaf field editors for the config editor (string/number/boolean/
// enum/color) plus the duplicate/remove controls. Split out of
// `config-editor.tsx`; the container (object/group/array) rendering stays in
// the main component.

import type { ReactNode } from 'react'
import type { ConfigValue } from '../../../core/config/types'

export interface ConfigLeafProps {
  path: string[]
  label: string
  value: ConfigValue
  depth: number
  onChange: (path: string[], value: ConfigValue) => void
  controls: ReactNode
}

export function ConfigFieldControls({ onRemoveAt, onDuplicateAt, path, label }: {
  onRemoveAt?: (path: string[]) => void
  onDuplicateAt?: (path: string[]) => void
  path: string[]
  label: string
}) {
  if (!onRemoveAt && !onDuplicateAt) return null
  return (
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
  )
}

export function ConfigStringField({ path, label, value, depth, onChange, controls }: ConfigLeafProps) {
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
      {controls}
    </div>
  )
}

export function ConfigNumberField({ path, label, value, depth, onChange, controls }: ConfigLeafProps) {
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
      {controls}
    </div>
  )
}

export function ConfigBooleanField({ path, label, value, depth, onChange, controls }: ConfigLeafProps) {
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
      {controls}
    </div>
  )
}

export function ConfigEnumField({ path, label, value, depth, onChange, controls }: ConfigLeafProps) {
  return (
    <div className="config-field" style={{ marginLeft: depth * 16 }}>
      <label className="config-key">{label}</label>
      <select
        className="config-select"
        value={value.value as string}
        onChange={(e) => onChange(path, { ...value, value: e.target.value })}
      >
        {value.options?.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {value.comment && <span className="config-comment">{value.comment}</span>}
      {controls}
    </div>
  )
}

export function ConfigColorField({ path, label, value, depth, onChange, controls }: ConfigLeafProps) {
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
      {controls}
    </div>
  )
}
