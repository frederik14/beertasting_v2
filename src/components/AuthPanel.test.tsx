import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AuthPanel } from './AuthPanel'

afterEach(cleanup)

const noop = async () => ({ ok: true })

describe('AuthPanel', () => {
  it('exposes labelled email and password fields', () => {
    render(
      <AuthPanel onSignIn={noop} onSignUp={noop} onResetPassword={noop} />,
    )

    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
  })

  it('marks the active authentication mode with aria-pressed', () => {
    render(
      <AuthPanel onSignIn={noop} onSignUp={noop} onResetPassword={noop} />,
    )

    expect(
      screen.getByRole('button', { name: 'Sign in', pressed: true }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Create account', pressed: false }),
    ).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Create account', pressed: false }),
    )

    expect(
      screen.getByRole('button', { name: 'Sign in', pressed: false }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Create account', pressed: true }),
    ).toBeTruthy()
  })
})
