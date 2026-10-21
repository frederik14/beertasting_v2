import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SaveScoreResult, TastingSnapshot } from '../lib/types'
import { ScoreBoard } from './ScoreBoard'

afterEach(cleanup)

const snapshot: TastingSnapshot = {
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
    { id: 'p-2', displayName: 'B', userId: 'user-2', isHost: false },
  ],
  beers: [
    { id: 'beer-1', name: 'Beer One', brewery: 'Brewery', style: 'Stout', alcohol: 8.2 },
  ],
  rows: [],
}

const noopSave = async (): Promise<SaveScoreResult[]> => []
const noopRefresh = async () => {}

describe('ScoreBoard', () => {
  it('defaults to My ratings for the signed-in participant and can switch to All ratings', () => {
    render(
      <ScoreBoard
        snapshot={snapshot}
        currentUserId="user-1"
        role="member"
        readOnly={false}
        onSave={noopSave}
        onRefresh={noopRefresh}
        onDirtyChange={() => {}}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'My ratings' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByRole('heading', { name: 'Beer One' })).toBeTruthy()
    expect(
      screen.getByRole('spinbutton', {
        name: 'Smell score from 0 to 10 for Beer One',
      }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'All ratings' }))

    expect(
      screen.getByRole('button', { name: 'All ratings' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByRole('columnheader', { name: 'Participant' })).toBeTruthy()
  })

  it('pages large beer lists instead of rendering every score field at once', () => {
    const manyBeers: TastingSnapshot = {
      ...snapshot,
      beers: Array.from({ length: 13 }, (_, index) => ({
        id: `beer-${index + 1}`,
        name: `Beer ${index + 1}`,
        brewery: null,
        style: null,
        alcohol: null,
      })),
    }

    render(
      <ScoreBoard
        snapshot={manyBeers}
        currentUserId="user-1"
        role="member"
        readOnly={false}
        onSave={noopSave}
        onRefresh={noopRefresh}
        onDirtyChange={() => {}}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Beer 12' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Beer 13' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('heading', { name: 'Beer 13' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Beer 1' })).toBeNull()
  })
})
