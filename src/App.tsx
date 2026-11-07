import './App.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthPanel } from './components/AuthPanel'
import { BeerForm } from './components/BeerForm'
import { CurrentTastingBar } from './components/CurrentTastingBar'
import { GroupActionsPanel } from './components/GroupActionsPanel'
import { InvitePanel } from './components/InvitePanel'
import { LoadingPanel } from './components/LoadingPanel'
import { OverallRankingPanel } from './components/OverallRankingPanel'
import { ParticipantForm } from './components/ParticipantForm'
import { PasswordRecoveryPanel } from './components/PasswordRecoveryPanel'
import { RankingPanel } from './components/RankingPanel'
import { ScoreBoard } from './components/ScoreBoard'
import { SnapshotSummary } from './components/SnapshotSummary'
import { StatusBanner } from './components/StatusBanner'
import { TastingPanel } from './components/TastingPanel'
import { TenantSetup } from './components/TenantSetup'
import { TenantSwitcher } from './components/TenantSwitcher'
import { useAuthSession } from './hooks/useAuthSession'
import { useTastingSnapshot } from './hooks/useTastingSnapshot'
import { useTenantData } from './hooks/useTenantData'
import { useTenantRealtime } from './hooks/useTenantRealtime'
import { useUrlParam } from './hooks/useUrlParam'
import {
  acceptTenantInvite,
  addBeerToTasting,
  addParticipant,
  createTasting,
  createTenant,
  createTenantInvite,
  deleteTasting,
  deleteTenantInvite,
  fetchTastings,
  fetchTenantInvites,
  formatError,
  removeBeerFromTasting,
  removeParticipant,
  renameParticipant,
  saveScores,
  updateTastingStatus,
} from './lib/api'
import { deriveTastingRankings } from './lib/rankings'
import { hasSupabaseConfig, supabase, supabaseConfigError } from './lib/supabase'
import type {
  SaveScoreInput,
  SaveScoreResult,
  TastingStatus,
  TastingSummary,
  TenantInvite,
  TenantRole,
} from './lib/types'

type AppView = 'tasting' | 'overall' | 'group'

const VIEW_TABS: Array<{ id: AppView; label: string }> = [
  { id: 'tasting', label: 'Tasting' },
  { id: 'overall', label: 'Ranking' },
  { id: 'group', label: 'Group' },
]

