import { useCallback, useState } from 'react'
import { usePackHealth } from './PackHealthProvider'
import type { HealthItem, HealthSection } from '../../core/pack-health/types'

/** Cap on rendered per-section findings so a KubeJS-heavy released pack cannot
 * wallpaper the panel; the section count badge still shows the true total. */
const MAX_RENDERED_ITEMS = 25

function copyText(text: string): void {
  // eslint-disable-next-line no-console
  navigator.clipboard?.writeText(text).catch((e) => console.error('Copy failed:', e))
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(() => {
    copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }, [text])
  return (
    <button
      className="health-copy"
      type="button"
      aria-label={label}
      title={copied ? 'Copied' : 'Copy'}
      onClick={onCopy}
    >
      {copied ? '✓' : '⧉'}
    </button>
  )
}

function HealthItemRow({ item }: { item: HealthItem }) {
  return (
    <li className={`health-item health-item--${item.severity}`}>
      <span className="health-item-badge" aria-hidden="true" />
      <div className="health-item-body">
        <div className="health-item-message">{item.message}</div>
        {item.detail && <div className="health-item-detail">{item.detail}</div>}
      </div>
      <CopyButton text={item.copyText} label={`Copy ${item.severity} text`} />
    </li>
  )
}

function HealthSectionBlock({ section }: { section: HealthSection }) {
  const blocking = section.items.filter((i) => i.severity === 'blocking').length
  const recommended = section.items.filter((i) => i.severity === 'recommended').length
  return (
    <section className="health-section" aria-label={`${section.label} health`}>
      <header className="health-section-header">
        <h3>{section.label}</h3>
        <div className="health-section-counts">
          {blocking > 0 && <span className="health-count health-count--blocking">{blocking} blocking</span>}
          {recommended > 0 && <span className="health-count health-count--recommended">{recommended} recommended</span>}
          {section.items.length === 0 && <span className="health-count health-count--ok">All clear</span>}
        </div>
      </header>
      {section.items.length > 0 && (
        <>
          <ul className="health-items">
            {section.items.slice(0, MAX_RENDERED_ITEMS).map((item) => (
              <HealthItemRow key={item.id} item={item} />
            ))}
          </ul>
          {section.items.length > MAX_RENDERED_ITEMS && (
            <div className="health-items-more">
              …and {section.items.length - MAX_RENDERED_ITEMS} more. The count above is the true total.
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Persistent go/no-go surface (Project Bible §9). Renders the derived report —
 * never rescans, never blocks on I/O. */
export function PackHealthTab() {
  const { report } = usePackHealth()

  return (
    <div className="pack-health" role="region" aria-label="Pack Health">
      <header className="health-verdict">
        <h2>
          <span className={`health-verdict-badge ${report.go ? 'health-verdict--go' : 'health-verdict--blocked'}`}>
            {report.go ? 'Ready to test' : 'Blocking issues found'}
          </span>
        </h2>
        <p className="health-verdict-copy">
          {report.go
            ? 'No blocking problems found. Boot time is reserved for runtime-only surprises.'
            : `${report.blockingCount} problem${report.blockingCount === 1 ? '' : 's'} must be fixed before this pack is safe to launch.`}
        </p>
        <div className="health-verdict-counts">
          <span className="health-count health-count--blocking">{report.blockingCount} blocking</span>
          <span className="health-count health-count--recommended">{report.recommendedCount} recommended</span>
          <span className="health-count health-count--optional">{report.optionalCount} optional</span>
        </div>
        <p className="health-verdict-stats">
          Item registry: {report.stats.indexedItems} indexed
          {report.stats.itemCoverage !== null
            ? ` · ${Math.round(report.stats.itemCoverage * 100)}% of referenced items matched`
            : ' · no item references to check'}
        </p>
      </header>

      <div className="health-sections">
        {report.sections.map((section) => (
          <HealthSectionBlock key={section.key} section={section} />
        ))}
      </div>
    </div>
  )
}
