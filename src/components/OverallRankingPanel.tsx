import { useEffect, useMemo, useState } from 'react'
import { useTenantRanking } from '../hooks/useTenantRanking'
import { deriveOverallRankings } from '../lib/rankings'
import type { OverallRankedBeer } from '../lib/types'
import { BeerRatingsDialog } from './BeerRatingsDialog'
import { StatusBanner } from './StatusBanner'

const OVERALL_PAGE_SIZE = 50

type Props = {
  tenantId: string
  tenantName: string
  refreshSeed?: number
  active?: boolean
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

const COLUMN_DEFS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'rank', label: '#' },
  { key: 'name', label: 'Beer' },
  { key: 'style', label: 'Type' },
  { key: 'alcohol', label: 'ABV', numeric: true },
  { key: 'smell', label: 'Smell', numeric: true },
  { key: 'color', label: 'Color', numeric: true },
  { key: 'branding', label: 'Branding', numeric: true },
  { key: 'taste', label: 'Taste', numeric: true },
  { key: 'score', label: 'Score / 100', numeric: true },
  { key: 'votes', label: 'Votes', numeric: true },
  { key: 'tastings', label: 'Tastings', numeric: true },
]

const ALL_COLUMNS = COLUMN_DEFS.map((column) => column.key)
const MOBILE_COLUMNS: SortKey[] = ['rank', 'name', 'score']

const defaultColumns = (): Set<SortKey> => {
  const isMobile =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 760px)').matches

  return new Set(isMobile ? MOBILE_COLUMNS : ALL_COLUMNS)
}

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

