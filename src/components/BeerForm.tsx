import { useState } from 'react'
import { formatError } from '../lib/api'
import type { Beer } from '../lib/types'
import { StatusBanner } from './StatusBanner'

type Props = {
  beers: Beer[]
  onAdd: (beer: {
    name: string
    brewery: string | null
    style: string | null
    alcohol: number | null
  }) => Promise<void>
  onRemove: (beerId: string) => Promise<void>
  busy?: boolean
  readOnly?: boolean
}

const formatAlcohol = (alcohol: number | null) =>
  alcohol === null ? null : `${alcohol.toFixed(1)}%`

export function BeerForm({
  beers,
  onAdd,
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    let parsedAlcohol: number | null = null
    if (alcohol.trim() !== '') {
      parsedAlcohol = Number(alcohol)
      if (!Number.isFinite(parsedAlcohol) || parsedAlcohol < 0 || parsedAlcohol > 100) {
        setError('ABV must be a number between 0 and 100.')
        return
      }
    }

    setWorking(true)

    try {
      await onAdd({
        name,
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

  const handleRemove = async (beer: Beer) => {
    if (!window.confirm(`Remove ${beer.name} from this tasting? Its scores will also be removed.`)) {
      return
    }

    setWorking(true)
    setError(null)
    setMessage(null)

    try {
      await onRemove(beer.id)
      setMessage(`${beer.name} removed from the tasting.`)
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Beer catalog</p>
      <h2>Add a beer</h2>

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
          This tasting is completed. Reopen it to add or remove beers.
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

        <button type="submit" className="primary-button" disabled={working || busy}>
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

            return (
              <li key={beer.id} className="beer-row">
                <div>
                  <strong>{beer.name}</strong>
                  {meta ? <span className="beer-meta">{meta}</span> : null}
                </div>
                {!readOnly ? (
                  <button
                    type="button"
                    className="link-button danger-link"
                    disabled={working || busy}
                    onClick={() => void handleRemove(beer)}
                  >
                    Remove
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
