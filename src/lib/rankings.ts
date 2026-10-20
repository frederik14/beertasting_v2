import type {
  Beer,
  OverallRankedBeer,
  OverallRankingFilters,
  RankedBeer,
  ScoreCriterion,
  ScoreRow,
  TastingSnapshot,
  TenantRankingData,
} from './types'

export const SCORE_CRITERIA: readonly ScoreCriterion[] = [
  'smell',
  'color',
  'branding',
  'taste',
]

const isFiniteScore = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export function isCompleteScoreRow(row: ScoreRow): boolean {
  return SCORE_CRITERIA.every((criterion) => isFiniteScore(row[criterion]))
}

/**
 * A row counts only when all four criteria are present. Partial rows are
 * reported separately as "incomplete" instead of being treated as a zero
 * score or being averaged over a smaller denominator.
 *
 * A complete row is scored out of 100:
 *   smell + color + branding + taste, multiplied by 2.
 * Smell, color and branding are out of 10 each; taste is out of 20, so the raw
 * maximum is 50 and the doubled maximum is 100.
 *
 * Returns null for incomplete rows and for values outside those ranges.
 */
export function averageScoreFromRow(row: ScoreRow): number | null {
  if (!isCompleteScoreRow(row)) {
    return null
  }

  let total = 0
  for (const criterion of SCORE_CRITERIA) {
    const value = row[criterion]
    const maximum = criterion === 'taste' ? 20 : 10
    if (!isFiniteScore(value) || value < 0 || value > maximum) {
      return null
    }
    total += value
  }

  return total * 2
}

type Aggregate = {
  beer: Beer
  total: number
  votes: number
  incompleteVotes: number
}

const sameAverage = (a: number, b: number) => Math.abs(a - b) < 1e-9

/**
 * Derives a ranking from the complete rows in a tasting snapshot.
 *
 * Policy:
 * - Only complete rows (each criterion present; taste is out of 20) count as votes.
 * - A row score is the raw total multiplied by 2, so it is out of 100.
 * - Beers with no complete rows are included with `votes: 0`, `rank: null`.
 * - Ties share a rank; the next distinct average skips positions.
 * - Unrated beers are sorted last, then by name.
 */
export function deriveTastingRankings(snapshot: TastingSnapshot): RankedBeer[] {
  const aggregates = new Map<string, Aggregate>()

  for (const beer of snapshot.beers) {
    aggregates.set(beer.id, {
      beer,
      total: 0,
      votes: 0,
      incompleteVotes: 0,
    })
  }

  for (const row of snapshot.rows) {
    const aggregate = aggregates.get(row.beerId)
    if (!aggregate) {
      continue
    }

    const average = averageScoreFromRow(row)
    if (average === null) {
      aggregate.incompleteVotes += 1
      continue
    }

    aggregate.total += average
    aggregate.votes += 1
  }

  const sorted = [...aggregates.values()].sort((a, b) => {
    const aAverage = a.votes > 0 ? a.total / a.votes : null
    const bAverage = b.votes > 0 ? b.total / b.votes : null

    if (aAverage === null && bAverage === null) {
      return a.beer.name.localeCompare(b.beer.name)
    }
    if (aAverage === null) return 1
    if (bAverage === null) return -1
    if (!sameAverage(aAverage, bAverage)) return bAverage - aAverage
    if (a.votes !== b.votes) return b.votes - a.votes
    return a.beer.name.localeCompare(b.beer.name)
  })

  let previousAverage: number | null = null
  let previousRank = 0

  return sorted.map((aggregate, index) => {
    const averageScore = aggregate.votes > 0 ? aggregate.total / aggregate.votes : null
    let rank: number | null = null

    if (averageScore !== null) {
      if (previousAverage === null || !sameAverage(previousAverage, averageScore)) {
        previousRank = index + 1
        previousAverage = averageScore
      }
      rank = previousRank
    }

    return {
      beerId: aggregate.beer.id,
      name: aggregate.beer.name,
      brewery: aggregate.beer.brewery,
      style: aggregate.beer.style,
      rank,
      totalScore: aggregate.total,
      averageScore,
      votes: aggregate.votes,
      incompleteVotes: aggregate.incompleteVotes,
    }
  })
}

type OverallAggregate = {
  beer: Beer
  totalScore: number
  votes: number
  incompleteVotes: number
  totalSmell: number
  totalColor: number
  totalBranding: number
  totalTaste: number
  tastingIds: Set<string>
}

