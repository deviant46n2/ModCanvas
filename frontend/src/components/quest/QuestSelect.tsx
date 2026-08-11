import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from '../ui/icons'

export interface QuestSelectOption {
  value: string
  label: string
}

interface QuestSelectProps {
  value: string
  options: QuestSelectOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  className?: string
}

/**
 * The dark dropdown that replaces native <select> — WebKitGTK renders the
 * native popup white no matter what CSS the trigger carries, so the drawer
 * ships its own. The list is positioned `fixed` at the trigger's viewport
 * rect so the drawer's scroll container (overflow-y: auto) can never clip
 * it; it closes on outside mousedown, Escape, or any scroll/resize.
 */
export function QuestSelect({ value, options, onChange, ariaLabel, className }: QuestSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const selected = options.find((o) => o.value === value)

  const openList = () => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.bottom + 4, left: r.left, width: r.width })
    setOpen(true)
  }

  // Close on outside mousedown, Escape, scroll or resize. "Outside" = outside
  // the whole widget (trigger + popup): a mousedown on an option must NOT
  // close the list before the option's click event fires, or every option
  // click gets swallowed. Listener set only while open.
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onViewportChange = (e: Event) => {
      // The popup itself scrolls (its option list is overflow-y: auto) — a
      // capture-phase listener sees that scroll too, and closing on it would
      // make the list unscrollable. Only close when the scroll originates
      // OUTSIDE the widget (the drawer scrolls under the fixed popup).
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [open])

  // Re-measure on any layout shift while open so the list follows the trigger.
  useLayoutEffect(() => {
    if (!open) return
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [open, value])

  return (
    <div ref={rootRef} className="quest-select-root">
      <button
        type="button"
        className={`quest-select${className ? ` ${className}` : ''}`}
        onClick={() => (open ? setOpen(false) : openList())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="quest-select-label">{selected?.label ?? (value || '—')}</span>
        <ChevronDownIcon size={12} />
      </button>
      {open && rect && (
        <div
          className="quest-select-popup"
          role="listbox"
          style={{ top: rect.top, left: rect.left, minWidth: rect.width }}
        >
          {options.map((opt) => (
            <button
              type="button"
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`quest-select-option${opt.value === value ? ' selected' : ''}`}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
