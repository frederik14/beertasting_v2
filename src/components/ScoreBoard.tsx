import { useEffect, useRef, useState } from 'react'
import { formatError } from '../lib/api'
import { averageScoreFromRow } from '../lib/rankings'
import type {
  Participant,
  SaveScoreInput,
  SaveScoreResult,
  ScoreCriterion,
  ScoreDraft,
  ScoreRow,
  TastingSnapshot,
  TenantRole,
} from '../lib/types'
import { StatusBanner } from './StatusBanner'

type Props = {
  snapshot: TastingSnapshot
  currentUserId: string
  role: TenantRole
  readOnly: boolean
  onSave: (rows: SaveScoreInput[]) => Promise<SaveScoreResult[]>
  onRefresh: () => Promise<void>
  onDirtyChange: (dirty: boolean) => void
}

const keyOf = (participantId: string, beerId: string) => `${participantId}:${beerId}`

const emptyDraft = (row?: ScoreRow): ScoreDraft => ({
  smell: row?.smell?.toString() ?? '',
  color: row?.color?.toString() ?? '',
  branding: row?.branding?.toString() ?? '',
  taste: row?.taste?.toString() ?? '',
  notes: row?.notes ?? '',
  updatedAt: row?.updatedAt ?? null,
})

const buildDrafts = (snapshot: TastingSnapshot): Record<string, ScoreDraft> => {
  const rowMap = new Map<string, ScoreRow>()
  for (const row of snapshot.rows) {
    rowMap.set(keyOf(row.participantId, row.beerId), row)
  }

  const drafts: Record<string, ScoreDraft> = {}
  for (const participant of snapshot.participants) {
    for (const beer of snapshot.beers) {
      const key = keyOf(participant.id, beer.id)
      drafts[key] = emptyDraft(rowMap.get(key))
    }
  }
  return drafts
}

const CRITERIA: Array<{ key: ScoreCriterion; label: string; max: number }> = [
  { key: 'smell', label: 'Smell', max: 10 },
  { key: 'color', label: 'Color', max: 10 },
  { key: 'branding', label: 'Branding', max: 10 },
  { key: 'taste', label: 'Taste', max: 20 },
]

// Large imported tastings have hundreds of beers. Rendering every card/column
// at once creates tens of thousands of inputs, so the scoreboard pages by beer.
const BEERS_PER_PAGE = 12

const parseScore = (value: string, label: string, max: number): number | null => {
  if (value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    throw new Error(`${label} must be a number between 0 and ${max}.`)
  }
  return parsed
}

