import { useEffect, useMemo, useState } from 'react'
import { averageScoreFromRow } from '../lib/rankings'
import type {
  OverallRankedBeer,
  ScoreRow,
  TenantRankingData,
} from '../lib/types'

type Props = {
  beer: OverallRankedBeer
  data: TenantRankingData
  onClose: () => void
}

type DetailSortKey = 'taster' | 'tasting' | 'smell' | 'color' | 'branding' | 'taste' | 'score'
type SortDirection = 'asc' | 'desc'

type RatingDetail = {
  taster: string
  tastingTitle: string
  tastingDate: string
  smell: number
  color: number
  branding: number
  taste: number
  score: number
}

type SortHeaderProps = {
  label: string
  column: DetailSortKey
  numeric?: boolean
  activeSortKey: DetailSortKey
  sortDirection: SortDirection
  onSort: (key: DetailSortKey) => void
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

const formatDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
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

export function BeerRatingsDialog({ beer, data, onClose }: Props) {
  const [sortKey, setSortKey] = useState<DetailSortKey>('score')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const { details, incompleteCount } = useMemo(() => {
    const tastingById = new Map(data.tastings.map((tasting) => [tasting.id, tasting]))
    const participantById = new Map(
      data.participants.map((participant) => [participant.id, participant]),
    )
    const beerScores = data.scores.filter((score) => score.beerId === beer.beerId)
    const complete: RatingDetail[] = []

    for (const score of beerScores) {
      const tasting = tastingById.get(score.tastingId)
      const participant = participantById.get(score.participantId)
      if (!tasting || !participant) continue

      const row: ScoreRow = {
        participantId: score.participantId,
        beerId: score.beerId,
        smell: score.smell,
        color: score.color,
        branding: score.branding,
        taste: score.taste,
        notes: null,
        updatedAt: null,
      }
      const total = averageScoreFromRow(row)
      if (
        total === null ||
        row.smell === null ||
        row.color === null ||
        row.branding === null ||
        row.taste === null
      ) {
        continue
      }

      complete.push({
        taster: participant.displayName,
        tastingTitle: tasting.title,
        tastingDate: tasting.date,
        smell: row.smell,
        color: row.color,
        branding: row.branding,
        taste: row.taste,
        score: total,
      })
    }

    return {
      details: complete,
      incompleteCount: beerScores.length - complete.length,
    }
  }, [beer.beerId, data])

  const sortedDetails = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...details].sort((a, b) => {
      let result = 0

      switch (sortKey) {
        case 'taster':
          result = a.taster.localeCompare(b.taster)
          break
        case 'tasting':
          result = a.tastingDate.localeCompare(b.tastingDate)
          break
        case 'smell':
          result = a.smell - b.smell
          break
        case 'color':
          result = a.color - b.color
          break
        case 'branding':
          result = a.branding - b.branding
          break
        case 'taste':
          result = a.taste - b.taste
          break
        case 'score':
          result = a.score - b.score
          break
      }

      if (result === 0) {
        result = a.taster.localeCompare(b.taster)
      }

      return result * direction
    })
  }, [details, sortDirection, sortKey])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const handleSort = (key: DetailSortKey) => {
    if (sortKey === key) {
      setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection(key === 'taster' || key === 'tasting' ? 'asc' : 'desc')
  }

  const sortHeaderProps = {
    activeSortKey: sortKey,
    sortDirection,
    onSort: handleSort,
  }

  const meta = [beer.brewery, beer.style, beer.alcohol === null ? null : `${beer.alcohol}%`]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beer-ratings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">All ratings</p>
            <h2 id="beer-ratings-title">{beer.name}</h2>
            {meta ? <p className="beer-meta">{meta}</p> : null}
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close ratings"
            autoFocus
          >
            ×
          </button>
        </div>

        <p className="muted modal-summary">
          {details.length} complete rating{details.length === 1 ? '' : 's'} across
          tastings.
          {incompleteCount > 0
            ? ` ${incompleteCount} incomplete rating${
                incompleteCount === 1 ? ' is' : 's are'
              } not shown.`
            : ''}
        </p>

        {details.length === 0 ? (
          <p className="empty-state">No complete ratings for this beer.</p>
        ) : (
          <div className="modal-table-wrap">
            <table className="modal-table">
              <caption className="sr-only">
                All complete ratings for {beer.name}, across tastings.
              </caption>
              <thead>
                <tr>
                  <SortHeader {...sortHeaderProps} label="Taster" column="taster" />
                  <SortHeader
                    {...sortHeaderProps}
                    label="Score / 100"
                    column="score"
                    numeric
                  />
                  <SortHeader {...sortHeaderProps} label="Tasting" column="tasting" />
                  <SortHeader
                    {...sortHeaderProps}
                    label="Smell"
                    column="smell"
                    numeric
                  />
                  <SortHeader
                    {...sortHeaderProps}
                    label="Color"
                    column="color"
                    numeric
                  />
                  <SortHeader
                    {...sortHeaderProps}
                    label="Branding"
                    column="branding"
                    numeric
                  />
                  <SortHeader
                    {...sortHeaderProps}
                    label="Taste"
                    column="taste"
                    numeric
                  />
                </tr>
              </thead>
              <tbody>
                {sortedDetails.map((detail, index) => (
                  <tr key={`${detail.taster}:${detail.tastingTitle}:${index}`}>
                    <td>{detail.taster}</td>
                    <td className="average-cell">{detail.score.toFixed(1)}</td>
                    <td>
                      <strong>{detail.tastingTitle}</strong>
                      <span className="beer-meta">{formatDate(detail.tastingDate)}</span>
                    </td>
                    <td className="numeric">{detail.smell.toFixed(1)}</td>
                    <td className="numeric">{detail.color.toFixed(1)}</td>
                    <td className="numeric">{detail.branding.toFixed(1)}</td>
                    <td className="numeric">{detail.taste.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
