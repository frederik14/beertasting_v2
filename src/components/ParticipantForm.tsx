import { useState } from 'react'
import { formatError } from '../lib/api'
import type { Participant, TenantRole } from '../lib/types'
import { StatusBanner } from './StatusBanner'

type Props = {
  participants: Participant[]
  currentUserId: string
  role: TenantRole
  onAdd: (displayName: string, userId: string | null) => Promise<void>
  onRename: (participantId: string, displayName: string) => Promise<void>
  onRemove: (participantId: string) => Promise<void>
  busy?: boolean
  readOnly?: boolean
}

export function ParticipantForm({
  participants,
  currentUserId,
  role,
  onAdd,
  onRename,
  onRemove,
  busy = false,
  readOnly = false,
}: Props) {
  const [name, setName] = useState('')
  const [linkToMe, setLinkToMe] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [working, setWorking] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const myParticipant = participants.find((participant) => participant.userId === currentUserId)
  const isAdmin = role === 'owner' || role === 'admin'
  const canAdd = !readOnly && (isAdmin || !myParticipant)
  const linkToMeEffective = isAdmin ? linkToMe : true

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setWorking(true)
    setError(null)
    setMessage(null)

    try {
      const participantUserId = isAdmin
        ? linkToMe && !myParticipant
          ? currentUserId
          : null
        : currentUserId
      await onAdd(name, participantUserId)
      setName('')
      setLinkToMe(false)
      setMessage('Participant added.')
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setWorking(false)
    }
  }

  const startRename = (participant: Participant) => {
    setRenameId(participant.id)
    setRenameName(participant.displayName)
    setError(null)
    setMessage(null)
  }

  const cancelRename = () => {
    setRenameId(null)
    setRenameName('')
  }

  const handleRename = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!renameId) return

    const nextName = renameName.trim()
    if (!nextName) {
      setError('Participant name is required.')
      return
    }

    setRenaming(true)
    setError(null)
    setMessage(null)

    try {
      await onRename(renameId, nextName)
      setMessage('Participant renamed.')
      cancelRename()
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setRenaming(false)
    }
  }

  const handleRemove = async (participant: Participant) => {
    if (!window.confirm(`Remove ${participant.displayName} and all of their scores?`)) {
      return
    }

    setWorking(true)
    setError(null)
    setMessage(null)

    try {
      await onRemove(participant.id)
      setMessage(`${participant.displayName} removed.`)
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="panel" id="participants">
      <p className="eyebrow">Participants</p>
      <h2>Who is tasting?</h2>

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

      {readOnly ? (
        <p className="empty-state" role="status">
          This tasting is completed. Reopen it to manage participants.
        </p>
      ) : canAdd ? (
        <form className="stacked-form" onSubmit={handleSubmit}>
          <label className="field-group">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jeroen"
              maxLength={80}
              required
            />
          </label>

          {myParticipant ? (
            <p className="beer-meta participant-link-note">
              Your account is linked as <strong>{myParticipant.displayName}</strong> in
              this tasting. New people added here are guests. Use{' '}
              <strong>Rename</strong> below to change your own display name.
            </p>
          ) : (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={linkToMeEffective}
                onChange={(event) => setLinkToMe(event.target.checked)}
                disabled={!isAdmin}
              />
              <span>
                {isAdmin ? 'This participant is me' : 'Add me as a participant'}
              </span>
            </label>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={working || busy}
          >
            {working
              ? 'Adding…'
              : isAdmin
                ? myParticipant
                  ? 'Add guest'
                  : 'Add participant'
                : 'Add me'}
          </button>
        </form>
      ) : (
        <p className="empty-state" role="status">
          You are already a participant in this tasting as{' '}
          <strong>{myParticipant?.displayName}</strong>.
        </p>
      )}

      {participants.length === 0 ? (
        <p className="empty-state" role="status">
          No participants yet.
        </p>
      ) : (
        <ul className="participant-list">
          {participants.map((participant) => {
            const canRename =
              !readOnly &&
              (participant.userId === currentUserId || isAdmin)
            const canRemove =
              (participant.userId === currentUserId && !participant.isHost) || isAdmin

            return (
              <li key={participant.id} className="participant-row">
                {renameId === participant.id ? (
                  <form className="participant-rename-form" onSubmit={handleRename}>
                    <input
                      type="text"
                      value={renameName}
                      onChange={(event) => setRenameName(event.target.value)}
                      aria-label={`New name for ${participant.displayName}`}
                      maxLength={80}
                      autoFocus
                      required
                    />
                    <button
                      type="submit"
                      className="primary-button small-button"
                      disabled={renaming}
                    >
                      {renaming ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button small-button"
                      disabled={renaming}
                      onClick={cancelRename}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div>
                    <strong>{participant.displayName}</strong>
                    {participant.isHost ? (
                      <span className="badge badge-host">Host</span>
                    ) : null}
                    {participant.userId === currentUserId ? (
                      <span className="badge badge-you">You</span>
                    ) : null}
                    {participant.userId === null ? (
                      <span className="badge">Guest</span>
                    ) : null}
                  </div>
                )}

                {!readOnly && renameId !== participant.id ? (
                  <div className="participant-actions">
                    {canRename ? (
                      <button
                        type="button"
                        className="link-button"
                        disabled={working || busy || renaming}
                        onClick={() => startRename(participant)}
                      >
                        Rename
                      </button>
                    ) : null}
                    {canRemove ? (
                      <button
                        type="button"
                        className="link-button danger-link"
                        disabled={working || busy || renaming}
                        onClick={() => void handleRemove(participant)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
