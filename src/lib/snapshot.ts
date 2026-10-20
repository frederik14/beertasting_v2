import type {
  Beer,
  Participant,
  ScoreRow,
  TastingSnapshot,
  TastingSummary,
  Tenant,
} from './types'

export type BeerAssignment = {
  beerId: string
  position: number
}

export type SnapshotSource = {
  tenant: Tenant
  tasting: TastingSummary
  participants: Participant[]
  assignments: BeerAssignment[]
  beers: Beer[]
  scores: ScoreRow[]
}

/**
 * Builds the client-side snapshot from normalized rows.
 *
 * - Beers are ordered by their tasting position, not by database return order.
 * - Score rows for participants or beers that are not part of this tasting are
 *   dropped. The SQL schema also enforces this, but the client should not rely
 *   on a single layer for correctness.
 */
export function buildTastingSnapshot(source: SnapshotSource): TastingSnapshot {
  const participantIds = new Set(source.participants.map((participant) => participant.id))
  const beerById = new Map(source.beers.map((beer) => [beer.id, beer]))

  const beers = [...source.assignments]
    .sort((a, b) => a.position - b.position)
    .map((assignment) => beerById.get(assignment.beerId))
    .filter((beer): beer is Beer => Boolean(beer))

  const validBeerIds = new Set(beers.map((beer) => beer.id))

  const rows = source.scores.filter(
    (row) => participantIds.has(row.participantId) && validBeerIds.has(row.beerId),
  )

  return {
    tenant: source.tenant,
    tasting: source.tasting,
    participants: source.participants,
    beers,
    rows,
  }
}
