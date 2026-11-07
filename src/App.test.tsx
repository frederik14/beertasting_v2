import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/supabase', () => ({
  supabase: null,
  hasSupabaseConfig: true,
  supabaseConfigError: null,
}))

vi.mock('./hooks/useAuthSession', () => ({
  useAuthSession: () => ({
    session: { user: { id: 'user-1' } },
    loading: false,
    error: null,
    recovery: false,
    clearError: () => {},
    clearRecovery: () => {},
    signIn: async () => ({ ok: true }),
    signUp: async () => ({ ok: true }),
    resetPassword: async () => ({ ok: true }),
    updatePassword: async () => ({ ok: true }),
    signOut: async () => {},
  }),
}))

vi.mock('./hooks/useTenantData', () => ({
  useTenantData: () => ({
    memberships: [
      {
        tenant: { id: 'tenant-1', name: 'Test Group', slug: 'test-group' },
        role: 'owner',
        createdAt: '2026-10-20T00:00:00Z',
      },
    ],
    loading: false,
    error: null,
    refresh: async () => [],
    clearError: () => {},
  }),
}))

vi.mock('./hooks/useTastingSnapshot', () => ({
  useTastingSnapshot: () => ({
    snapshot: null,
    status: 'idle',
    error: null,
    realtimeStatus: 'offline',
    refresh: async () => {},
    clearError: () => {},
  }),
}))

vi.mock('./hooks/useTenantRealtime', () => ({
  useTenantRealtime: () => {},
}))

vi.mock('./hooks/useUrlParam', () => ({
  useUrlParam: (name: string) => {
    if (name === 'tenant') return ['tenant-1', () => {}] as const
    if (name === 'tasting') return ['tasting-1', () => {}] as const
    return [null, () => {}] as const
  },
}))

beforeEach(() => {
  window.scrollTo = vi.fn()
})

afterEach(cleanup)

describe('App navigation', () => {
  it('switches between Tasting, Ranking and Group without losing form state', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    fireEvent.click(screen.getByText('Add or manage tastings'))
    const titleInput = screen.getByLabelText('Tasting title')
    fireEvent.change(titleInput, { target: { value: 'Draft tasting title' } })

    fireEvent.click(screen.getByRole('button', { name: 'Ranking' }))
    expect(
      screen.getByRole('heading', { name: 'Overall beer ranking' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(
      screen.getByText('Tastings, invites, group access and the remaining app actions.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Tasting' }))
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(
      (screen.getByLabelText('Tasting title') as HTMLInputElement).value,
    ).toBe('Draft tasting title')
  })
})
