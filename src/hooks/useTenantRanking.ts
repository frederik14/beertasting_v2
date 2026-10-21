import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTenantRankingData, formatError } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { TenantRankingData } from '../lib/types'

/**
 * Loads every tasting, participant, beer and score for the selected group so
 * the overall ranking can be derived in the browser.
 *
 * `refreshSeed` lets the app request a reload after the user changes scores,
 * participants, beers or tastings. Remote changes in other tastings are picked
 * up with the panel's Refresh button (matching the old app's ranking).
 */
export function useTenantRanking(
  tenantId: string | null,
  refreshSeed = 0,
  enabled = true,
) {
  const [data, setData] = useState<TenantRankingData | null>(null)
  const [loading, setLoading] = useState(Boolean(tenantId) && enabled)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const loadedTenantIdRef = useRef<string | null>(null)

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!supabase || !tenantId) {
        requestId.current += 1
        setData(null)
        setLoading(false)
        setError(null)
        return
      }

      const currentRequest = ++requestId.current
      if (!options?.silent) {
        setLoading(true)
      }

      try {
        const next = await fetchTenantRankingData(supabase, tenantId)

        if (currentRequest !== requestId.current) {
          return
        }

        setData(next)
        setError(null)
      } catch (caught) {
        if (currentRequest !== requestId.current) {
          return
        }

        // Keep showing the last good ranking while the banner explains that it
        // may be stale.
        setError(formatError(caught))
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false)
        }
      }
    },
    [tenantId],
  )

  useEffect(() => {
    if (!enabled) return

    if (loadedTenantIdRef.current !== tenantId) {
      loadedTenantIdRef.current = tenantId
      setData(null)
      setError(null)
    }

    void refresh()
  }, [enabled, tenantId, refreshSeed, refresh])

  return {
    data,
    loading,
    error,
    refresh,
    clearError: () => setError(null),
  }
}
