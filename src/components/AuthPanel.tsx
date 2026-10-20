import { useState } from 'react'
import type { AuthActionResult } from '../hooks/useAuthSession'
import { formatError } from '../lib/api'
import { StatusBanner } from './StatusBanner'

type AuthMode = 'signIn' | 'signUp'

type Props = {
  onSignIn: (email: string, password: string) => Promise<AuthActionResult>
  onSignUp: (email: string, password: string) => Promise<AuthActionResult>
  onResetPassword: (email: string) => Promise<AuthActionResult>
}

export function AuthPanel({ onSignIn, onSignUp, onResetPassword }: Props) {
  const [mode, setMode] = useState<AuthMode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)

    try {
      const result =
        mode === 'signUp'
          ? await onSignUp(email, password)
          : await onSignIn(email, password)

      if (!result.ok) {
        setError(result.error ?? 'Authentication failed.')
        return
      }

      if (result.message) {
        setMessage(result.message)
        setPassword('')
      }
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then choose “Forgot password”.')
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)

    try {
      const result = await onResetPassword(email)
      if (!result.ok) {
        setError(result.error ?? 'Could not send the reset email.')
      } else {
        setMessage(result.message ?? 'Password reset email sent.')
      }
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel auth-card full-width">
      <p className="eyebrow">Access</p>
      <h2>Sign in to your tasting group</h2>

      <div className="auth-toggle" aria-label="Authentication mode">
        <button
          type="button"
          className={mode === 'signIn' ? 'active' : ''}
          aria-pressed={mode === 'signIn'}
          onClick={() => {
            setMode('signIn')
            setError(null)
            setMessage(null)
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === 'signUp' ? 'active' : ''}
          aria-pressed={mode === 'signUp'}
          onClick={() => {
            setMode('signUp')
            setError(null)
            setMessage(null)
          }}
        >
          Create account
        </button>
      </div>

      {error ? (
        <StatusBanner tone="error" onDismiss={() => setError(null)}>
          {error}
        </StatusBanner>
      ) : null}
      {message ? (
        <StatusBanner tone="success" onDismiss={() => setMessage(null)}>
          {message}
        </StatusBanner>
      ) : null}

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field-group">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            maxLength={254}
            autoComplete="email"
            required
          />
        </label>

        <label className="field-group">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
        </label>

        <div className="auth-actions">
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signUp' ? 'Create account' : 'Sign in'}
          </button>

          {mode === 'signIn' ? (
            <button
              type="button"
              className="link-button"
              onClick={() => void handleReset()}
              disabled={busy}
            >
              Forgot password?
            </button>
          ) : null}
        </div>
      </form>
    </section>
  )
}
