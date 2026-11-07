import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Participant } from '../lib/types'
import { ParticipantForm } from './ParticipantForm'

afterEach(cleanup)

const participants: Participant[] = [
  {
    id: 'p-host',
    displayName: 'frederik.vandenbruel@gmail.com',
    userId: 'user-1',
    isHost: true,
  },
  {
    id: 'p-guest',
    displayName: 'Coiske1',
    userId: 'user-2',
    isHost: false,
  },
]

describe('ParticipantForm', () => {
  it('shows which participant your account is linked to and lets you rename it', async () => {
    const onRename = vi.fn(async () => {})

    render(
      <ParticipantForm
        participants={participants}
        currentUserId="user-1"
        role="owner"
        onAdd={async () => {}}
        onRename={onRename}
        onRemove={async () => {}}
      />,
    )

    expect(screen.getByText(/Your account is linked as/)).toBeTruthy()
    const participantList = screen.getByRole('list')
    const hostRow = within(participantList)
      .getByText('frederik.vandenbruel@gmail.com')
      .closest('li')
    expect(hostRow).not.toBeNull()

    fireEvent.click(within(hostRow as HTMLElement).getByRole('button', { name: 'Rename' }))
    fireEvent.change(
      screen.getByLabelText('New name for frederik.vandenbruel@gmail.com'),
      { target: { value: 'Fre' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('p-host', 'Fre')
    })
  })
})
