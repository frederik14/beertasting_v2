import { useMemo, useState } from 'react'
import { useTenantRanking } from '../hooks/useTenantRanking'
import { deriveOverallRankings } from '../lib/rankings'
import { StatusBanner } from './StatusBanner'

type Props = {
  tenantId: string
  tenantName: string
  refreshSeed?: number
}

type SortKey =
  | 'rank'
  | 'name'
  | 'style'
  | 'alcohol'
  | 'smell'
  | 'color'
  | 'branding'
  | 'taste'
  | 'score'
  | 'votes'
  | 'tastings'

type SortDirection = 'asc' | 'desc'

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type SortHeaderProps = {
  label: string
  column: SortKey
  numeric?: boolean
  activeSortKey: SortKey
  sortDirection: SortDirection
  onSort: (key: SortKey) => void
}

function SortHeader({
  label,
  column,
  numeric = false,
  activeSortKey,
  sortDirection,
  onSort,
}: SortHeaderProps) {
  const ariaSort =
    activeSortKey !== column
      ? 'none'
      : sortDirection === 'asc'
        ? 'ascending'
        : 'descending'

  return (
    <th scope="col" className={numeric ? 'numeric' : undefined} aria-sort={ariaSort}>
      <button
        type="button"
        className={`sort-button${numeric ? ' numeric' : ''}`}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span aria-hidden="true">
          {activeSortKey === column ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  )
}

export function OverallRankingPanel({ tenantId, tenantName, refreshSeed = 0 }: Props) {
  const { data, loading, error, refresh, clearError } = useTenantRanking(
    tenantId,
    refreshSeed,
  )

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [style, setStyle] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const participantNames = useMemo(() => {
    const names = new Set((data?.participants ?? []).map((participant) => participant.displayName))
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [data])

  const styles = useMemo(() => {
    const values = new Set(
      (data?.beers ?? [])
        .map((beer) => beer.style)
        .filter((value): value is string => Boolean(value)),
    )
    return [...values].sort((a, b) => a.localeCompare(b))
  }, [data])

  const rankings = useMemo(
    () =>
      data
        ? deriveOverallRankings(data, {
            from: from || null,
            to: to || null,
            participantNames: selectedParticipants,
            style: style || null,
            search,
          })
        : [],
    [data, from, to, selectedParticipants, style, search],
  )

  const sortedRankings = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    const compareNullable = (a: number | null, b: number | null): number => {
      if (a === null && b === null) return 0
      if (a === null) return 1
      if (b === null) return -1
      return (a - b) * direction
    }

    return [...rankings].sort((a, b) => {
      switch (sortKey) {
        case 'rank': {
          const result = (a.rank - b.rank) * direction
          return result || a.name.localeCompare(b.name)
        }
        case 'name': {
          const result = a.name.localeCompare(b.name) * direction
          return result || a.rank - b.rank
        }
        case 'style': {
          if (!a.style && !b.style) return a.rank - b.rank
          if (!a.style) return 1
          if (!b.style) return -1
          const result = a.style.localeCompare(b.style) * direction
          return result || a.rank - b.rank
        }
        case 'alcohol': {
          const result = compareNullable(a.alcohol, b.alcohol)
          return result || a.rank - b.rank
        }
        case 'smell':
        case 'color':
        case 'branding':
        case 'taste':
        case 'score': {
          const aValue =
            sortKey === 'smell'
              ? a.averageSmell
              : sortKey === 'color'
                ? a.averageColor
                : sortKey === 'branding'
                  ? a.averageBranding
                  : sortKey === 'taste'
                    ? a.averageTaste
                    : a.averageScore
          const bValue =
            sortKey === 'smell'
              ? b.averageSmell
              : sortKey === 'color'
                ? b.averageColor
                : sortKey === 'branding'
                  ? b.averageBranding
                  : sortKey === 'taste'
                    ? b.averageTaste
                    : b.averageScore
          const result = (aValue - bValue) * direction
          return result || a.rank - b.rank
        }
        case 'votes': {
          const result = (a.votes - b.votes) * direction
          return result || a.rank - b.rank
        }
        case 'tastings': {
          const result = (a.tastingCount - b.tastingCount) * direction
          return result || a.rank - b.rank
        }
      }
    })
  }, [rankings, sortKey, sortDirection])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(
      key === 'name' || key === 'style' || key === 'rank' ? 'asc' : 'desc',
    )
  }

  const toggleParticipant = (name: string) => {
    setSelectedParticipants((previous) =>
      previous.includes(name)
        ? previous.filter((value) => value !== name)
        : [...previous, name],
    )
  }

  const resetFilters = () => {
    setFrom('')
    setTo('')
    setSearch('')
    setStyle('')
    setSelectedParticipants([])
  }

  const applyLastWeek = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 6)
    setFrom(toIsoDate(start))
    setTo(toIsoDate(end))
  }

  const sortHeaderProps = {
    activeSortKey: sortKey,
    sortDirection,
    onSort: handleSort,
  }

  return (
    <section className="panel full-width overall-ranking-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">All tastings</p>
          <h2>Overall beer ranking</h2>
        </div>
        <span className="panel-badge">
          {loading && !data ? 'Loading…' : `${rankings.length} beers`}
        </span>
      </div>

      <p className="muted overall-ranking-intro">
        Every complete rating in {tenantName}, across all tastings. A row counts only
        when smell, color, branding and taste are all filled in. Scores are out of 100,
        with taste weighted double. Use Refresh to pick up other people's latest scores.
      </p>

      {error ? (
        <StatusBanner tone="warning" onDismiss={clearError}>
          {error}
        </StatusBanner>
      ) : null}

      <div className="overall-filters">
        <label className="field-group">
          <span>From tasting date</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>

        <label className="field-group">
          <span>To tasting date</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>

        <label className="field-group">
          <span>Search</span>
          <input
            type="search"
            value={search}
            placeholder="Beer, brewery or type"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label className="field-group">
          <span>Type</span>
          <select value={style} onChange={(event) => setStyle(event.target.value)}>
            <option value="">All types</option>
            {styles.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <details className="taster-filter">
          <summary>
            Tasters{' '}
            {selectedParticipants.length > 0
              ? `(${selectedParticipants.length} selected)`
              : '(all)'}
          </summary>
          <div className="taster-grid">
            {participantNames.map((name) => (
              <label className="checkbox-row" key={name}>
                <input
                  type="checkbox"
                  checked={selectedParticipants.includes(name)}
                  onChange={() => toggleParticipant(name)}
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
          {selectedParticipants.length > 0 ? (
            <button
              type="button"
              className="link-button"
              onClick={() => setSelectedParticipants([])}
            >
              Select all tasters
            </button>
          ) : null}
        </details>

        <div className="overall-filter-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="secondary-button" onClick={applyLastWeek}>
            Last 7 days
          </button>
          <button type="button" className="secondary-button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="empty-state overall-ranking-empty" role="status">
          <span className="spinner" aria-hidden="true" /> Loading all tastings…
        </p>
      ) : null}

      {!loading && !data ? (
        <p className="empty-state overall-ranking-empty">
          No ranking data is available for this group yet.
        </p>
      ) : null}

      {data && rankings.length === 0 ? (
        <p className="empty-state overall-ranking-empty">
          No complete scores match these filters.
        </p>
      ) : null}

      {rankings.length > 0 ? (
        <div
          className="overall-ranking-wrap"
          tabIndex={0}
          role="region"
          aria-label={`Overall beer ranking for ${tenantName}`}
        >
          <table className="overall-ranking-table">
            <caption className="sr-only">
              Overall beer ranking for {tenantName}, across all tastings. Only rows with
              all four criteria count. Scores are out of 100.
            </caption>
            <thead>
              <tr>
                <SortHeader {...sortHeaderProps} label="#" column="rank" />
                <SortHeader {...sortHeaderProps} label="Beer" column="name" />
                <SortHeader {...sortHeaderProps} label="Type" column="style" />
                <SortHeader {...sortHeaderProps} label="ABV" column="alcohol" numeric />
                <SortHeader {...sortHeaderProps} label="Smell" column="smell" numeric />
                <SortHeader {...sortHeaderProps} label="Color" column="color" numeric />
                <SortHeader
                  {...sortHeaderProps}
                  label="Branding"
                  column="branding"
                  numeric
                />
                <SortHeader {...sortHeaderProps} label="Taste" column="taste" numeric />
                <SortHeader
                  {...sortHeaderProps}
                  label="Score / 100"
                  column="score"
                  numeric
                />
                <SortHeader {...sortHeaderProps} label="Votes" column="votes" numeric />
                <SortHeader
                  {...sortHeaderProps}
                  label="Tastings"
                  column="tastings"
                  numeric
                />
              </tr>
            </thead>
            <tbody>
              {sortedRankings.map((beer) => (
                <tr key={beer.beerId}>
                  <td className="rank-cell">#{beer.rank}</td>
                  <td>
                    <strong>{beer.name}</strong>
                    {beer.brewery ? <span className="beer-meta">{beer.brewery}</span> : null}
                  </td>
                  <td>{beer.style ?? '—'}</td>
                  <td className="numeric">
                    {beer.alcohol === null ? '—' : `${beer.alcohol}%`}
                  </td>
                  <td className="numeric">{beer.averageSmell.toFixed(1)}</td>
                  <td className="numeric">{beer.averageColor.toFixed(1)}</td>
                  <td className="numeric">{beer.averageBranding.toFixed(1)}</td>
                  <td className="numeric">{beer.averageTaste.toFixed(1)}</td>
                  <td className="average-cell">{beer.averageScore.toFixed(1)}</td>
                  <td className="numeric">
                    {beer.votes}
                    {beer.incompleteVotes > 0 ? (
                      <span className="beer-meta">{beer.incompleteVotes} incomplete</span>
                    ) : null}
                  </td>
                  <td className="numeric">{beer.tastingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