export function OverallRankingPanel({
  tenantId,
  tenantName,
  refreshSeed = 0,
  active = true,
}: Props) {
  const [enabled, setEnabled] = useState(active)
  const { data, loading, error, refresh, clearError } = useTenantRanking(
    tenantId,
    refreshSeed,
    enabled,
    active,
  )

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [style, setStyle] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [visibleCount, setVisibleCount] = useState(OVERALL_PAGE_SIZE)
  const [visibleColumns, setVisibleColumns] = useState<Set<SortKey>>(defaultColumns)
  const [selectedBeer, setSelectedBeer] = useState<OverallRankedBeer | null>(null)

  const activeFilterCount =
    (from ? 1 : 0) +
    (to ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    (style ? 1 : 0) +
    (selectedParticipants.length > 0 ? 1 : 0)

  useEffect(() => {
    setVisibleCount(OVERALL_PAGE_SIZE)
  }, [from, to, search, style, selectedParticipants])

  useEffect(() => {
    if (active) setEnabled(true)
  }, [active])

  useEffect(() => {
    if (!active) setSelectedBeer(null)
  }, [active])

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

  const toggleColumn = (column: SortKey) => {
    const isVisible = visibleColumns.has(column)
    if (isVisible && visibleColumns.size === 1) return

    const next = new Set(visibleColumns)
    if (isVisible) {
      next.delete(column)
    } else {
      next.add(column)
    }
    setVisibleColumns(next)

    if (isVisible && sortKey === column) {
      const fallback = next.has('score') ? 'score' : next.has('name') ? 'name' : 'rank'
      setSortKey(fallback)
      setSortDirection(fallback === 'score' ? 'desc' : 'asc')
    }
  }

  const resetColumns = () => {
    setVisibleColumns(defaultColumns())
    setSortKey('score')
    setSortDirection('desc')
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

  const visibleRankings = sortedRankings.slice(0, visibleCount)

  return (
    <section className="panel full-width overall-ranking-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">All tastings</p>
          <h2>Overall beer ranking</h2>
        </div>
        <span className="panel-badge">
          {!enabled || (loading && !data) ? 'Loading…' : `${rankings.length} beers`}
        </span>
      </div>

      <details className="info-disclosure overall-ranking-info">
        <summary>How the ranking works</summary>
        <p className="muted">
          Every complete rating in {tenantName}, across all tastings. A row counts only
          when smell, color, branding and taste are all filled in. Scores are out of 100,
          with taste weighted double. Use Refresh to pick up other people's latest
          scores.
        </p>
      </details>

      {!enabled ? (
        <p className="empty-state overall-ranking-empty" role="status">
          Preparing the overall ranking…
        </p>
      ) : null}

      {enabled && error ? (
        <StatusBanner tone="warning" onDismiss={clearError}>
          {error}
        </StatusBanner>
      ) : null}

      {enabled ? (
        <details className="info-disclosure overall-filters-disclosure">
          <summary>
            Filters &amp; columns{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </summary>
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

        <fieldset className="column-picker">
          <legend>Columns</legend>
          <div className="column-grid">
            {COLUMN_DEFS.map((column) => {
              const checked = visibleColumns.has(column.key)

              return (
                <label className="checkbox-row" key={column.key}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={checked && visibleColumns.size === 1}
                    onChange={() => toggleColumn(column.key)}
                  />
                  <span>{column.label}</span>
                </label>
              )
            })}
          </div>
          <button type="button" className="link-button" onClick={resetColumns}>
            Use default columns
          </button>
        </fieldset>

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
        </details>
      ) : null}

      {enabled && loading && !data ? (
        <p className="empty-state overall-ranking-empty" role="status">
          <span className="spinner" aria-hidden="true" /> Loading all tastings…
        </p>
      ) : null}

      {enabled && !loading && !data ? (
        <p className="empty-state overall-ranking-empty">
          No ranking data is available for this group yet.
        </p>
      ) : null}

      {enabled && data && rankings.length === 0 ? (
        <p className="empty-state overall-ranking-empty">
          No complete scores match these filters.
        </p>
      ) : null}

      {enabled && rankings.length > 0 ? (
        <div
          className="overall-ranking-wrap"
          tabIndex={0}
          role="region"
          aria-label={`Overall beer ranking for ${tenantName}`}
        >
          <table
            className={`overall-ranking-table${visibleColumns.size <= 3 ? ' compact' : ''}`}
          >
            <caption className="sr-only">
              Overall beer ranking for {tenantName}, across all tastings. Only rows with
              all four criteria count. Scores are out of 100.
            </caption>
            <thead>
              <tr>
                {COLUMN_DEFS.filter((column) => visibleColumns.has(column.key)).map(
                  (column) => (
                    <SortHeader
                      key={column.key}
                      {...sortHeaderProps}
                      label={column.label}
                      column={column.key}
                      numeric={column.numeric}
                    />
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRankings.map((beer) => (
                <tr key={beer.beerId}>
                  {visibleColumns.has('rank') ? (
                    <td className="rank-cell">#{beer.rank}</td>
                  ) : null}
                  {visibleColumns.has('name') ? (
                    <td>
                      <button
                        type="button"
                        className="beer-name-button"
                        onClick={() => setSelectedBeer(beer)}
                        aria-label={`View all ratings for ${beer.name}`}
                      >
                        {beer.name}
                      </button>
                      {beer.brewery ? (
                        <span className="beer-meta">{beer.brewery}</span>
                      ) : null}
                    </td>
                  ) : null}
                  {visibleColumns.has('style') ? <td>{beer.style ?? '—'}</td> : null}
                  {visibleColumns.has('alcohol') ? (
                    <td className="numeric">
                      {beer.alcohol === null ? '—' : `${beer.alcohol}%`}
                    </td>
                  ) : null}
                  {visibleColumns.has('smell') ? (
                    <td className="numeric">{beer.averageSmell.toFixed(1)}</td>
                  ) : null}
                  {visibleColumns.has('color') ? (
                    <td className="numeric">{beer.averageColor.toFixed(1)}</td>
                  ) : null}
                  {visibleColumns.has('branding') ? (
                    <td className="numeric">{beer.averageBranding.toFixed(1)}</td>
                  ) : null}
                  {visibleColumns.has('taste') ? (
                    <td className="numeric">{beer.averageTaste.toFixed(1)}</td>
                  ) : null}
                  {visibleColumns.has('score') ? (
                    <td className="average-cell">{beer.averageScore.toFixed(1)}</td>
                  ) : null}
                  {visibleColumns.has('votes') ? (
                    <td className="numeric">
                      {beer.votes}
                      {beer.incompleteVotes > 0 ? (
                        <span className="beer-meta">
                          {beer.incompleteVotes} incomplete
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                  {visibleColumns.has('tastings') ? (
                    <td className="numeric">{beer.tastingCount}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {enabled && rankings.length > visibleRankings.length ? (
        <div className="ranking-more">
          <span className="beer-meta">
            Showing {visibleRankings.length} of {rankings.length} beers
          </span>
          <div className="control-row">
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => setVisibleCount((count) => count + OVERALL_PAGE_SIZE)}
            >
              Show {OVERALL_PAGE_SIZE} more
            </button>
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => setVisibleCount(rankings.length)}
            >
              Show all
            </button>
          </div>
        </div>
      ) : null}

      {selectedBeer && data ? (
        <BeerRatingsDialog
          beer={selectedBeer}
          data={data}
          onClose={() => setSelectedBeer(null)}
        />
      ) : null}
    </section>
  )
}
