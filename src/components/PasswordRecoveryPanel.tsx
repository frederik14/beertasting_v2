import { useState } from 'react'
import type { AuthActionResult } from '../hooks/useAuthSession'
import { formatError } from '../lib/api'
import { StatusBanner } from './StatusBanner'

type Props = {
  onUpdatePassword: (password: string) => Promise<AuthActionResult>
  onCancel: () => void
}

export function PasswordRecoveryPanel({ onUpdatePassword, onCancel }: Props) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (password.length < 6) {
      setError('Use at least 6 characters.')
      return
    }
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const result = await onUpdatePassword(password)
      if (!result.ok) {
        setError(result.error ?? 'Could not update the password.')
        return
      }
      setMessage(result.message ?? 'Password updated.')
      setPassword('')
      setConfirmation('')
      onCancel()
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel auth-card full-width">
      <p className="eyebrow">Account recovery</p>
      <h2>Choose a new password</h2>

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
          <span>New password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>

        <label className="field-group">
          <span>Confirm new password</span>
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>

        <div className="auth-actions">
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
          <button type="button" className="link-button" onClick={onCancel} disabled={busy}>
            Back to the app
          </button>
        </div>
      </form>
    </section>
  )
}
