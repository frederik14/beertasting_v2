import type { TastingStatus, TastingSummary } from '../lib/types'

type Props = {
  tastings: TastingSummary[]
  selectedTasting: TastingSummary | null
  loading: boolean
  onSelect: (tastingId: string) => void
  onManage: () => void
}

const statusLabel: Record<TastingStatus, string> = {
  draft: 'Draft',
  active: 'In progress',
  completed: 'Completed',
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

const formatDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
}

export function CurrentTastingBar({
  tastings,
  selectedTasting,
  loading,
  onSelect,
  onManage,
}: Props) {
  return (
    <section className="panel full-width current-tasting-bar">
      <div className="current-tasting-label">
        <p className="eyebrow">Current tasting</p>
        {selectedTasting ? (
          <span className={`status-badge status-${selectedTasting.status}`}>
            {statusLabel[selectedTasting.status]}
          </span>
        ) : null}
      </div>

      {tastings.length > 0 ? (
        <select
          className="current-tasting-select"
          aria-label="Choose tasting"
          value={selectedTasting?.id ?? ''}
          onChange={(event) => onSelect(event.target.value)}
        >
          {!selectedTasting ? (
            <option value="" disabled>
              Select a tasting…
            </option>
          ) : null}
          {tastings.map((tasting) => (
            <option key={tasting.id} value={tasting.id}>
              {tasting.title} ({formatDate(tasting.date)})
            </option>
          ))}
        </select>
      ) : (
        <div className="current-tasting-empty">
          <span className="muted">
            {loading ? 'Loading tastings…' : 'No tastings yet.'}
          </span>
          {!loading ? (
            <button
              type="button"
              className="secondary-button small-button"
              onClick={onManage}
            >
              Create a tasting
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}
