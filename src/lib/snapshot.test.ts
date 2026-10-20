import { describe, expect, it } from 'vitest'
import { buildTastingSnapshot } from './snapshot'
import type { Beer, Participant, ScoreRow } from './types'

const tenant = { id: 'tenant-1', name: 'Test Group', slug: 'test-group' }
const tasting = {
  id: 'tasting-1',
  tenantId: 'tenant-1',
  hostUserId: 'user-1',
  title: 'Test Tasting',
  status: 'active' as const,
  date: '2026-10-20',
  createdAt: '2026-10-20T00:00:00Z',
}

const participants: Participant[] = [
  { id: 'p-1', displayName: 'A', userId: 'user-1', isHost: true },
  { id: 'p-2', displayName: 'B', userId: null, isHost: false },
]

const beers: Beer[] = [
  { id: 'beer-1', name: 'One', brewery: null, style: null, alcohol: null },
  { id: 'beer-2', name: 'Two', brewery: null, style: null, alcohol: null },
  { id: 'beer-3', name: 'Three', brewery: null, style: null, alcohol: null },
]

const score = (
  participantId: string,
  beerId: string,
): ScoreRow => ({
  participantId,
  beerId,
  smell: 8,
  color: 8,
  branding: 8,
  taste: 8,
  notes: null,
  updatedAt: '2026-10-20T00:00:00Z',
})

describe('buildTastingSnapshot', () => {
  it('orders beers by tasting position rather than database return order', () => {
    const snapshot = buildTastingSnapshot({
      tenant,
      tasting,
      participants,
      beers: [beers[2]!, beers[0]!, beers[1]!],
      assignments: [
        { beerId: 'beer-2', position: 1 },
        { beerId: 'beer-3', position: 2 },
        { beerId: 'beer-1', position: 3 },
      ],
      scores: [],
    })

    expect(snapshot.beers.map((beer) => beer.id)).toEqual([
      'beer-2',
      'beer-3',
      'beer-1',
    ])
  })

  it('drops scores for participants or beers outside this tasting', () => {
    const snapshot = buildTastingSnapshot({
      tenant,
      tasting,
      participants,
      beers,
      assignments: [{ beerId: 'beer-1', position: 1 }],
      scores: [
        score('p-1', 'beer-1'),
        score('p-2', 'beer-2'),
        score('p-unknown', 'beer-1'),
      ],
    })

    expect(snapshot.rows).toHaveLength(1)
    expect(snapshot.rows[0]?.participantId).toBe('p-1')
    expect(snapshot.rows[0]?.beerId).toBe('beer-1')
  })

  it('drops assignments whose beer no longer exists', () => {
    const snapshot = buildTastingSnapshot({
      tenant,
      tasting,
      participants,
      beers: [beers[0]!],
      assignments: [
        { beerId: 'beer-1', position: 1 },
        { beerId: 'beer-missing', position: 2 },
      ],
      scores: [],
    })

    expect(snapshot.beers.map((beer) => beer.id)).toEqual(['beer-1'])
  })
})
