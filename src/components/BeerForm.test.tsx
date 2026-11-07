import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Beer } from '../lib/types'
import { BeerForm } from './BeerForm'

afterEach(cleanup)

const beer: Beer = {
  id: 'beer-1',
  name: 'Old Name',
  brewery: 'Old Brewery',
  style: 'Stout',
  alcohol: 8.2,
}

describe('BeerForm', () => {
  it('edits beer metadata without removing the beer', async () => {
    const onEdit = vi.fn(async () => {})

    render(
      <BeerForm
        beers={[beer]}
        onAdd={async () => {}}
        onEdit={onEdit}
        onRemove={async () => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const editForm = screen
      .getByText(/Changes update this beer/)
      .closest('form')
    expect(editForm).not.toBeNull()

    fireEvent.change(within(editForm as HTMLElement).getByLabelText('Beer name'), {
      target: { value: 'New Name' },
    })
    fireEvent.change(within(editForm as HTMLElement).getByLabelText('Brewery'), {
      target: { value: 'New Brewery' },
    })
    fireEvent.click(
      within(editForm as HTMLElement).getByRole('button', { name: 'Save changes' }),
    )

    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith('beer-1', {
        name: 'New Name',
        brewery: 'New Brewery',
        style: 'Stout',
        alcohol: 8.2,
      })
    })
  })

  it('offers no edit action for a completed tasting', () => {
    render(
      <BeerForm
        beers={[beer]}
        onAdd={async () => {}}
        onEdit={async () => {}}
        onRemove={async () => {}}
        readOnly
      />,
    )

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })
})
