import { describe, expect, it } from 'vitest'
import {
  averageScoreFromRow,
  deriveOverallRankings,
  deriveTastingRankings,
  isCompleteScoreRow,
} from './rankings'
import type {
  ScoreRow,
  TastingSnapshot,
  TenantRankingData,
  TenantRankingScore,
} from './types'

const row = (overrides: Partial<ScoreRow> & Pick<ScoreRow, 'participantId' | 'beerId'>): ScoreRow => ({
  smell: null,
  color: null,
  branding: null,
  taste: null,
  notes: null,
  updatedAt: null,
  ...overrides,
})

const snapshot = (rows: ScoreRow[]): TastingSnapshot => ({
  tenant: { id: 'tenant-1', name: 'Test Group', slug: 'test-group' },
  tasting: {
    id: 'tasting-1',
    tenantId: 'tenant-1',
    hostUserId: 'user-1',
    title: 'Test Tasting',
    status: 'active',
    date: '2026-10-20',
    createdAt: '2026-10-20T00:00:00Z',
  },
  participants: [
    { id: 'p-1', displayName: 'A', userId: 'user-1', isHost: true },
    { id: 'p-2', displayName: 'B', userId: null, isHost: false },
  ],
  beers: [
    { id: 'beer-1', name: 'Beer One', brewery: null, style: null, alcohol: null },
    { id: 'beer-2', name: 'Beer Two', brewery: null, style: null, alcohol: null },
    { id: 'beer-3', name: 'Beer Three', brewery: null, style: null, alcohol: null },
  ],
  rows,
})

describe('averageScoreFromRow', () => {
  it('scores a complete row out of 100 with taste weighted double', () => {
    expect(
      averageScoreFromRow(
        row({
          participantId: 'p-1',
          beerId: 'beer-1',
          smell: 8,
          color: 9,
          branding: 7,
          taste: 10,
        }),
      ),
    ).toBe(68)
  })

  it('returns null for a partial row instead of averaging over a smaller denominator', () => {
    expect(
      averageScoreFromRow(
        row({
          participantId: 'p-1',
          beerId: 'beer-1',
          taste: 10,
        }),
      ),
    ).toBeNull()
  })

  it('returns null for a notes-only row', () => {
    expect(
      averageScoreFromRow(
        row({
          participantId: 'p-1',
          beerId: 'beer-1',
          notes: 'Banana and clove.',
        }),
      ),
    ).toBeNull()
  })

  it('rejects values above the per-criterion maximum', () => {
    expect(
      averageScoreFromRow(
        row({
          participantId: 'p-1',
          beerId: 'beer-1',
          smell: 11,
          color: 8,
          branding: 8,
          taste: 8,
        }),
      ),
    ).toBeNull()
  })

  it('allows taste up to 20 and rejects taste above 20', () => {
    const base = {
      participantId: 'p-1',
      beerId: 'beer-1',
      smell: 10,
      color: 10,
      branding: 10,
    }

    expect(averageScoreFromRow(row({ ...base, taste: 20 }))).toBe(100)
    expect(averageScoreFromRow(row({ ...base, taste: 21 }))).toBeNull()
  })

  it('isCompleteScoreRow requires all four finite values', () => {
    const base = {
      participantId: 'p-1',
      beerId: 'beer-1',
      smell: 8,
      color: 8,
      branding: 8,
      taste: 8,
    }
    expect(isCompleteScoreRow(row(base))).toBe(true)
    expect(isCompleteScoreRow(row({ ...base, taste: null }))).toBe(false)
    expect(isCompleteScoreRow(row({ ...base, taste: Number.NaN }))).toBe(false)
  })
})

describe('deriveTastingRankings', () => {
  it('counts only complete rows and excludes notes-only rows from votes', () => {
    const rankings = deriveTastingRankings(
      snapshot([
        row({
          participantId: 'p-1',
          beerId: 'beer-1',
          smell: 10,
          color: 10,
          branding: 10,
          taste: 10,
        }),
        row({ participantId: 'p-2', beerId: 'beer-1', notes: 'Only a note' }),
        row({
          participantId: 'p-2',
          beerId: 'beer-2',
          smell: 6,
          color: 6,
          branding: 6,
          taste: 6,
        }),
      ]),
    )

    const beerOne = rankings.find((entry) => entry.beerId === 'beer-1')
    const beerTwo = rankings.find((entry) => entry.beerId === 'beer-2')

    expect(beerOne?.votes).toBe(1)
    expect(beerOne?.incompleteVotes).toBe(1)
    expect(beerOne?.averageScore).toBe(80)
    expect(beerTwo?.votes).toBe(1)
    expect(beerTwo?.averageScore).toBe(48)
  })

  it('includes beers with no scores as unranked', () => {
    const rankings = deriveTastingRankings(
      snapshot([
        row({
          participantId: 'p-1',
          beerId: 'beer-1',
          smell: 8,
          color: 8,
          branding: 8,
          taste: 8,
        }),
      ]),
    )

    const unranked = rankings.find((entry) => entry.beerId === 'beer-2')
    expect(unranked?.votes).toBe(0)
    expect(unranked?.averageScore).toBeNull()
    expect(unranked?.rank).toBeNull()
  })

  it('shares ranks for tied averages and skips the next position', () => {
    const rankings = deriveTastingRankings(
      snapshot([
        row({
          participantId: 'p-1',
          beerId: 'beer-1',
          smell: 8,
          color: 8,
          branding: 8,
          taste: 8,
        }),
        row({
          participantId: 'p-1',
          beerId: 'beer-2',
          smell: 8,
          color: 8,
          branding: 8,
          taste: 8,
        }),
        row({
          participantId: 'p-1',
          beerId: 'beer-3',
          smell: 6,
          color: 6,
          branding: 6,
          taste: 6,
        }),
      ]),
    )

    expect(rankings.map((entry) => entry.rank)).toEqual([1, 1, 3])
  })

  it('ignores score rows for beers that are not in the snapshot', () => {
    const rankings = deriveTastingRankings(
      snapshot([
        row({
          participantId: 'p-1',
          beerId: 'beer-unknown',
          smell: 10,
          color: 10,
          branding: 10,
          taste: 10,
        }),
      ]),
    )

    expect(rankings).toHaveLength(3)
    expect(rankings.every((entry) => entry.beerId !== 'beer-unknown')).toBe(true)
  })
})

