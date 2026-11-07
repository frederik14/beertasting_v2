import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TastingSummary } from '../lib/types'
import { CurrentTastingBar } from './CurrentTastingBar'

afterEach(cleanup)

const tasting = (
  id: string,
  title: string,
  date: string,
  status: TastingSummary['status'] = 'active',
): TastingSummary => ({
  id,
  tenantId: 'tenant-1',
  hostUserId: 'user-1',
  title,
  status,
  date,
  createdAt: `${date}T00:00:00Z`,
})

describe('CurrentTastingBar', () => {
  it('shows the latest tasting and lets the user change it', () => {
    const onSelect = vi.fn()
    const first = tasting('t-1', 'Latest tasting', '2026-10-20')
    const second = tasting('t-2', 'Older tasting', '2026-09-20', 'completed')

    render(
      <CurrentTastingBar
        tastings={[first, second]}
        selectedTasting={first}
        loading={false}
        onSelect={onSelect}
        onManage={() => {}}
      />,
    )

    const select = screen.getByLabelText('Choose tasting')
    expect((select as HTMLSelectElement).value).toBe('t-1')
    expect(screen.getByText('In progress')).toBeTruthy()

    fireEvent.change(select, { target: { value: 't-2' } })
    expect(onSelect).toHaveBeenCalledWith('t-2')
  })

  it('offers a shortcut to create the first tasting', () => {
    const onManage = vi.fn()

    render(
      <CurrentTastingBar
        tastings={[]}
        selectedTasting={null}
        loading={false}
        onSelect={() => {}}
        onManage={onManage}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create a tasting' }))
    expect(onManage).toHaveBeenCalled()
  })
})
