import { useState } from 'react'
import { formatError } from '../lib/api'
import { StatusBanner } from './StatusBanner'

type Props = {
  onCreate: (name: string, slug: string) => Promise<void>
  onJoin: (token: string) => Promise<void>
}

export function TenantSetup({ onCreate, onJoin }: Props) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('create')
    setError(null)
    setMessage(null)

    try {
      await onCreate(name, slug)
      setName('')
      setSlug('')
      setMessage('Group created. You are the owner.')
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(null)
    }
  }

  const handleJoin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy('join')
    setError(null)
    setMessage(null)

    try {
      await onJoin(token)
      setToken('')
      setMessage('You joined the group.')
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <section className="panel full-width">
        <p className="eyebrow">No group yet</p>
        <h2>Start your first tasting group</h2>
        <p className="muted">
          A group is a private tenant. Tastings, beers and scores in one group are never
          visible to members of another group.
        </p>

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

        <form className="stacked-form" onSubmit={handleCreate}>
          <label className="field-group">
            <span>Group name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Friday Beer Club"
              maxLength={120}
              required
            />
          </label>

          <label className="field-group">
            <span>Slug (optional)</span>
            <input
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="friday-beer-club"
              maxLength={80}
              pattern="[a-zA-Z0-9 -]*"
            />
          </label>

          <button type="submit" className="primary-button" disabled={busy !== null}>
            {busy === 'create' ? 'Creating…' : 'Create group'}
          </button>
        </form>
      </section>

      <section className="panel full-width">
        <p className="eyebrow">Have an invite?</p>
        <h2>Join an existing group</h2>
        <p className="muted">
          Paste the invite code an owner or admin shared with you. Invite codes expire
          after 14 days.
        </p>

        <form className="stacked-form" onSubmit={handleJoin}>
          <label className="field-group">
            <span>Invite code</span>
            <input
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              maxLength={36}
              autoComplete="off"
              required
            />
          </label>

          <button type="submit" className="primary-button" disabled={busy !== null}>
            {busy === 'join' ? 'Joining…' : 'Join group'}
          </button>
        </form>
      </section>
    </>
  )
}