const overallScore = (
  overrides: Partial<TenantRankingScore> &
    Pick<TenantRankingScore, 'tastingId' | 'participantId' | 'beerId'>,
): TenantRankingScore => ({
  smell: null,
  color: null,
  branding: null,
  taste: null,
  ...overrides,
})

const fullScore = (
  tastingId: string,
  participantId: string,
  beerId: string,
  value: number,
): TenantRankingScore =>
  overallScore({
    tastingId,
    participantId,
    beerId,
    smell: value,
    color: value,
    branding: value,
    taste: value,
  })

const tenantRankingData = (scores: TenantRankingScore[]): TenantRankingData => ({
  tastings: [
    { id: 't-1', title: 'January', date: '2026-01-10', status: 'completed' },
    { id: 't-2', title: 'February', date: '2026-02-10', status: 'completed' },
  ],
  participants: [
    { id: 'p-1', tastingId: 't-1', displayName: 'Alice', userId: null },
    { id: 'p-2', tastingId: 't-2', displayName: 'Bob', userId: null },
  ],
  beers: [
    { id: 'b-1', name: 'Beer One', brewery: 'Brewery', style: 'IPA', alcohol: 6.5 },
    { id: 'b-2', name: 'Beer Two', brewery: null, style: 'Stout', alcohol: 8 },
    { id: 'b-3', name: 'Beer Three', brewery: null, style: null, alcohol: null },
  ],
  scores,
})

describe('deriveOverallRankings', () => {
  const scores = [
    fullScore('t-1', 'p-1', 'b-1', 10),
    fullScore('t-1', 'p-1', 'b-2', 5),
    fullScore('t-2', 'p-2', 'b-1', 8),
    fullScore('t-2', 'p-2', 'b-2', 6),
  ]

  it('aggregates complete ratings across tastings by beer', () => {
    const rankings = deriveOverallRankings(tenantRankingData(scores))

    expect(rankings).toHaveLength(2)
    expect(rankings[0]).toMatchObject({
      beerId: 'b-1',
      name: 'Beer One',
      rank: 1,
      votes: 2,
      averageScore: 72,
      averageSmell: 9,
      averageColor: 9,
      averageBranding: 9,
      averageTaste: 9,
      tastingCount: 2,
    })
    expect(rankings[1]).toMatchObject({
      beerId: 'b-2',
      rank: 2,
      votes: 2,
      averageScore: 44,
      tastingCount: 2,
    })
  })

  it('filters by taster, tasting date, type and search before aggregating', () => {
    const data = tenantRankingData(scores)

    expect(
      deriveOverallRankings(data, { participantNames: ['Alice'] }).map((beer) => [
        beer.beerId,
        beer.averageScore,
      ]),
    ).toEqual([
      ['b-1', 80],
      ['b-2', 40],
    ])

    expect(
      deriveOverallRankings(data, { from: '2026-02-01', to: '2026-02-28' }).map(
        (beer) => [beer.beerId, beer.averageScore],
      ),
    ).toEqual([
      ['b-1', 64],
      ['b-2', 48],
    ])

    expect(
      deriveOverallRankings(data, { style: 'Stout' }).map((beer) => beer.beerId),
    ).toEqual(['b-2'])

    expect(
      deriveOverallRankings(data, { search: 'brewery' }).map((beer) => beer.beerId),
    ).toEqual(['b-1'])
  })

  it('counts only complete rows and reports incomplete ones separately', () => {
    const rankings = deriveOverallRankings(
      tenantRankingData([
        fullScore('t-1', 'p-1', 'b-1', 10),
        overallScore({
          tastingId: 't-2',
          participantId: 'p-2',
          beerId: 'b-1',
          taste: 10,
        }),
      ]),
    )

    expect(rankings).toHaveLength(1)
    expect(rankings[0]).toMatchObject({
      beerId: 'b-1',
      votes: 1,
      incompleteVotes: 1,
      averageScore: 80,
    })
  })

  it('omits unrated beers and shares ranks for tied averages', () => {
    const rankings = deriveOverallRankings(
      tenantRankingData([
        fullScore('t-1', 'p-1', 'b-1', 8),
        fullScore('t-1', 'p-1', 'b-2', 8),
        fullScore('t-2', 'p-2', 'b-3', 6),
      ]),
    )

    expect(rankings.map((beer) => [beer.beerId, beer.rank])).toEqual([
      ['b-1', 1],
      ['b-2', 1],
      ['b-3', 3],
    ])
  })
})
