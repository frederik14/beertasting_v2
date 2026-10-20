import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { formatError } from '../lib/api'
import { buildJoinUrl } from '../lib/join'
import type { TenantInvite, TenantRole } from '../lib/types'
import { StatusBanner } from './StatusBanner'

type Props = {
  invites: TenantInvite[]
  role: TenantRole
  tenantId: string
  tastingId: string | null
  onCreate: (role: Exclude<TenantRole, 'owner'>) => Promise<TenantInvite>
  onRevoke: (inviteId: string) => Promise<void>
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

const isActive = (invite: TenantInvite) =>
  invite.acceptedAt === null && new Date(invite.expiresAt).getTime() > Date.now()

export function InvitePanel({
  invites,
  role,
  tenantId,
  tastingId,
  onCreate,
  onRevoke,
}: Props) {
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [qrToken, setQrToken] = useState<string | null>(null)

  const handleCreate = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)

    try {
      const invite = await onCreate(inviteRole)
      setQrToken(invite.token)
      setMessage('Invite created. Share the link or show the QR code.')
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async (value: string, label: string) => {
    setError(null)
    try {
      await navigator.clipboard.writeText(value)
      setMessage(`${label} copied to the clipboard.`)
    } catch {
      setMessage(`Could not copy the ${label.toLowerCase()} automatically. Select it and copy it manually.`)
    }
  }

  const handleRevoke = async (inviteId: string) => {
    if (!window.confirm('Revoke this invite? The code will stop working.')) {
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)

    try {
      await onRevoke(inviteId)
      setMessage('Invite revoked.')
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setBusy(false)
    }
  }

  const activeInvites = invites.filter(isActive)
  const otherInvites = invites.filter((invite) => !isActive(invite))
  const qrInvite = qrToken
    ? activeInvites.find((invite) => invite.token === qrToken) ?? null
    : null
  const qrUrl = qrInvite ? buildJoinUrl(qrInvite.token, tenantId, tastingId) : null

  return (
    <section className="panel full-width">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Members</p>
          <h2>Invite people to this group</h2>
        </div>
        <span className="panel-badge">{role}</span>
      </div>

      <p className="muted">
        Invite links are single-use. Create one per person and share it privately.
        Codes expire after 14 days. The link opens the app with the invite and, when
        available, the current tasting.
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

      <div className="control-row invite-create">
        <label className="field-group compact inline-field">
          <span>Role</span>
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as 'admin' | 'member')}
            disabled={busy}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <button
          type="button"
          className="primary-button"
          onClick={() => void handleCreate()}
          disabled={busy}
        >
          {busy ? 'Creating…' : 'Create invite'}
        </button>
      </div>

      {activeInvites.length === 0 ? (
        <p className="empty-state" role="status">
          No active invites.
        </p>
      ) : (
        <ul className="invite-list">
          {activeInvites.map((invite) => {
            const joinUrl = buildJoinUrl(invite.token, tenantId, tastingId)

            return (
              <li key={invite.id} className="invite-row">
                <div>
                  <code className="invite-code">{invite.token}</code>
                  <span className="beer-meta">
                    {invite.role} · expires{' '}
                    {dateFormatter.format(new Date(invite.expiresAt))}
                  </span>
                </div>
                <div className="control-row">
                  <button
                    type="button"
                    className="secondary-button small-button"
                    onClick={() => void handleCopy(invite.token, 'Invite code')}
                  >
                    Copy code
                  </button>
                  <button
                    type="button"
                    className="secondary-button small-button"
                    onClick={() => void handleCopy(joinUrl, 'Join link')}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className="secondary-button small-button"
                    onClick={() => setQrToken(invite.token)}
                  >
                    QR
                  </button>
                  <button
                    type="button"
                    className="link-button danger-link"
                    disabled={busy}
                    onClick={() => void handleRevoke(invite.id)}
                  >
                    Revoke
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {qrUrl ? (
        <div className="qr-panel">
          <div className="qr-code">
            <QRCodeSVG
              value={qrUrl}
              size={200}
              level="M"
              bgColor="#ffffff"
              fgColor="#111827"
              role="img"
              aria-label="QR code to join this group"
            />
          </div>
          <div className="qr-details">
            <h3>Scan to join on a phone</h3>
            <p className="muted">
              {tastingId
                ? 'Opens the app with this invite and the current tasting.'
                : 'Opens the app with this invite.'}
            </p>
            <code className="invite-code">{qrUrl}</code>
            <div className="control-row">
              <button
                type="button"
                className="secondary-button small-button"
                onClick={() => void handleCopy(qrUrl, 'Join link')}
              >
                Copy link
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => setQrToken(null)}
              >
                Hide QR
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {otherInvites.length > 0 ? (
        <details className="invite-history">
          <summary>Invite history ({otherInvites.length})</summary>
          <ul className="invite-list">
            {otherInvites.map((invite) => (
              <li key={invite.id} className="invite-row">
                <div>
                  <code className="invite-code muted">{invite.token}</code>
                  <span className="beer-meta">
                    {invite.acceptedAt
                      ? `Accepted ${dateFormatter.format(new Date(invite.acceptedAt))}`
                      : `Expired ${dateFormatter.format(new Date(invite.expiresAt))}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
