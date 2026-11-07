import { useState } from 'react'
import { formatError } from '../lib/api'
import type { Beer } from '../lib/types'
import { StatusBanner } from './StatusBanner'

type BeerInput = {
  name: string
  brewery: string | null
  style: string | null
  alcohol: number | null
}

type Props = {
  beers: Beer[]
  onAdd: (beer: BeerInput) => Promise<void>
  onEdit: (beerId: string, beer: BeerInput) => Promise<void>
  onRemove: (beerId: string) => Promise<void>
  busy?: boolean
  readOnly?: boolean
}

const formatAlcohol = (alcohol: number | null) =>
  alcohol === null ? null : `${alcohol.toFixed(1)}%`

const parseAlcohol = (
  value: string,
  setError: (message: string | null) => void,
): number | null => {
  if (value.trim() === '') return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    setError('ABV must be a number between 0 and 100.')
    return null
  }
  return parsed
}

export function BeerForm({
  beers,
  onAdd,
  onEdit,
  onRemove,
  busy = false,
  readOnly = false,
}: Props) {
  const [name, setName] = useState('')
  const [brewery, setBrewery] = useState('')
  const [style, setStyle] = useState('')
  const [alcohol, setAlcohol] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBrewery, setEditBrewery] = useState('')
  const [editStyle, setEditStyle] = useState('')
  const [editAlcohol, setEditAlcohol] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const parsedAlcohol = parseAlcohol(alcohol, setError)
    if (parsedAlcohol === null && alcohol.trim() !== '') return
    if (!name.trim()) {
      setError('Beer name is required.')
      return
    }

    setWorking(true)

    try {
      await onAdd({
        name: name.trim(),
        brewery: brewery.trim() || null,
        style: style.trim() || null,
        alcohol: parsedAlcohol,
      })
      setName('')
      setBrewery('')
      setStyle('')
      setAlcohol('')
      setMessage('Beer added to the tasting.')
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setWorking(false)
    }
  }

  const startEdit = (beer: Beer) => {
    setEditId(beer.id)
    setEditName(beer.name)
    setEditBrewery(beer.brewery ?? '')
    setEditStyle(beer.style ?? '')
    setEditAlcohol(beer.alcohol === null ? '' : String(beer.alcohol))
    setError(null)
    setMessage(null)
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditName('')
    setEditBrewery('')
    setEditStyle('')
    setEditAlcohol('')
  }

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editId) return

    setError(null)
    setMessage(null)

    const parsedAlcohol = parseAlcohol(editAlcohol, setError)
    if (parsedAlcohol === null && editAlcohol.trim() !== '') return
    if (!editName.trim()) {
      setError('Beer name is required.')
      return
    }

    setSavingEdit(true)

    try {
      await onEdit(editId, {
        name: editName.trim(),
        brewery: editBrewery.trim() || null,
        style: editStyle.trim() || null,
        alcohol: parsedAlcohol,
      })
      setMessage('Beer updated. Its scores were kept.')
      cancelEdit()
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setSavingEdit(false)
    }
  }

  const handleRemove = async (beer: Beer) => {
    if (
      !window.confirm(
        `Remove ${beer.name} from this tasting? This permanently deletes all scores for this beer in this tasting.`,
      )
    ) {
      return
    }

    setWorking(true)
    setError(null)
    setMessage(null)

    try {
      await onRemove(beer.id)
      setMessage(`${beer.name} removed from the tasting.`)
      cancelEdit()
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Beer catalog</p>
      <h2>Add or edit beers</h2>

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

      {readOnly ? (
        <p className="empty-state" role="status">
          This tasting is completed. Reopen it to add or edit beers.
        </p>
      ) : (
        <form className="stacked-form" onSubmit={handleSubmit}>
          <label className="field-group">
            <span>Beer name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Black Horizon"
              maxLength={120}
              required
            />
          </label>

          <label className="field-group">
            <span>Brewery</span>
            <input
              type="text"
              value={brewery}
              onChange={(event) => setBrewery(event.target.value)}
              placeholder="Northside"
              maxLength={120}
            />
          </label>

          <label className="field-group">
            <span>Style</span>
            <input
              type="text"
              value={style}
              onChange={(event) => setStyle(event.target.value)}
              placeholder="Stout"
              maxLength={120}
            />
          </label>

          <label className="field-group">
            <span>ABV (%)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={alcohol}
              onChange={(event) => setAlcohol(event.target.value)}
              placeholder="8.2"
            />
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={working || busy}
          >
            {working ? 'Adding…' : 'Add beer'}
          </button>
        </form>
      )}

      {beers.length === 0 ? (
        <p className="empty-state" role="status">
          No beers in this tasting yet.
        </p>
      ) : (
        <ul className="beer-list">
          {beers.map((beer) => {
            const meta = [beer.brewery, beer.style, formatAlcohol(beer.alcohol)]
              .filter(Boolean)
              .join(' · ')

            if (editId === beer.id) {
              return (
                <li key={beer.id} className="beer-row is-editing">
                  <form className="stacked-form beer-edit-form" onSubmit={handleEditSubmit}>
                    <p className="beer-meta">
                      Changes update this beer in every tasting in this group. Its
                      scores stay attached.
                    </p>

                    <label className="field-group">
                      <span>Beer name</span>
                      <input
                        type="text"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        maxLength={120}
                        required
                      />
                    </label>

                    <label className="field-group">
                      <span>Brewery</span>
                      <input
                        type="text"
                        value={editBrewery}
                        onChange={(event) => setEditBrewery(event.target.value)}
                        maxLength={120}
                      />
                    </label>

                    <label className="field-group">
                      <span>Style</span>
                      <input
                        type="text"
                        value={editStyle}
                        onChange={(event) => setEditStyle(event.target.value)}
                        maxLength={120}
                      />
                    </label>

                    <label className="field-group">
                      <span>ABV (%)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={editAlcohol}
                        onChange={(event) => setEditAlcohol(event.target.value)}
                      />
                    </label>

                    <div className="beer-edit-actions">
                      <button
                        type="submit"
                        className="primary-button small-button"
                        disabled={savingEdit || working || busy}
                      >
                        {savingEdit ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        className="secondary-button small-button"
                        disabled={savingEdit || working}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="danger-button small-button"
                        disabled={savingEdit || working || busy}
                        onClick={() => void handleRemove(beer)}
                      >
                        Remove from tasting…
                      </button>
                    </div>
                  </form>
                </li>
              )
            }

            return (
              <li key={beer.id} className="beer-row">
                <div>
                  <strong>{beer.name}</strong>
                  {meta ? <span className="beer-meta">{meta}</span> : null}
                </div>
                {!readOnly ? (
                  <button
                    type="button"
                    className="link-button"
                    disabled={working || busy || savingEdit}
                    onClick={() => startEdit(beer)}
                  >
                    Edit
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