function App() {
  const {
    session,
    loading: authLoading,
    error: authError,
    recovery,
    clearError: clearAuthError,
    clearRecovery,
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    signOut,
  } = useAuthSession()

  const userId = session?.user.id ?? null
  const {
    memberships,
    loading: membershipsLoading,
    error: membershipsError,
    refresh: refreshMemberships,
    clearError: clearMembershipsError,
  } = useTenantData(userId)

  const [tenantParam, setTenantParam] = useUrlParam('tenant')
  const [tastingParam, setTastingParam] = useUrlParam('tasting')
  const [joinParam, setJoinParam] = useUrlParam('join')

  const [tastings, setTastings] = useState<TastingSummary[]>([])
  const [tastingsLoading, setTastingsLoading] = useState(false)
  const [tastingsError, setTastingsError] = useState<string | null>(null)
  const [tastingsNonce, setTastingsNonce] = useState(0)

  const [invites, setInvites] = useState<TenantInvite[]>([])
  const [invitesError, setInvitesError] = useState<string | null>(null)
  const [invitesNonce, setInvitesNonce] = useState(0)

  const [scoreboardDirty, setScoreboardDirty] = useState(false)
  const [tenantRankingSeed, setTenantRankingSeed] = useState(0)
  const [activeView, setActiveView] = useState<AppView>('tasting')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const joinProcessingRef = useRef(false)
  const topbarRef = useRef<HTMLElement | null>(null)
  const isJoining = Boolean(session && (joining || joinParam))
  const loadedTenantIdRef = useRef<string | null>(null)
  const loadedInviteTenantIdRef = useRef<string | null>(null)

  const selectedMembership = useMemo(
    () =>
      memberships.find((membership) => membership.tenant.id === tenantParam) ??
      memberships[0] ??
      null,
    [memberships, tenantParam],
  )

  const selectedTenant = selectedMembership?.tenant ?? null
  const selectedRole: TenantRole | null = selectedMembership?.role ?? null

  const selectedTasting = useMemo(
    () => tastings.find((tasting) => tasting.id === tastingParam) ?? null,
    [tastings, tastingParam],
  )

  const {
    snapshot,
    status: snapshotStatus,
    error: snapshotError,
    realtimeStatus,
    refresh: refreshSnapshot,
    clearError: clearSnapshotError,
  } = useTastingSnapshot(selectedTasting?.id ?? null)

  // A snapshot must belong to the tasting currently selected in the URL.
  // This prevents a one-frame mismatch during a tasting switch from letting
  // the user edit or rank the previous tasting's data.
  const activeSnapshot = useMemo(
    () =>
      snapshot && selectedTasting && snapshot.tasting.id === selectedTasting.id
        ? snapshot
        : null,
    [snapshot, selectedTasting],
  )

  const rankings = useMemo(
    () => (activeSnapshot ? deriveTastingRankings(activeSnapshot) : []),
    [activeSnapshot],
  )

  useEffect(() => {
    if (session) return
    setTastings([])
    setInvites([])
    setScoreboardDirty(false)
    setJoining(false)
    setActiveView('tasting')
    setMobileMenuOpen(false)
    // Preserve tenant/tasting query parameters while a join link is waiting
    // for the user to sign in. They are used again after invite acceptance.
    if (joinParam) return
    setJoinError(null)
    setTenantParam(null)
    setTastingParam(null)
  }, [session, joinParam, setTenantParam, setTastingParam])

  useEffect(() => {
    if (!supabase || !session || !joinParam || joinProcessingRef.current) return

    let active = true
    joinProcessingRef.current = true
    setJoining(true)
    setJoinError(null)

    void (async () => {
      try {
        const tenantId = await acceptTenantInvite(supabase, joinParam)
        if (!active) return

        await refreshMemberships()
        if (!active) return

        setTenantParam(tenantId)
        setJoinParam(null)
      } catch (caught) {
        if (!active) return
        setJoinError(formatError(caught))
        setJoinParam(null)
      } finally {
        if (active) {
          setJoining(false)
        }
        joinProcessingRef.current = false
      }
    })()

    return () => {
      active = false
      joinProcessingRef.current = false
    }
  }, [session, joinParam, refreshMemberships, setJoinParam, setTenantParam])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (
        topbarRef.current &&
        !topbarRef.current.contains(event.target as Node)
      ) {
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!session || membershipsLoading || isJoining) return

    if (memberships.length === 0) {
      if (tenantParam) setTenantParam(null)
      if (tastingParam) setTastingParam(null)
      return
    }

    if (!tenantParam || !memberships.some((membership) => membership.tenant.id === tenantParam)) {
      setTenantParam(memberships[0]?.tenant.id ?? null)
    }
  }, [
    session,
    memberships,
    membershipsLoading,
    isJoining,
    tenantParam,
    tastingParam,
    setTenantParam,
    setTastingParam,
  ])

  const selectedTenantId = selectedTenant?.id ?? null

  // Clear the previous tenant's tasting list as soon as the tenant changes.
  // Nonce-based refreshes for the same tenant must not clear it, because that
  // would unmount the score board and discard unsaved drafts.
  useEffect(() => {
    if (loadedTenantIdRef.current === selectedTenantId) return
    loadedTenantIdRef.current = selectedTenantId
    setTastings([])
  }, [selectedTenantId])

  const handleTastingsChanged = useCallback(() => {
    setTastingsNonce((nonce) => nonce + 1)
  }, [])

  const refreshSnapshotRef = useRef(refreshSnapshot)

  useEffect(() => {
    refreshSnapshotRef.current = refreshSnapshot
  }, [refreshSnapshot])

  const handleBeersChanged = useCallback(() => {
    void refreshSnapshotRef.current({ silent: true })
  }, [])

  const handleInvitesChanged = useCallback(() => {
    setInvitesNonce((nonce) => nonce + 1)
  }, [])

  const canSeeInvites = selectedRole === 'owner' || selectedRole === 'admin'

  useTenantRealtime(
    selectedTenantId,
    canSeeInvites,
    handleTastingsChanged,
    handleBeersChanged,
    handleInvitesChanged,
  )

  // Keep the tasting selector in sync with realtime status/title/date changes.
  useEffect(() => {
    if (!snapshot) return
    setTastings((previous) =>
      previous.map((tasting) =>
        tasting.id === snapshot.tasting.id
          ? { ...tasting, ...snapshot.tasting }
          : tasting,
      ),
    )
  }, [snapshot])

  useEffect(() => {
    if (!supabase || !selectedTenantId) {
      setTastings([])
      setTastingsLoading(false)
      return
    }

    let active = true
    setTastingsLoading(true)
    setTastingsError(null)

    fetchTastings(supabase, selectedTenantId)
      .then((next) => {
        if (active) setTastings(next)
      })
      .catch((caught) => {
        if (active) setTastingsError(formatError(caught))
      })
      .finally(() => {
        if (active) setTastingsLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedTenantId, tastingsNonce])

  useEffect(() => {
    if (!session || tastingsLoading || isJoining) return

    if (tastings.length === 0) {
      if (tastingParam) setTastingParam(null)
      return
    }

    if (!tastingParam || !tastings.some((tasting) => tasting.id === tastingParam)) {
      setTastingParam(tastings[0]?.id ?? null)
    }
  }, [session, tastings, tastingsLoading, isJoining, tastingParam, setTastingParam])

  useEffect(() => {
    if (
      !supabase ||
      !selectedTenantId ||
      selectedRole === null ||
      selectedRole === 'member'
    ) {
      setInvites([])
      setInvitesError(null)
      return
    }

    if (loadedInviteTenantIdRef.current !== selectedTenantId) {
      loadedInviteTenantIdRef.current = selectedTenantId
      setInvites([])
      setInvitesError(null)
    }

    let active = true

    fetchTenantInvites(supabase, selectedTenantId)
      .then((next) => {
        if (active) {
          setInvites(next)
          setInvitesError(null)
        }
      })
      .catch((caught) => {
        if (active) setInvitesError(formatError(caught))
      })

    return () => {
      active = false
    }
  }, [selectedTenantId, selectedRole, invitesNonce])

  const handleViewChange = (view: AppView) => {
    setMobileMenuOpen(false)
    if (view === activeView) return
    setActiveView(view)
    window.scrollTo(0, 0)
  }

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setScoreboardDirty(dirty)
  }, [])

  const handleRankingChanged = useCallback(() => {
    setTenantRankingSeed((seed) => seed + 1)
  }, [])

  const handleSignOut = async () => {
    setMobileMenuOpen(false)
    if (
      scoreboardDirty &&
      !window.confirm('You have unsaved scores. Sign out and discard them?')
    ) {
      return
    }

    await signOut()
    setScoreboardDirty(false)
  }

  const handleCreateTenant = async (name: string, slug: string) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }

    if (
      scoreboardDirty &&
      !window.confirm('You have unsaved scores. Switch group and discard them?')
    ) {
      throw new Error('Save or discard your current scores before changing groups.')
    }

    const tenant = await createTenant(supabase, name, slug)
    await refreshMemberships()
    setScoreboardDirty(false)
    setJoinParam(null)
    setJoinError(null)
    setTenantParam(tenant.id)
    setTastingParam(null)
    setTastings([])
    setInvites([])
  }

  const handleJoinTenant = async (token: string) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }

    if (
      scoreboardDirty &&
      !window.confirm('You have unsaved scores. Switch group and discard them?')
    ) {
      throw new Error('Save or discard your current scores before changing groups.')
    }

    const tenantId = await acceptTenantInvite(supabase, token)
    await refreshMemberships()
    setScoreboardDirty(false)
    setJoinParam(null)
    setJoinError(null)
    setTenantParam(tenantId)
    setTastingParam(null)
    setTastings([])
    setInvites([])
  }

  const handleSelectTenant = (tenantId: string) => {
    setMobileMenuOpen(false)
    if (tenantId === selectedTenantId) return

    if (
      scoreboardDirty &&
      !window.confirm('You have unsaved scores. Switch group and discard them?')
    ) {
      return
    }

    setScoreboardDirty(false)
    setTenantParam(tenantId)
    setTastingParam(null)
    setTastings([])
    setInvites([])
  }

  const handleSelectTasting = (tastingId: string) => {
    if (tastingId === tastingParam) return

    if (
      scoreboardDirty &&
      !window.confirm('You have unsaved scores. Switch tasting and discard them?')
    ) {
      return
    }

    setScoreboardDirty(false)
    setTastingParam(tastingId)
  }

  const handleCreateTasting = async (title: string, date: string) => {
    if (!supabase || !selectedTenantId) {
      throw new Error('Select a group before creating a tasting.')
    }

    if (
      scoreboardDirty &&
      !window.confirm('You have unsaved scores. Create a new tasting and discard them?')
    ) {
      throw new Error('Save or discard your current scores before creating another tasting.')
    }

    const created = await createTasting(supabase, selectedTenantId, title, date)
    handleRankingChanged()
    setScoreboardDirty(false)
    setTastings((previous) => [
      created,
      ...previous.filter((tasting) => tasting.id !== created.id),
    ])
    setTastingParam(created.id)
    setTastingsNonce((nonce) => nonce + 1)
  }

  const handleStatusChange = async (status: TastingStatus) => {
    if (!supabase || !selectedTasting) {
      throw new Error('Select a tasting first.')
    }

    if (status === 'completed' && scoreboardDirty) {
      throw new Error('Save or discard your scores before completing the tasting.')
    }

    await updateTastingStatus(supabase, selectedTasting.id, status)
    setTastings((previous) =>
      previous.map((tasting) =>
        tasting.id === selectedTasting.id ? { ...tasting, status } : tasting,
      ),
    )
    await refreshSnapshot({ silent: true })
  }

  const handleDeleteTasting = async () => {
    if (!supabase || !selectedTasting) {
      throw new Error('Select a tasting first.')
    }

    await deleteTasting(supabase, selectedTasting.id)
    handleRankingChanged()
    setScoreboardDirty(false)
    setTastings((previous) =>
      previous.filter((tasting) => tasting.id !== selectedTasting.id),
    )
    setTastingParam(null)
    setTastingsNonce((nonce) => nonce + 1)
  }

  const handleAddParticipant = async (displayName: string, participantUserId: string | null) => {
    if (!supabase || !selectedTasting) {
      throw new Error('Select a tasting first.')
    }

    await addParticipant(supabase, selectedTasting.id, displayName, participantUserId)
    handleRankingChanged()
    await refreshSnapshot({ silent: true })
  }

  const handleRenameParticipant = async (
    participantId: string,
    displayName: string,
  ) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }

    await renameParticipant(supabase, participantId, displayName)
    handleRankingChanged()
    await refreshSnapshot({ silent: true })
  }

  const handleRemoveParticipant = async (participantId: string) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }

    await removeParticipant(supabase, participantId)
    handleRankingChanged()
    await refreshSnapshot({ silent: true })
  }

  const handleAddBeer = async (beer: {
    name: string
    brewery: string | null
    style: string | null
    alcohol: number | null
  }) => {
    if (!supabase || !selectedTasting) {
      throw new Error('Select a tasting first.')
    }

    await addBeerToTasting(supabase, selectedTasting.id, beer)
    handleRankingChanged()
    await refreshSnapshot({ silent: true })
  }

  const handleRemoveBeer = async (beerId: string) => {
    if (!supabase || !selectedTasting) {
      throw new Error('Select a tasting first.')
    }

    await removeBeerFromTasting(supabase, selectedTasting.id, beerId)
    handleRankingChanged()
    await refreshSnapshot({ silent: true })
  }

  const handleCreateInvite = async (
    role: Exclude<TenantRole, 'owner'>,
  ): Promise<TenantInvite> => {
    if (!supabase || !selectedTenantId) {
      throw new Error('Select a group first.')
    }

    const invite = await createTenantInvite(supabase, selectedTenantId, role)
    setInvites((previous) => [invite, ...previous])
    setInvitesNonce((nonce) => nonce + 1)
    return invite
  }

  const handleRevokeInvite = async (inviteId: string) => {
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }

    await deleteTenantInvite(supabase, inviteId)
    setInvites((previous) => previous.filter((invite) => invite.id !== inviteId))
  }

  const handleSaveScores = async (
    rows: SaveScoreInput[],
  ): Promise<SaveScoreResult[]> => {
    if (!supabase || !selectedTasting) {
      throw new Error('Select a tasting first.')
    }

    if (!snapshot || snapshot.tasting.id !== selectedTasting.id) {
      throw new Error('The selected tasting changed. Reload and try again.')
    }

    const results = await saveScores(supabase, selectedTasting.id, rows)
    handleRankingChanged()
    return results
  }

  const handleRefreshSnapshot = async () => {
    await refreshSnapshot({ silent: true })
  }

  const activeViewLabel =
    VIEW_TABS.find((tab) => tab.id === activeView)?.label ?? 'Tasting'

  return (
    <div className="app-shell">
      <header ref={topbarRef} className="topbar">
        <div>
          <p className="eyebrow">BeerTasting</p>
          <h1>{selectedTenant?.name ?? 'BeerTasting v2'}</h1>
          <p className="topbar-subtitle">
            {selectedTenant ? selectedTenant.slug : 'Private tasting groups for friends'}
          </p>
        </div>

        <div className="topbar-actions">
          {selectedRole ? (
            <span className={`role-pill role-${selectedRole}`}>{selectedRole}</span>
          ) : null}

          {selectedTenant && memberships.length > 1 ? (
            <TenantSwitcher
              memberships={memberships}
              selectedTenantId={selectedTenant.id}
              onSelect={handleSelectTenant}
            />
          ) : null}

          {session ? (
            <button
              type="button"
              className="secondary-button topbar-signout"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </button>
          ) : null}

          {selectedMembership ? (
            <span className="mobile-view-badge">{activeViewLabel}</span>
          ) : null}

          {session && !recovery && !isJoining ? (
            <button
              type="button"
              className="mobile-menu-toggle"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">{mobileMenuOpen ? '×' : '☰'}</span>
            </button>
          ) : null}
        </div>

        {session && !recovery && !isJoining && mobileMenuOpen ? (
          <div className="mobile-menu-panel" id="mobile-menu">
            {selectedMembership ? (
              <>
                <div className="mobile-menu-group">
                  <p className="eyebrow">Group</p>
                  <strong>{selectedMembership.tenant.name}</strong>
                  <span className="beer-meta">{selectedMembership.tenant.slug}</span>
                  <span className={`role-pill role-${selectedMembership.role}`}>
                    {selectedMembership.role}
                  </span>
                </div>

                <nav className="mobile-view-nav" aria-label="App sections">
                  {VIEW_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={activeView === tab.id ? 'active' : ''}
                      aria-current={activeView === tab.id ? 'page' : undefined}
                      onClick={() => handleViewChange(tab.id)}
                    >
                      <span>{tab.label}</span>
                      {activeView === tab.id ? <span aria-hidden="true">✓</span> : null}
                    </button>
                  ))}
                </nav>

                {memberships.length > 1 ? (
                  <TenantSwitcher
                    memberships={memberships}
                    selectedTenantId={selectedMembership.tenant.id}
                    onSelect={handleSelectTenant}
                  />
                ) : null}

                <hr className="mobile-menu-divider" />
              </>
            ) : null}

            {session ? (
              <button
                type="button"
                className="secondary-button mobile-menu-signout"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {session && !recovery && !isJoining && selectedMembership ? (
        <div className="view-nav-shell">
          <nav className="view-nav" aria-label="App sections">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeView === tab.id ? 'active' : ''}
                aria-current={activeView === tab.id ? 'page' : undefined}
                onClick={() => handleViewChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      ) : null}

      <main className="page-grid">
        {!hasSupabaseConfig ? (
          <section className="panel full-width">
            <p className="eyebrow">Configuration</p>
            <h2>Connect Supabase</h2>
            <p className="status-text">{supabaseConfigError}</p>
            <p className="muted">
              Create a <code>.env</code> file with <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>, then apply{' '}
              <code>supabase/migrations/202610200001_init.sql</code>.
            </p>
          </section>
        ) : null}

        {hasSupabaseConfig && authLoading ? (
          <LoadingPanel label="Checking your session…" />
        ) : null}

        {hasSupabaseConfig && !authLoading && !session ? (
          <AuthPanel onSignIn={signIn} onSignUp={signUp} onResetPassword={resetPassword} />
        ) : null}

        {authError ? (
          <StatusBanner tone="error" onDismiss={clearAuthError}>
            {authError}
          </StatusBanner>
        ) : null}

        {session && !recovery && (membershipsLoading || isJoining) ? (
          <LoadingPanel label={isJoining ? 'Joining the group…' : 'Loading your groups…'} />
        ) : null}

        {joinError ? (
          <StatusBanner tone="error" onDismiss={() => setJoinError(null)}>
            {joinError}
          </StatusBanner>
        ) : null}

        {session && recovery ? (
          <PasswordRecoveryPanel
            onUpdatePassword={updatePassword}
            onCancel={clearRecovery}
          />
        ) : null}

        {membershipsError && memberships.length > 0 ? (
          <StatusBanner tone="error" onDismiss={clearMembershipsError}>
            {membershipsError}
          </StatusBanner>
        ) : null}

        {session &&
        !recovery &&
        !isJoining &&
        !membershipsLoading &&
        membershipsError &&
        memberships.length === 0 ? (
          <section className="panel full-width">
            <p className="eyebrow">Groups</p>
            <h2>Could not load your groups</h2>
            <p className="status-text">{membershipsError}</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => void refreshMemberships()}
            >
              Try again
            </button>
          </section>
        ) : null}

        {session &&
        !recovery &&
        !isJoining &&
        !membershipsLoading &&
        !membershipsError &&
        memberships.length === 0 ? (
          <TenantSetup onCreate={handleCreateTenant} onJoin={handleJoinTenant} />
        ) : null}

        {tastingsError ? (
          <StatusBanner tone="error" onDismiss={() => setTastingsError(null)}>
            <p>{tastingsError}</p>
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => setTastingsNonce((nonce) => nonce + 1)}
            >
              Retry
            </button>
          </StatusBanner>
        ) : null}

        {invitesError ? (
          <StatusBanner tone="error" onDismiss={() => setInvitesError(null)}>
            {invitesError}
          </StatusBanner>
        ) : null}

        {snapshotError ? (
          <StatusBanner tone="warning" onDismiss={clearSnapshotError}>
            {snapshotError}
          </StatusBanner>
        ) : null}

        {realtimeStatus === 'error' ? (
          <StatusBanner tone="warning">
            <p>Realtime connection interrupted. The app is retrying.</p>
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => void refreshSnapshot({ silent: true })}
            >
              Refresh now
            </button>
          </StatusBanner>
        ) : null}

        {session && !recovery && !isJoining && selectedMembership ? (
          <>
            <div className="app-view" hidden={activeView !== 'tasting'}>
              <CurrentTastingBar
                tastings={tastings}
                selectedTasting={selectedTasting}
                loading={tastingsLoading}
                onSelect={handleSelectTasting}
                onManage={() => handleViewChange('group')}
              />

              {selectedTasting && activeSnapshot ? (
                <>
                  <ScoreBoard
                    key={activeSnapshot.tasting.id}
                    snapshot={activeSnapshot}
                    currentUserId={session.user.id}
                    role={selectedMembership.role}
                    readOnly={selectedTasting.status === 'completed'}
                    onSave={handleSaveScores}
                    onRefresh={handleRefreshSnapshot}
                    onDirtyChange={handleDirtyChange}
                  />

                  <ParticipantForm
                    key={`participants-${activeSnapshot.tasting.id}`}
                    participants={activeSnapshot.participants}
                    currentUserId={session.user.id}
                    role={selectedMembership.role}
                    onAdd={handleAddParticipant}
                    onRename={handleRenameParticipant}
                    onRemove={handleRemoveParticipant}
                    readOnly={selectedTasting.status === 'completed'}
                  />

                  <BeerForm
                    key={`beers-${activeSnapshot.tasting.id}`}
                    beers={activeSnapshot.beers}
                    onAdd={handleAddBeer}
                    onRemove={handleRemoveBeer}
                    readOnly={selectedTasting.status === 'completed'}
                  />

                  <RankingPanel
                    rankings={rankings}
                    tastingTitle={activeSnapshot.tasting.title}
                  />
                </>
              ) : null}

              {selectedTasting && !activeSnapshot && snapshotStatus !== 'error' ? (
                <LoadingPanel label="Loading the tasting snapshot…" />
              ) : null}

              {selectedTasting && !activeSnapshot && snapshotStatus === 'error' ? (
                <section className="panel full-width">
                  <p className="eyebrow">Snapshot</p>
                  <h2>Could not load this tasting</h2>
                  <p className="status-text">{snapshotError}</p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void refreshSnapshot()}
                  >
                    Try again
                  </button>
                </section>
              ) : null}
            </div>

            <div className="app-view" hidden={activeView !== 'overall'}>
              <OverallRankingPanel
                key={`overall-${selectedMembership.tenant.id}`}
                tenantId={selectedMembership.tenant.id}
                tenantName={selectedMembership.tenant.name}
                refreshSeed={tenantRankingSeed}
                active={activeView === 'overall'}
              />
            </div>

            <div className="app-view" hidden={activeView !== 'group'}>
              <section className="panel full-width">
                <p className="eyebrow">Group</p>
                <h2>{selectedMembership.tenant.name}</h2>
                <p className="muted">
                  Tastings, invites, group access and the remaining app actions.
                </p>
              </section>

              <TastingPanel
                key={`tastings-${selectedMembership.tenant.id}`}
                tastings={tastings}
                selectedTasting={selectedTasting}
                role={selectedMembership.role}
                currentUserId={session.user.id}
                loading={tastingsLoading}
                onSelect={handleSelectTasting}
                onCreate={handleCreateTasting}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteTasting}
              />

              {selectedMembership.role !== 'member' ? (
                <InvitePanel
                  key={`invites-${selectedMembership.tenant.id}`}
                  invites={invites}
                  role={selectedMembership.role}
                  tenantId={selectedMembership.tenant.id}
                  tastingId={selectedTasting?.id ?? null}
                  onCreate={handleCreateInvite}
                  onRevoke={handleRevokeInvite}
                />
              ) : null}

              {selectedTasting && activeSnapshot ? (
                <SnapshotSummary
                  snapshot={activeSnapshot}
                  snapshotStatus={snapshotStatus}
                  realtimeStatus={realtimeStatus}
                  lastError={snapshotError}
                />
              ) : null}

              <GroupActionsPanel
                onCreate={handleCreateTenant}
                onJoin={handleJoinTenant}
              />
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

export default App