/**
 * Derives the tenant-wide beer ranking from every tasting in the group.
 *
 * The old app ranked all ratings globally by beer name. The catalog merges
 * beers by name per tenant, so grouping by beer id is equivalent. Filters are
 * applied row by row before aggregating, which makes the date/taster filters
 * behave predictably across tastings.
 *
 * Policy:
 * - Only complete rows count as votes, as in the per-tasting ranking.
 * - Scores are out of 100; the display value is the average of the row scores.
 * - Per-criterion columns are averages across the same complete rows.
 * - Beers with no complete rows are omitted; ties share a rank.
 * - The date filter uses the tasting date, not the score timestamp.
 */
export function deriveOverallRankings(
  data: TenantRankingData,
  filters: OverallRankingFilters = {},
): OverallRankedBeer[] {
  const tastingById = new Map(data.tastings.map((tasting) => [tasting.id, tasting]))
  const participantById = new Map(
    data.participants.map((participant) => [participant.id, participant]),
  )
  const beerById = new Map(data.beers.map((beer) => [beer.id, beer]))

  const from = filters.from || null
  const to = filters.to || null
  const participantNames = new Set(filters.participantNames ?? [])
  const style = filters.style?.trim() || null
  const search = filters.search?.trim().toLowerCase() ?? ''

  const aggregates = new Map<string, OverallAggregate>()

  for (const score of data.scores) {
    const tasting = tastingById.get(score.tastingId)
    const participant = participantById.get(score.participantId)
    const beer = beerById.get(score.beerId)

    if (!tasting || !participant || !beer) {
      continue
    }

    if (from && tasting.date < from) continue
    if (to && tasting.date > to) continue
    if (participantNames.size > 0 && !participantNames.has(participant.displayName)) {
      continue
    }
    if (style && (beer.style ?? '') !== style) continue

    if (search) {
      const haystack = `${beer.name} ${beer.brewery ?? ''} ${beer.style ?? ''}`.toLowerCase()
      if (!haystack.includes(search)) continue
    }

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

    let aggregate = aggregates.get(beer.id)
    if (!aggregate) {
      aggregate = {
        beer,
        totalScore: 0,
        votes: 0,
        incompleteVotes: 0,
        totalSmell: 0,
        totalColor: 0,
        totalBranding: 0,
        totalTaste: 0,
        tastingIds: new Set(),
      }
      aggregates.set(beer.id, aggregate)
    }

    const average = averageScoreFromRow(row)
    if (average === null) {
      aggregate.incompleteVotes += 1
      continue
    }

    if (
      row.smell === null ||
      row.color === null ||
      row.branding === null ||
      row.taste === null
    ) {
      continue
    }

    aggregate.totalScore += average
    aggregate.votes += 1
    aggregate.totalSmell += row.smell
    aggregate.totalColor += row.color
    aggregate.totalBranding += row.branding
    aggregate.totalTaste += row.taste
    aggregate.tastingIds.add(score.tastingId)
  }

  const sorted = [...aggregates.values()]
    .filter((aggregate) => aggregate.votes > 0)
    .sort((a, b) => {
      const aAverage = a.totalScore / a.votes
      const bAverage = b.totalScore / b.votes
      if (!sameAverage(aAverage, bAverage)) return bAverage - aAverage
      if (a.votes !== b.votes) return b.votes - a.votes
      return a.beer.name.localeCompare(b.beer.name)
    })

  let previousAverage: number | null = null
  let previousRank = 0

  return sorted.map((aggregate, index) => {
    const averageScore = aggregate.totalScore / aggregate.votes

    if (previousAverage === null || !sameAverage(previousAverage, averageScore)) {
      previousRank = index + 1
      previousAverage = averageScore
    }

    return {
      beerId: aggregate.beer.id,
      name: aggregate.beer.name,
      brewery: aggregate.beer.brewery,
      style: aggregate.beer.style,
      alcohol: aggregate.beer.alcohol,
      rank: previousRank,
      averageScore,
      votes: aggregate.votes,
      incompleteVotes: aggregate.incompleteVotes,
      averageSmell: aggregate.totalSmell / aggregate.votes,
      averageColor: aggregate.totalColor / aggregate.votes,
      averageBranding: aggregate.totalBranding / aggregate.votes,
      averageTaste: aggregate.totalTaste / aggregate.votes,
      tastingCount: aggregate.tastingIds.size,
    }
  })
}
