import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTenantRanking } from '../hooks/useTenantRanking'
import type { TenantRankingData, TenantRankingScore } from '../lib/types'
import { OverallRankingPanel } from './OverallRankingPanel'

vi.mock('../hooks/useTenantRanking')

afterEach(cleanup)

const score = (
  tastingId: string,
  participantId: string,
  beerId: string,
  value: number,
): TenantRankingScore => ({
  tastingId,
  participantId,
  beerId,
  smell: value,
  color: value,
  branding: value,
  taste: value,
})

const data: TenantRankingData = {
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
    { id: 'b-3', name: 'Beer Three', brewery: null, style: 'Saison', alcohol: 7 },
  ],
  scores: [
    score('t-1', 'p-1', 'b-1', 10),
    score('t-1', 'p-1', 'b-2', 5),
    score('t-2', 'p-2', 'b-1', 8),
    score('t-2', 'p-2', 'b-2', 6),
    score('t-2', 'p-2', 'b-3', 7),
  ],
}

function renderPanel() {
  vi.mocked(useTenantRanking).mockReturnValue({
    data,
    loading: false,
    error: null,
    refresh: vi.fn(async () => {}),
    clearError: vi.fn(),
  })

  render(<OverallRankingPanel tenantId="tenant-1" tenantName="Test Group" />)
}

describe('OverallRankingPanel', () => {
  it('renders the aggregate table across tastings', () => {
    renderPanel()

    expect(
      screen.getByRole('heading', { name: 'Overall beer ranking' }),
    ).toBeTruthy()
    expect(screen.getByText('Beer One')).toBeTruthy()
    expect(screen.getByText('Beer Two')).toBeTruthy()
    expect(screen.getByText('Beer Three')).toBeTruthy()
    expect(screen.getByText('72.0')).toBeTruthy()
  })

  it('filters the table by search and taster', () => {
    renderPanel()

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'Beer Two' },
    })

    expect(screen.queryByText('Beer One')).toBeNull()
    expect(screen.getByText('Beer Two')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByLabelText('Alice'))

    expect(screen.getByText('Beer One')).toBeTruthy()
    expect(screen.getByText('Beer Two')).toBeTruthy()
    expect(screen.queryByText('Beer Three')).toBeNull()
  })

  it('shows an empty state when filters match nothing', () => {
    renderPanel()

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'not a beer' },
    })

    expect(screen.getByText('No complete scores match these filters.')).toBeTruthy()
  })
})
