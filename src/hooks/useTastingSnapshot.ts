import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSnapshot, formatError } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { TastingSnapshot } from '../lib/types'

export type SnapshotStatus = 'idle' | 'loading' | 'live' | 'error'
export type RealtimeStatus = 'offline' | 'connecting' | 'live' | 'error'

export function useTastingSnapshot(tastingId: string | null) {
  const [snapshot, setSnapshot] = useState<TastingSnapshot | null>(null)
  const [status, setStatus] = useState<SnapshotStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('offline')
  const [reconnectKey, setReconnectKey] = useState(0)
  const requestId = useRef(0)

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!supabase || !tastingId) {
        requestId.current += 1
        setSnapshot(null)
        setStatus('idle')
        setError(null)
        return
      }

      const currentRequest = ++requestId.current
      if (!options?.silent) {
        setStatus('loading')
      }

      try {
        const next = await fetchSnapshot(supabase, tastingId)

        if (currentRequest !== requestId.current) {
          return
        }

        if (!next) {
          setSnapshot(null)
          setStatus('error')
          setError('This tasting is no longer available.')
          return
        }

        setSnapshot(next)
        setStatus('live')
        setError(null)
      } catch (caught) {
        if (currentRequest !== requestId.current) {
          return
        }

        // Keep the last known good snapshot on a transient failure. The user
        // still sees the data they had; the banner tells them it is stale.
        setStatus('error')
        setError(formatError(caught))
      }
    },
    [tastingId],
  )

  useEffect(() => {
    // Invalidate any in-flight request immediately so a previous tasting's
    // response cannot land while the new one is loading.
    requestId.current += 1
    setSnapshot(null)
    setStatus(tastingId ? 'loading' : 'idle')
    setError(null)
    void refresh()
  }, [refresh, tastingId])

  useEffect(() => {
    if (!supabase || !tastingId) {
      setRealtimeStatus('offline')
      return
    }

    let cancelled = false
    let refreshTimer: number | undefined
    let reconnectTimer: number | undefined
    let retries = 0

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void refresh({ silent: true })
      }, 150)
    }

    setRealtimeStatus('connecting')

    const channel = supabase
      .channel(`tasting:${tastingId}:${reconnectKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scores',
          filter: `tasting_id=eq.${tastingId}`,
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasting_participants',
          filter: `tasting_id=eq.${tastingId}`,
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasting_beers',
          filter: `tasting_id=eq.${tastingId}`,
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tastings',
          filter: `id=eq.${tastingId}`,
        },
        scheduleRefresh,
      )
      .subscribe((nextStatus) => {
        if (cancelled) return

        if (nextStatus === 'SUBSCRIBED') {
          retries = 0
          setRealtimeStatus('live')
          // Catch up on anything that happened while the channel was down.
          scheduleRefresh()
          return
        }

        if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
          setRealtimeStatus('error')
          retries += 1
          const delay = Math.min(30_000, 1_000 * 2 ** retries)
          reconnectTimer = window.setTimeout(() => {
            if (!cancelled) {
              setReconnectKey((key) => key + 1)
            }
          }, delay)
          return
        }

        if (nextStatus === 'CLOSED') {
          setRealtimeStatus('offline')
          reconnectTimer = window.setTimeout(() => {
            if (!cancelled) {
              setReconnectKey((key) => key + 1)
            }
          }, 2_000)
        }
      })

    return () => {
      cancelled = true
      window.clearTimeout(refreshTimer)
      window.clearTimeout(reconnectTimer)
      void supabase?.removeChannel(channel)
    }
  }, [refresh, tastingId, reconnectKey])

  useEffect(() => {
    if (!tastingId) return

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh({ silent: true })
      }
    }
    const onOnline = () => {
      void refresh({ silent: true })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh, tastingId])

  return {
    snapshot,
    status,
    error,
    realtimeStatus,
    refresh,
    clearError: () => setError(null),
  }
}