const numberOrNull = (value: string): number | null => {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const draftScore = (
  participantId: string,
  beerId: string,
  draft: ScoreDraft,
): number | null =>
  averageScoreFromRow({
    participantId,
    beerId,
    smell: numberOrNull(draft.smell),
    color: numberOrNull(draft.color),
    branding: numberOrNull(draft.branding),
    taste: numberOrNull(draft.taste),
    notes: draft.notes || null,
    updatedAt: draft.updatedAt,
  })

const formatAlcohol = (alcohol: number | null) =>
  alcohol === null ? null : `${alcohol.toFixed(1)}%`

export function ScoreBoard({
  snapshot,
  currentUserId,
  role,
  readOnly,
  onSave,
  onRefresh,
  onDirtyChange,
}: Props) {
  const [drafts, setDrafts] = useState<Record<string, ScoreDraft>>(() =>
    buildDrafts(snapshot),
  )
  const [view, setView] = useState<'mine' | 'all'>('mine')
  const [beerPage, setBeerPage] = useState(0)
  const myParticipant =
    snapshot.participants.find((participant) => participant.userId === currentUserId) ??
    null
  const hadParticipantRef = useRef(Boolean(myParticipant))

  const beerPageCount = Math.max(1, Math.ceil(snapshot.beers.length / BEERS_PER_PAGE))
  const safeBeerPage = Math.min(beerPage, beerPageCount - 1)
  const pageStart = safeBeerPage * BEERS_PER_PAGE
  const pageBeers = snapshot.beers.slice(pageStart, pageStart + BEERS_PER_PAGE)

  useEffect(() => {
    const hasParticipant = Boolean(myParticipant)
    if (hasParticipant && !hadParticipantRef.current) {
      setView('mine')
    }
    if (!hasParticipant && hadParticipantRef.current) {
      setView('all')
    }
    hadParticipantRef.current = hasParticipant
  }, [myParticipant])
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])

  const dirtyRef = useRef<Set<string>>(new Set())

  const canEditParticipant = (participant: Participant) =>
    !readOnly &&
    (participant.userId === currentUserId || role === 'owner' || role === 'admin')

  useEffect(() => {
    const rowMap = new Map<string, ScoreRow>()
    for (const row of snapshot.rows) {
      rowMap.set(keyOf(row.participantId, row.beerId), row)
    }

    const validKeys = new Set<string>()
    for (const participant of snapshot.participants) {
      for (const beer of snapshot.beers) {
        validKeys.add(keyOf(participant.id, beer.id))
      }
    }

    for (const key of [...dirtyRef.current]) {
      if (!validKeys.has(key)) {
        dirtyRef.current.delete(key)
      }
    }

    setDrafts((previous) => {
      const next: Record<string, ScoreDraft> = {}

      for (const participant of snapshot.participants) {
        for (const beer of snapshot.beers) {
          const key = keyOf(participant.id, beer.id)
          const serverRow = rowMap.get(key)
          next[key] = dirtyRef.current.has(key)
            ? (previous[key] ?? emptyDraft(serverRow))
            : emptyDraft(serverRow)
        }
      }

      return next
    })

    setDirtyKeys(new Set(dirtyRef.current))
  }, [snapshot])

  useEffect(() => {
    onDirtyChange(dirtyKeys.size > 0)
  }, [dirtyKeys, onDirtyChange])

  useEffect(
    () => () => {
      onDirtyChange(false)
    },
    [onDirtyChange],
  )

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current.size === 0) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const handleChange = (
    participant: Participant,
    beerId: string,
    field: keyof ScoreDraft,
    value: string,
  ) => {
    if (!canEditParticipant(participant)) return

    const key = keyOf(participant.id, beerId)
    setDrafts((previous) => ({
      ...previous,
      [key]: {
        ...(previous[key] ?? emptyDraft()),
        [field]: value,
      },
    }))
    dirtyRef.current.add(key)
    setDirtyKeys(new Set(dirtyRef.current))
    setError(null)
    setMessage(null)
  }

  const buildRows = (keys: string[], force: boolean): SaveScoreInput[] =>
    keys.map((key) => {
      const draft = drafts[key]
      if (!draft) {
        throw new Error('Some scores are missing from the form. Reload and try again.')
      }

      const [participantId, beerId] = key.split(':')
      if (!participantId || !beerId) {
        throw new Error('Invalid score row.')
      }

      if (draft.notes.length > 4000) {
        throw new Error('Notes must be 4000 characters or fewer.')
      }

      return {
        participantId,
        beerId,
        smell: parseScore(draft.smell, 'Smell', 10),
        color: parseScore(draft.color, 'Color', 10),
        branding: parseScore(draft.branding, 'Branding', 10),
        taste: parseScore(draft.taste, 'Taste', 20),
        notes: draft.notes.trim() || null,
        expectedUpdatedAt: draft.updatedAt,
        force,
      }
    })

  const clearDirty = (keys: string[]) => {
    for (const key of keys) {
      dirtyRef.current.delete(key)
    }
    setDirtyKeys(new Set(dirtyRef.current))
  }

  const applySavedTimestamps = (results: SaveScoreResult[]) => {
    const timestamps = new Map<string, string>()
    for (const result of results) {
      if (result.status === 'saved' && result.updatedAt) {
        timestamps.set(keyOf(result.participantId, result.beerId), result.updatedAt)
      }
    }

    if (timestamps.size === 0) return

    setDrafts((previous) => {
      const next = { ...previous }
      for (const [key, updatedAt] of timestamps) {
        const draft = next[key]
        if (draft) {
          next[key] = { ...draft, updatedAt }
        }
      }
      return next
    })
  }

  const handleSave = async () => {
    const keys = [...dirtyKeys]
    if (keys.length === 0) return

    let rows: SaveScoreInput[]
    try {
      rows = buildRows(keys, false)
    } catch (caught) {
      setError(formatError(caught))
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    setConflicts([])

    try {
      const results = await onSave(rows)
      const conflictKeys = results
        .filter((result) => result.status === 'conflict')
        .map((result) => keyOf(result.participantId, result.beerId))
      const savedKeys = results
        .filter((result) => result.status === 'saved')
        .map((result) => keyOf(result.participantId, result.beerId))

      clearDirty(savedKeys)
      applySavedTimestamps(results)
      setConflicts(conflictKeys)

      if (conflictKeys.length > 0) {
        setMessage(
          `${conflictKeys.length} row${conflictKeys.length === 1 ? '' : 's'} changed on another device and were not saved.`,
        )
      } else {
        setMessage('Scores saved.')
      }

      if (savedKeys.length > 0) {
        await onRefresh()
      }
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setSaving(false)
    }
  }

  const handleReloadConflicts = async () => {
    setSaving(true)
    setError(null)
    try {
      const rowMap = new Map<string, ScoreRow>()
      for (const row of snapshot.rows) {
        rowMap.set(keyOf(row.participantId, row.beerId), row)
      }

      setDrafts((previous) => {
        const next = { ...previous }
        for (const key of conflicts) {
          next[key] = emptyDraft(rowMap.get(key))
        }
        return next
      })
      clearDirty(conflicts)
      setConflicts([])
      setMessage('Reloaded the latest values from the server.')
      await onRefresh()
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setSaving(false)
    }
  }

  const handleOverwriteConflicts = async () => {
    let rows: SaveScoreInput[]
    try {
      rows = buildRows(conflicts, true)
    } catch (caught) {
      setError(formatError(caught))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const results = await onSave(rows)
      const remainingConflicts = results
        .filter((result) => result.status === 'conflict')
        .map((result) => keyOf(result.participantId, result.beerId))
      const savedKeys = results
        .filter((result) => result.status === 'saved')
        .map((result) => keyOf(result.participantId, result.beerId))

      clearDirty(savedKeys)
      applySavedTimestamps(results)
      setConflicts(remainingConflicts)
      setMessage(
        remainingConflicts.length > 0
          ? 'Some rows still conflicted. Reload and try again.'
          : 'Your values were saved over the other changes.',
      )

      if (savedKeys.length > 0) {
        await onRefresh()
      }
    } catch (caught) {
      setError(formatError(caught))
    } finally {
      setSaving(false)
    }
  }

  const renderBeerPager = () => {
    if (snapshot.beers.length <= BEERS_PER_PAGE) return null

    return (
      <div className="beer-pager">
        <button
          type="button"
          className="secondary-button small-button"
          disabled={safeBeerPage === 0}
          onClick={() => setBeerPage(Math.max(0, safeBeerPage - 1))}
        >
          Previous
        </button>
        <span className="beer-meta">
          Beers {pageStart + 1}–
          {Math.min(pageStart + BEERS_PER_PAGE, snapshot.beers.length)} of{' '}
          {snapshot.beers.length} · page {safeBeerPage + 1} of {beerPageCount}
        </span>
        <button
          type="button"
          className="secondary-button small-button"
          disabled={safeBeerPage >= beerPageCount - 1}
          onClick={() => setBeerPage(Math.min(beerPageCount - 1, safeBeerPage + 1))}
        >
          Next
        </button>
      </div>
    )
  }

  const renderMyRatings = () => {
    const participant = myParticipant

    if (!participant) {
      return (
        <div className="empty-state my-ratings-empty" role="status">
          <p>You are not a participant in this tasting yet.</p>
          {readOnly ? (
            <p>This tasting is completed. Ask the host to reopen it if you need to join.</p>
          ) : (
            <a className="link-button" href="#participants">
              Go to the Participants panel and choose “Add me”
            </a>
          )}
        </div>
      )
    }

    return (
      <div className="my-ratings">
        <div className="my-ratings-header">
          <div>
            <h3>Your ratings</h3>
            <p className="beer-meta">
              {participant.displayName}
              {participant.isHost ? ' · Host' : ''}
            </p>
          </div>
          <span className="panel-badge">
            {snapshot.beers.length} beer{snapshot.beers.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="rating-card-grid">
          {pageBeers.map((beer) => {
            const key = keyOf(participant.id, beer.id)
            const draft = drafts[key] ?? emptyDraft()
            const isDirty = dirtyKeys.has(key)
            const isConflict = conflicts.includes(key)
            const score = draftScore(participant.id, beer.id, draft)
            const meta = [beer.brewery, beer.style, formatAlcohol(beer.alcohol)]
              .filter(Boolean)
              .join(' · ')

            return (
              <article
                key={beer.id}
                className={[
                  'rating-card',
                  isDirty ? 'is-dirty' : '',
                  isConflict ? 'is-conflict' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="rating-card-header">
                  <div>
                    <h3>{beer.name}</h3>
                    {meta ? <p className="beer-meta">{meta}</p> : null}
                  </div>
                  <span className="rating-score">
                    {score === null ? 'Not complete' : `${score.toFixed(1)} / 100`}
                  </span>
                </div>

                <div className="rating-fields">
                  {CRITERIA.map(({ key: criterion, label, max }) => {
                    const inputId = `mine-${participant.id}-${beer.id}-${criterion}`

                    return (
                      <div className="criterion-field" key={criterion}>
                        <label htmlFor={inputId}>
                          {label} (0–{max})
                        </label>
                        <input
                          id={inputId}
                          type="number"
                          step="0.1"
                          min="0"
                          max={max}
                          inputMode="decimal"
                          value={draft[criterion]}
                          onChange={(event) =>
                            handleChange(participant, beer.id, criterion, event.target.value)
                          }
                          readOnly={readOnly}
                          aria-readonly={readOnly}
                          aria-label={`${label} score from 0 to ${max} for ${beer.name}`}
                        />
                      </div>
                    )
                  })}
                </div>

                <div className="criterion-field rating-notes">
                  <label htmlFor={`mine-${participant.id}-${beer.id}-notes`}>Notes</label>
                  <textarea
                    id={`mine-${participant.id}-${beer.id}-notes`}
                    rows={2}
                    maxLength={4000}
                    value={draft.notes}
                    onChange={(event) =>
                      handleChange(participant, beer.id, 'notes', event.target.value)
                    }
                    readOnly={readOnly}
                    aria-readonly={readOnly}
                    aria-label={`Notes for ${beer.name}`}
                    placeholder="What did you notice?"
                  />
                </div>

                <div className="rating-card-footer">
                  <span className="beer-meta">
                    {isDirty
                      ? 'Unsaved changes'
                      : draft.updatedAt
                        ? 'Saved'
                        : 'Not rated yet'}
                  </span>
                  {isConflict ? <span className="badge">Conflict</span> : null}
                </div>
              </article>
            )
          })}
        </div>
        {renderBeerPager()}
      </div>
    )
  }

  if (snapshot.beers.length === 0 || snapshot.participants.length === 0) {
    return (
      <section className="panel full-width">
        <p className="eyebrow">Scoring</p>
        <h2>Score each beer per participant</h2>
        <p className="empty-state" role="status">
          Add at least one participant and one beer to start scoring.
        </p>
      </section>
    )
  }

  return (
    <section className="panel full-width">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Scoring</p>
          <h2>Score each beer per participant</h2>
        </div>
        <span className="panel-badge">
          {readOnly ? 'Completed · read only' : 'Complete rows are out of 100'}
        </span>
      </div>

      <p className="muted">
        Smell, color and branding are scored out of 10. Taste is scored out of 20
        because it counts double. A complete row therefore totals 50, doubled to a
        final score out of 100.
      </p>

      <div className="score-view-toggle" role="group" aria-label="Score view">
        <button
          type="button"
          className={view === 'mine' ? 'active' : ''}
          aria-pressed={view === 'mine'}
          onClick={() => setView('mine')}
        >
          My ratings
        </button>
        <button
          type="button"
          className={view === 'all' ? 'active' : ''}
          aria-pressed={view === 'all'}
          onClick={() => setView('all')}
        >
          All ratings
        </button>
      </div>

      {readOnly ? (
        <p className="muted">
          This tasting is completed. Reopen it to edit scores.
        </p>
      ) : null}

      {readOnly && dirtyKeys.size > 0 ? (
        <StatusBanner tone="warning">
          This tasting was completed while you were editing. Your unsaved changes
          could not be written. Ask the host to reopen it if you still need to save
          them.
        </StatusBanner>
      ) : null}

      {error ? (
        <StatusBanner tone="error" onDismiss={() => setError(null)}>
          {error}
        </StatusBanner>
      ) : null}
      {message ? (
        <StatusBanner
          tone={conflicts.length > 0 ? 'warning' : 'success'}
          onDismiss={() => setMessage(null)}
        >
          {message}
        </StatusBanner>
      ) : null}

      {conflicts.length > 0 ? (
        <StatusBanner tone="warning">
          <p>
            {conflicts.length} row{conflicts.length === 1 ? '' : 's'} were changed by
            someone else. Your local values have not been written.
          </p>
          <div className="control-row">
            <button
              type="button"
              className="secondary-button"
              disabled={saving}
              onClick={() => void handleReloadConflicts()}
            >
              Reload their values
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={saving}
              onClick={() => void handleOverwriteConflicts()}
            >
              Overwrite with mine
            </button>
          </div>
        </StatusBanner>
      ) : null}

      {view === 'mine' ? (
        renderMyRatings()
      ) : (
        <div className="score-table-wrap">
          <table className="score-table">
          <caption className="sr-only">
            Scores for {snapshot.tasting.title}. Smell, color and branding are out of
            10; taste is out of 20. Each beer has these fields and notes for every
            participant.
          </caption>
          <thead>
            <tr>
              <th scope="col">Participant</th>
              {pageBeers.map((beer) => (
                <th scope="col" key={beer.id}>
                  {beer.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.participants.map((participant) => {
              const editable = canEditParticipant(participant)

              return (
                <tr key={participant.id}>
                  <th scope="row" className="participant-label">
                    <span>{participant.displayName}</span>
                    {participant.isHost ? (
                      <span className="badge badge-host">Host</span>
                    ) : null}
                    {participant.userId === currentUserId ? (
                      <span className="badge badge-you">You</span>
                    ) : null}
                    {!editable && !readOnly ? (
                      <span className="badge">Read only</span>
                    ) : null}
                  </th>

                  {pageBeers.map((beer) => {
                    const key = keyOf(participant.id, beer.id)
                    const draft = drafts[key] ?? emptyDraft()
                    const isDirty = dirtyKeys.has(key)
                    const isConflict = conflicts.includes(key)

                    return (
                      <td
                        key={beer.id}
                        className={[
                          'score-cell',
                          isDirty ? 'is-dirty' : '',
                          isConflict ? 'is-conflict' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {CRITERIA.map(({ key: criterion, label, max }) => {
                          const inputId = `${participant.id}-${beer.id}-${criterion}`

                          return (
                            <div className="criterion-field" key={criterion}>
                              <label htmlFor={inputId}>
                                {label} (0–{max})
                              </label>
                              <input
                                id={inputId}
                                type="number"
                                step="0.1"
                                min="0"
                                max={max}
                                inputMode="decimal"
                                value={draft[criterion]}
                                onChange={(event) =>
                                  handleChange(participant, beer.id, criterion, event.target.value)
                                }
                                readOnly={!editable}
                                aria-readonly={!editable}
                                aria-label={`${label} score from 0 to ${max} for ${participant.displayName}, ${beer.name}`}
                              />
                            </div>
                          )
                        })}

                        <div className="criterion-field">
                          <label className="sr-only" htmlFor={`${participant.id}-${beer.id}-notes`}>
                            Notes for {participant.displayName}, {beer.name}
                          </label>
                          <textarea
                            id={`${participant.id}-${beer.id}-notes`}
                            rows={2}
                            maxLength={4000}
                            value={draft.notes}
                            onChange={(event) =>
                              handleChange(participant, beer.id, 'notes', event.target.value)
                            }
                            readOnly={!editable}
                            aria-readonly={!editable}
                            aria-label={`Notes for ${participant.displayName}, ${beer.name}`}
                            placeholder="Notes"
                          />
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          </table>
        </div>
      )}

      {view === 'all' ? renderBeerPager() : null}

      {!readOnly && (view === 'all' || myParticipant) ? (
        <div className="score-actions">
          <span className="dirty-indicator" role="status">
            {dirtyKeys.size > 0
              ? `${dirtyKeys.size} unsaved row${dirtyKeys.size === 1 ? '' : 's'}`
              : 'All changes saved'}
          </span>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSave()}
            disabled={saving || dirtyKeys.size === 0}
          >
            {saving ? 'Saving…' : 'Save scores'}
          </button>
        </div>
      ) : null}
    </section>
  )
}
