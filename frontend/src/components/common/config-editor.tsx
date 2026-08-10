// Config editor for TOML/JSON5 config files. Recursively renders objects,
// groups and arrays; the scalar leaf editors live in `./config-editor/fields`
// and the props interface in `./config-editor/props`.

import { useState } from 'react'
import { matchesQuery } from '../../core/config/tree'
import {
  ConfigFieldControls,
  ConfigStringField,
  ConfigNumberField,
  ConfigBooleanField,
  ConfigEnumField,
  ConfigColorField,
} from './config-editor/fields'
import { keyName, type ConfigValueEditorProps } from './config-editor/props'

export type { ConfigValue, ParsedConfig, ConfigFileInfo } from '../../core/config/types'

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

  const controls = (
    <ConfigFieldControls onRemoveAt={onRemoveAt} onDuplicateAt={onDuplicateAt} path={path} label={label} />
  )

  if (value.type === 'string') {
    return <ConfigStringField path={path} label={label} value={value} depth={depth} onChange={onChange} controls={controls} />
  }

  if (value.type === 'number') {
    return <ConfigNumberField path={path} label={label} value={value} depth={depth} onChange={onChange} controls={controls} />
  }

  if (value.type === 'boolean') {
    return <ConfigBooleanField path={path} label={label} value={value} depth={depth} onChange={onChange} controls={controls} />
  }

  if (value.type === 'enum' && value.options) {
    return <ConfigEnumField path={path} label={label} value={value} depth={depth} onChange={onChange} controls={controls} />
  }

  if (value.type === 'color') {
    return <ConfigColorField path={path} label={label} value={value} depth={depth} onChange={onChange} controls={controls} />
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
          {controls}
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
          {controls}
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
