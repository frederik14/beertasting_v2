import type { TastingSnapshot, TastingStatus } from '../lib/types'
import type { RealtimeStatus, SnapshotStatus } from '../hooks/useTastingSnapshot'

type Props = {
  snapshot: TastingSnapshot
  snapshotStatus: SnapshotStatus
  realtimeStatus: RealtimeStatus
  lastError: string | null
}

const statusLabels: Record<TastingStatus, string> = {
  draft: 'Draft',
  active: 'In progress',
  completed: 'Completed',
}

const realtimeLabels: Record<RealtimeStatus, string> = {
  offline: 'Realtime offline',
  connecting: 'Realtime connecting',
  live: 'Realtime connected',
  error: 'Realtime interrupted',
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

const formatDate = (value: string) => {
  if (!value) return 'No date'
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
}

export function SnapshotSummary({
  snapshot,
  snapshotStatus,
  realtimeStatus,
  lastError,
}: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Current tasting</p>
          <h2>{snapshot.tasting.title}</h2>
        </div>
        <span className={`status-badge status-${snapshot.tasting.status}`}>
          {statusLabels[snapshot.tasting.status]}
        </span>
      </div>

      <p className="muted">{formatDate(snapshot.tasting.date)}</p>

      <div className="summary-grid">
        <div className="summary-item">
          <strong>{snapshot.participants.length}</strong>
          <span>participants</span>
        </div>
        <div className="summary-item">
          <strong>{snapshot.beers.length}</strong>
          <span>beers</span>
        </div>
        <div className="summary-item">
          <strong>{snapshot.rows.length}</strong>
          <span>score rows</span>
        </div>
      </div>

      <ul className="feature-list">
        <li>{realtimeLabels[realtimeStatus]}</li>
        <li>
          {snapshotStatus === 'error'
            ? 'Showing the last successful snapshot'
            : 'Snapshot loaded from Supabase'}
        </li>
        <li>Rankings are derived locally from normalized rows</li>
      </ul>

      {snapshotStatus === 'error' && lastError ? (
        <p className="status-text" role="status">
          {lastError}
        </p>
      ) : null}
    </section>
  )
}
