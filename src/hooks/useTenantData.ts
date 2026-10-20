import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMemberships, formatError } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { TenantMembership } from '../lib/types'

export function useTenantData(userId: string | null) {
  const [memberships, setMemberships] = useState<TenantMembership[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const requestId = useRef(0)

  const refresh = useCallback(async (): Promise<TenantMembership[]> => {
    const currentRequest = ++requestId.current

    if (!supabase || !userId) {
      setMemberships([])
      setError(null)
      setLoadedUserId(null)
      return []
    }

    try {
      const next = await fetchMemberships(supabase, userId)
      if (currentRequest !== requestId.current) {
        return []
      }
      setMemberships(next)
      setError(null)
      setLoadedUserId(userId)
      return next
    } catch (caught) {
      if (currentRequest === requestId.current) {
        setError(formatError(caught))
        setLoadedUserId(userId)
      }
      return []
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Only the first load for a user should take over the screen. A manual
  // refresh keeps the current workspace visible.
  const loading = Boolean(userId) && loadedUserId !== userId

  return {
    memberships,
    loading,
    error,
    refresh,
    clearError: () => setError(null),
  }
}
