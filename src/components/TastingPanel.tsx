import { useState } from 'react'
import { formatError } from '../lib/api'
import type { TastingStatus, TastingSummary, TenantRole } from '../lib/types'
import { StatusBanner } from './StatusBanner'

type Props = {
  tastings: TastingSummary[]
  selectedTasting: TastingSummary | null
  role: TenantRole
  currentUserId: string
  loading: boolean
  onSelect: (tastingId: string) => void
  onCreate: (title: string, date: string) => Promise<void>
  onStatusChange: (status: TastingStatus) => Promise<void>
  onDelete: () => Promise<void>
}

const localToday = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
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

export function TastingPanel({
  tastings,
  selectedTasting,
  role,
  currentUserId,
  loading,
  onSelect,
  onCreate,
  onStatusChange,
  onDelete,
}: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(localToday)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const canManage =
    selectedTasting !== null &&
    (role === 'owner' || role === 'admin' || selectedTasting.hostUserId === currentUserId)

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('create')
    setError(null)
    setMessage(null)

    try {
      await onCreate(title, date)
      setTitle('')
      setDate(localToday())
      setMessage('Tasting created. You were added as the host participant.')
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(null)
    }
  }

  const handleStatus = async (status: TastingStatus) => {
    setBusy(`status-${status}`)
    setError(null)
    setMessage(null)

    try {
      await onStatusChange(status)
      setMessage(`Tasting marked as ${statusLabel[status].toLowerCase()}.`)
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this tasting and all of its scores? This cannot be undone.')) {
      return
    }

    setBusy('delete')
    setError(null)
    setMessage(null)

    try {
      await onDelete()
      setMessage('Tasting deleted.')
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel full-width">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Tasting setup</p>
          <h2>Tastings</h2>
        </div>
        {selectedTasting ? (
          <span className={`status-badge status-${selectedTasting.status}`}>
            {statusLabel[selectedTasting.status]}
          </span>
        ) : null}
      </div>

      {error ? (
        <StatusBanner tone="error" onDismiss={() => setError(null)}>
          {error}
        </StatusBanner>
      ) : null}
      {message ? (
        <StatusBanner tone="success" onDismiss={() => setMessage(null)}>
          {message}
        </StatusBanner>
      ) : null}

      <div className="tasting-grid">
        <div>
          <h3>Create a tasting</h3>
          <form className="stacked-form" onSubmit={handleCreate}>
            <label className="field-group">
              <span>Tasting title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Autumn tasting"
                maxLength={160}
                required
              />
            </label>

            <label className="field-group">
              <span>Tasting date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </label>

            <button type="submit" className="primary-button" disabled={busy !== null}>
              {busy === 'create' ? 'Creating…' : 'Create tasting'}
            </button>
          </form>
        </div>

        <div>
          <h3>Current tasting</h3>
          {tastings.length === 0 ? (
            <p className="empty-state" role="status">
              {loading ? 'Loading tastings…' : 'No tastings yet. Create the first one.'}
            </p>
          ) : (
            <div className="stacked-form">
              <label className="field-group">
                <span>Selected tasting</span>
                <select
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
              </label>

              {selectedTasting ? (
                <div className="control-row">
                  {selectedTasting.status === 'draft' ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy !== null || !canManage}
                      onClick={() => void handleStatus('active')}
                    >
                      {busy === 'status-active' ? 'Starting…' : 'Start tasting'}
                    </button>
                  ) : null}

                  {selectedTasting.status === 'active' ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy !== null || !canManage}
                      onClick={() => void handleStatus('completed')}
                    >
                      {busy === 'status-completed' ? 'Completing…' : 'Complete tasting'}
                    </button>
                  ) : null}

                  {selectedTasting.status === 'completed' ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy !== null || !canManage}
                      onClick={() => void handleStatus('active')}
                    >
                      {busy === 'status-active' ? 'Reopening…' : 'Reopen tasting'}
                    </button>
                  ) : null}

                  {canManage ? (
                    <button
                      type="button"
                      className="danger-button"
                      disabled={busy !== null}
                      onClick={() => void handleDelete()}
                    >
                      {busy === 'delete' ? 'Deleting…' : 'Delete tasting'}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {selectedTasting && !canManage ? (
                <p className="muted">
                  Only the host, an owner or an admin can change the tasting status.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
