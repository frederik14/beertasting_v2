import type { RankedBeer, ScoreRow, TastingSnapshot } from './types'

const filterScores = (score: number | null) =>
  typeof score === 'number' && Number.isFinite(score)

export function averageScoreFromRow(row: ScoreRow): number {
  const values = [row.smell, row.color, row.branding, row.taste].filter(
    (value): value is number => filterScores(value),
  )

  if (values.length === 0) {
    return 0
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  return total / values.length
}

export function deriveTastingRankings(snapshot: TastingSnapshot): RankedBeer[] {
  const aggregated = new Map<string, { name: string; total: number; votes: number }>()

  for (const row of snapshot.rows) {
    const existing = aggregated.get(row.beerId) ?? {
      name:
        snapshot.beers.find((beer) => beer.id === row.beerId)?.name ?? 'Unknown beer',
      total: 0,
      votes: 0,
    }

    const average = averageScoreFromRow(row)
    existing.total += average
    existing.votes += 1
    aggregated.set(row.beerId, existing)
  }

  return [...aggregated.entries()]
    .map(([beerId, value]) => ({
      beerId,
      name: value.name,
      totalScore: value.total,
      averageScore: value.votes > 0 ? value.total / value.votes : 0,
      votes: value.votes,
    }))
    .sort((a, b) => b.averageScore - a.averageScore || b.totalScore - a.totalScore)
}

export function deriveTenantLeaderboard(snapshots: TastingSnapshot[]): RankedBeer[] {
  const byBeer = new Map<string, { name: string; total: number; votes: number }>()

  for (const snapshot of snapshots) {
    const ranking = deriveTastingRankings(snapshot)

    for (const entry of ranking) {
      const current = byBeer.get(entry.beerId) ?? {
        name: entry.name,
        total: 0,
        votes: 0,
      }

      current.total += entry.averageScore
      current.votes += entry.votes
      byBeer.set(entry.beerId, current)
    }
  }

  return [...byBeer.entries()]
    .map(([beerId, value]) => ({
      beerId,
      name: value.name,
      totalScore: value.total,
      averageScore: value.votes > 0 ? value.total / value.votes : 0,
      votes: value.votes,
    }))
    .sort((a, b) => b.averageScore - a.averageScore)
}
