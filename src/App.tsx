import './App.css'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { tastingSnapshot as fallbackSnapshot } from './data/mockSnapshot'
import { deriveTastingRankings } from './lib/rankings'
import {
  addParticipantToTasting,
  assignBeerToTasting,
  createTastingForTenant,
  createTenantForUser,
  ensureProfile,
  fetchCurrentTenant,
  fetchLatestSnapshot,
  fetchSnapshotForTasting,
  fetchTenantTastings,
  hasSupabaseConfig,
  saveScoreRow,
  supabase,
  upsertBeerForTenant,
} from './lib/supabase'
import type { TastingSnapshot } from './lib/types'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [currentTenant, setCurrentTenant] = useState<{ id: string; name: string; slug: string } | null>(
    null,
  )
  const [tenantTastings, setTenantTastings] = useState<Array<{ id: string; title: string; status: string; tasting_date: string }>>([])
  const [selectedTastingId, setSelectedTastingId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<TastingSnapshot>(fallbackSnapshot)
  const [status, setStatus] = useState<'loading' | 'live' | 'fallback'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signUp')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [tastingTitle, setTastingTitle] = useState('')
  const [tastingDate, setTastingDate] = useState(new Date().toISOString().slice(0, 10))
  const [participantName, setParticipantName] = useState('')
  const [beerName, setBeerName] = useState('')
  const [beerBrewery, setBeerBrewery] = useState('')
  const [beerStyle, setBeerStyle] = useState('')
  const [beerAlcohol, setBeerAlcohol] = useState('')
  const [draftScores, setDraftScores] = useState<Record<string, { smell: string; color: string; branding: string; taste: string; notes: string }>>({})
  const [busy, setBusy] = useState(false)

  const refreshSnapshot = async () => {
    if (!supabase || !session) {
      return
    }

    try {
      const liveSnapshot = selectedTastingId
        ? await fetchSnapshotForTasting(supabase, selectedTastingId)
        : await fetchLatestSnapshot(supabase)

      if (liveSnapshot) {
        setSnapshot(liveSnapshot)
        setStatus('live')
        setError(null)
      } else {
        setSnapshot(fallbackSnapshot)
        setStatus('fallback')
      }
    } catch (caughtError) {
      setSnapshot(fallbackSnapshot)
      setStatus('fallback')
      setError(
        caughtError instanceof Error
          ? `Supabase query failed: ${caughtError.message}`
          : 'Supabase query failed.',
      )
    }
  }

  useEffect(() => {
    if (!supabase) {
      setStatus('fallback')
      setError('Add your Supabase URL and anon key in .env to enable live data.')
      return
    }

    let active = true

    const syncSession = async (nextSession: Session | null) => {
      if (!active || !supabase) {
        return
      }

      setSession(nextSession)

      if (!nextSession?.user) {
        setCurrentTenant(null)
        setSelectedTastingId(null)
        setTenantTastings([])
        return
      }

      try {
        await ensureProfile(supabase, nextSession.user.id, nextSession.user.email ?? null)
        const tenant = await fetchCurrentTenant(supabase, nextSession.user.id)
        if (active) {
          setCurrentTenant(tenant)
          if (tenant) {
            const tastings = await fetchTenantTastings(supabase, tenant.id)
            setTenantTastings(tastings)
            setSelectedTastingId((previous) => previous ?? tastings[0]?.id ?? null)
          }
        }
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof Error
              ? `Profile setup failed: ${caughtError.message}`
              : 'Profile setup failed.',
          )
        }
      }
    }

    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      void syncSession(activeSession)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadSnapshot() {
      if (!hasSupabaseConfig || !supabase) {
        if (isMounted) {
          setSnapshot(fallbackSnapshot)
          setStatus('fallback')
          setError('Add your Supabase URL and anon key in .env to enable live data.')
        }
        return
      }

      if (!session) {
        if (isMounted) {
          setSnapshot(fallbackSnapshot)
          setStatus('fallback')
          setError('Sign in to connect the app to Supabase.')
        }
        return
      }

      try {
        const liveSnapshot = selectedTastingId
          ? await fetchSnapshotForTasting(supabase, selectedTastingId)
          : await fetchLatestSnapshot(supabase)

        if (!isMounted) {
          return
        }

        if (liveSnapshot) {
          setSnapshot(liveSnapshot)
          setStatus('live')
          setError(null)
          return
        }

        setSnapshot(fallbackSnapshot)
        setStatus('fallback')
        setError('No tenant or tasting data is available yet, so the demo snapshot is shown.')
      } catch (caughtError) {
        if (!isMounted) {
          return
        }

        setSnapshot(fallbackSnapshot)
        setStatus('fallback')
        setError(
          caughtError instanceof Error
            ? `Supabase query failed: ${caughtError.message}`
            : 'Supabase query failed.',
        )
      }
    }

    void loadSnapshot()

    return () => {
      isMounted = false
    }
  }, [session, selectedTastingId])

  useEffect(() => {
    const nextDraftScores: Record<string, { smell: string; color: string; branding: string; taste: string; notes: string }> = {}

    for (const row of snapshot.rows) {
      const key = `${row.participantId}:${row.beerId}`
      nextDraftScores[key] = {
        smell: row.smell?.toString() ?? '',
        color: row.color?.toString() ?? '',
        branding: row.branding?.toString() ?? '',
        taste: row.taste?.toString() ?? '',
        notes: row.notes ?? '',
      }
    }

    setDraftScores(nextDraftScores)
  }, [snapshot])

  useEffect(() => {
    if (!currentTenant || !supabase) {
      return
    }

    void (async () => {
      const tastings = await fetchTenantTastings(supabase, currentTenant.id)
      setTenantTastings(tastings)
      if (!selectedTastingId && tastings[0]) {
        setSelectedTastingId(tastings[0].id)
      }
    })()
  }, [currentTenant, selectedTastingId])

  const rankings = useMemo(() => deriveTastingRankings(snapshot), [snapshot])
  const statusLabel =
    status === 'live' ? 'Live Supabase data' : status === 'fallback' ? 'Fallback demo data' : 'Loading data'

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !email || !password) {
      setError('Please provide an email and password.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      if (authMode === 'signUp') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) {
          throw error
        }

        setError('Account created. Check your inbox to confirm the email before signing in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
          throw error
        }
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Authentication failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleSignOut = async () => {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
    setError(null)
  }

  const handleCreateTenant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !session?.user) {
      setError('Sign in before creating a tenant.')
      return
    }

    if (!tenantName.trim()) {
      setError('Tenant name is required.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const createdTenant = await createTenantForUser(
        supabase,
        session.user.id,
        tenantName,
        tenantSlug || tenantName,
      )
      setCurrentTenant(createdTenant)
      setTenantName('')
      setTenantSlug('')
      setError(null)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Tenant creation failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleCreateTasting = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !session?.user || !currentTenant) {
      setError('Create a tenant before creating a tasting.')
      return
    }

    if (!tastingTitle.trim()) {
      setError('Tasting title is required.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const createdTasting = await createTastingForTenant(
        supabase,
        currentTenant.id,
        session.user.id,
        tastingTitle,
        tastingDate,
      )
      const updated = await fetchTenantTastings(supabase, currentTenant.id)
      setTenantTastings(updated)
      setSelectedTastingId(createdTasting.id)
      setTastingTitle('')
      setTastingDate(new Date().toISOString().slice(0, 10))
      await refreshSnapshot()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Tasting creation failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleAddParticipant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !selectedTastingId) {
      setError('Create a tasting before adding participants.')
      return
    }

    if (!participantName.trim()) {
      setError('Participant name is required.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      await addParticipantToTasting(supabase, selectedTastingId, participantName, session?.user?.id ?? null)
      setParticipantName('')
      await refreshSnapshot()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Participant creation failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleAddBeer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || !currentTenant || !selectedTastingId) {
      setError('Create a tasting before assigning beers.')
      return
    }

    if (!beerName.trim()) {
      setError('Beer name is required.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const beer = await upsertBeerForTenant(supabase, currentTenant.id, {
        name: beerName,
        brewery: beerBrewery,
        style: beerStyle,
        alcohol: beerAlcohol ? Number(beerAlcohol) : null,
      })

      const position = (snapshot.beers?.length ?? 0) + 1
      await assignBeerToTasting(supabase, selectedTastingId, beer.id, position)

      setBeerName('')
      setBeerBrewery('')
      setBeerStyle('')
      setBeerAlcohol('')
      await refreshSnapshot()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Beer assignment failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleScoreChange = (
    participantId: string,
    beerId: string,
    field: 'smell' | 'color' | 'branding' | 'taste' | 'notes',
    value: string,
  ) => {
    const key = `${participantId}:${beerId}`
    setDraftScores((current) => ({
      ...current,
      [key]: {
        smell: current[key]?.smell ?? '',
        color: current[key]?.color ?? '',
        branding: current[key]?.branding ?? '',
        taste: current[key]?.taste ?? '',
        notes: current[key]?.notes ?? '',
        [field]: value,
      },
    }))
  }

  const handleSaveScores = async () => {
    if (!supabase || !selectedTastingId) {
      setError('Select a tasting before saving scores.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      for (const [key, values] of Object.entries(draftScores)) {
        const [participantId, beerId] = key.split(':')
        const smell = values.smell === '' ? null : Number(values.smell)
        const color = values.color === '' ? null : Number(values.color)
        const branding = values.branding === '' ? null : Number(values.branding)
        const taste = values.taste === '' ? null : Number(values.taste)

        if (
          participantId && beerId &&
          [smell, color, branding, taste].some((value) => value !== null)
        ) {
          await saveScoreRow(supabase, selectedTastingId, participantId, beerId, {
            smell,
            color,
            branding,
            taste,
            notes: values.notes.trim() || null,
          })
        }
      }

      await refreshSnapshot()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Saving scores failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const tenantTitle = currentTenant?.name ?? snapshot.tenant.name
  const tenantSlugLabel = currentTenant?.slug ?? snapshot.tenant.slug

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Tenant</p>
          <h1>{tenantTitle}</h1>
        </div>
        <div className="tenant-pill">{tenantSlugLabel}</div>
      </header>

      <main className="page-grid">
        {!session ? (
          <section className="panel auth-card full-width">
            <p className="eyebrow">Access</p>
            <h2>Sign in to your tasting group</h2>

            <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={authMode === 'signUp' ? 'active' : ''}
                onClick={() => setAuthMode('signUp')}
              >
                Create account
              </button>
              <button
                type="button"
                className={authMode === 'signIn' ? 'active' : ''}
                onClick={() => setAuthMode('signIn')}
              >
                Sign in
              </button>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label className="field-group">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className="field-group">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </label>

              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? 'Please wait…' : authMode === 'signUp' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          </section>
        ) : (
          <section className="panel full-width">
            <p className="eyebrow">Account</p>
            <div className="account-row">
              <div>
                <h2>{session.user.email}</h2>
                <p className="status-text">Signed in with Supabase Auth.</p>
              </div>
              <button type="button" className="secondary-button" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </section>
        )}

        {session && !currentTenant ? (
          <section className="panel full-width">
            <p className="eyebrow">Create tenant</p>
            <h2>Start your first tasting group</h2>

            <form className="tenant-form" onSubmit={handleCreateTenant}>
              <label className="field-group">
                <span>Group name</span>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(event) => setTenantName(event.target.value)}
                  placeholder="Friday Beer Club"
                  required
                />
              </label>

              <label className="field-group">
                <span>Slug</span>
                <input
                  type="text"
                  value={tenantSlug}
                  onChange={(event) => setTenantSlug(event.target.value)}
                  placeholder="friday-beer-club"
                />
              </label>

              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? 'Creating…' : 'Create tenant'}
              </button>
            </form>
          </section>
        ) : null}

        {session && currentTenant ? (
          <>
            <section className="panel full-width">
              <p className="eyebrow">Tasting setup</p>
              <h2>Create a tasting</h2>

              <form className="stacked-form" onSubmit={handleCreateTasting}>
                <label className="field-group">
                  <span>Tasting title</span>
                  <input
                    type="text"
                    value={tastingTitle}
                    onChange={(event) => setTastingTitle(event.target.value)}
                    placeholder="Autumn tasting"
                    required
                  />
                </label>

                <label className="field-group">
                  <span>Tasting date</span>
                  <input
                    type="date"
                    value={tastingDate}
                    onChange={(event) => setTastingDate(event.target.value)}
                    required
                  />
                </label>

                <button type="submit" className="primary-button" disabled={busy}>
                  {busy ? 'Saving…' : 'Create tasting'}
                </button>
              </form>
            </section>

            <section className="panel full-width">
              <p className="eyebrow">Current tasting</p>
              <div className="select-row">
                <label className="field-group compact">
                  <span>Selected tasting</span>
                  <select
                    value={selectedTastingId ?? ''}
                    onChange={(event) => setSelectedTastingId(event.target.value || null)}
                  >
                    {tenantTastings.length === 0 ? (
                      <option value="">No tastings yet</option>
                    ) : (
                      tenantTastings.map((tasting) => (
                        <option key={tasting.id} value={tasting.id}>
                          {tasting.title}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
            </section>

            <section className="panel">
              <p className="eyebrow">Add participant</p>
              <h2>Invite a taster</h2>
              <form className="stacked-form" onSubmit={handleAddParticipant}>
                <label className="field-group">
                  <span>Name</span>
                  <input
                    type="text"
                    value={participantName}
                    onChange={(event) => setParticipantName(event.target.value)}
                    placeholder="Jeroen"
                  />
                </label>
                <button type="submit" className="primary-button" disabled={busy}>
                  Add participant
                </button>
              </form>
            </section>

            <section className="panel">
              <p className="eyebrow">Add beer</p>
              <h2>Seed the tasting catalog</h2>
              <form className="stacked-form" onSubmit={handleAddBeer}>
                <label className="field-group">
                  <span>Beer name</span>
                  <input
                    type="text"
                    value={beerName}
                    onChange={(event) => setBeerName(event.target.value)}
                    placeholder="Black Horizon"
                  />
                </label>
                <label className="field-group">
                  <span>Brewery</span>
                  <input
                    type="text"
                    value={beerBrewery}
                    onChange={(event) => setBeerBrewery(event.target.value)}
                    placeholder="Northside"
                  />
                </label>
                <label className="field-group">
                  <span>Style</span>
                  <input
                    type="text"
                    value={beerStyle}
                    onChange={(event) => setBeerStyle(event.target.value)}
                    placeholder="Stout"
                  />
                </label>
                <label className="field-group">
                  <span>ABV</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={beerAlcohol}
                    onChange={(event) => setBeerAlcohol(event.target.value)}
                    placeholder="8.2"
                  />
                </label>
                <button type="submit" className="primary-button" disabled={busy}>
                  Add beer
                </button>
              </form>
            </section>

            <section className="panel full-width">
              <p className="eyebrow">Scoring</p>
              <h2>Score each beer per participant</h2>

              {snapshot.beers.length === 0 || snapshot.participants.length === 0 ? (
                <p className="status-text">Add at least one beer and one participant to start scoring.</p>
              ) : (
                <div className="score-board">
                  <div
                    className="score-table-header"
                    style={{
                      gridTemplateColumns: `minmax(150px, 180px) repeat(${snapshot.beers.length}, minmax(180px, 1fr))`,
                    }}
                  >
                    <div>Participant</div>
                    {snapshot.beers.map((beer) => (
                      <div key={beer.id}>{beer.name}</div>
                    ))}
                  </div>

                  {snapshot.participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="score-row"
                      style={{
                        gridTemplateColumns: `minmax(150px, 180px) repeat(${snapshot.beers.length}, minmax(180px, 1fr))`,
                      }}
                    >
                      <div className="participant-label">{participant.displayName}</div>
                      {snapshot.beers.map((beer) => {
                        const key = `${participant.id}:${beer.id}`
                        const values = draftScores[key] ?? {
                          smell: '',
                          color: '',
                          branding: '',
                          taste: '',
                          notes: '',
                        }

                        return (
                          <div key={`${participant.id}-${beer.id}`} className="score-cell">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="10"
                              value={values.smell}
                              onChange={(event) => handleScoreChange(participant.id, beer.id, 'smell', event.target.value)}
                              placeholder="smell"
                            />
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="10"
                              value={values.color}
                              onChange={(event) => handleScoreChange(participant.id, beer.id, 'color', event.target.value)}
                              placeholder="color"
                            />
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="10"
                              value={values.branding}
                              onChange={(event) => handleScoreChange(participant.id, beer.id, 'branding', event.target.value)}
                              placeholder="branding"
                            />
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="10"
                              value={values.taste}
                              onChange={(event) => handleScoreChange(participant.id, beer.id, 'taste', event.target.value)}
                              placeholder="taste"
                            />
                            <textarea
                              rows={2}
                              value={values.notes}
                              onChange={(event) => handleScoreChange(participant.id, beer.id, 'notes', event.target.value)}
                              placeholder="notes"
                            />
                          </div>
                        )
                      })}
                    </div>
                  ))}

                  <div className="score-actions">
                    <button type="button" className="primary-button" onClick={handleSaveScores} disabled={busy}>
                      {busy ? 'Saving…' : 'Save scores'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        ) : null}

        <section className="panel panel-highlight">
          <p className="eyebrow">Current tasting</p>
          <h2>{snapshot.tasting.title}</h2>
          <div className="meta-row">
            <span>{snapshot.tasting.date}</span>
            <span>{snapshot.tasting.status}</span>
          </div>

          <div className="stat-row">
            <div>
              <strong>{snapshot.participants.length}</strong>
              <span>participants</span>
            </div>
            <div>
              <strong>{snapshot.beers.length}</strong>
              <span>beers</span>
            </div>
            <div>
              <strong>{snapshot.rows.length}</strong>
              <span>score rows</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Data source</p>
          <div className="source-badge">{statusLabel}</div>
          {error ? <p className="status-text">{error}</p> : null}
          <ul className="feature-list">
            <li>Tenant boundaries isolate each group</li>
            <li>Users belong via tenant membership</li>
            <li>Tastings, beers, participants, and scores stay normalized</li>
            <li>Client loads a tasting snapshot and derives rankings locally</li>
          </ul>
        </section>

        <section className="panel full-width">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Ranking</p>
              <h3>Derived from the local snapshot</h3>
            </div>
            <span className="panel-badge">live client calculation</span>
          </div>

          <div className="ranking-list">
            {rankings.map((beer, index) => (
              <div className="ranking-row" key={beer.beerId}>
                <div className="position">#{index + 1}</div>
                <div className="beer-info">
                  <strong>{beer.name}</strong>
                  <span>{beer.votes} votes</span>
                </div>
                <div className="score-value">{beer.averageScore.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
