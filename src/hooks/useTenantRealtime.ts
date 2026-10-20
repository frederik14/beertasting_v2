import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Keeps the tenant-level lists (tastings and beer metadata) fresh.
 * The selected tasting itself is handled by `useTastingSnapshot`.
 */
export function useTenantRealtime(
  tenantId: string | null,
  canSeeInvites: boolean,
  onTastingsChanged: () => void,
  onBeersChanged: () => void,
  onInvitesChanged: () => void,
) {
  useEffect(() => {
    if (!supabase || !tenantId) return

    let timer: number | undefined
    let tastingsPending = false
    let beersPending = false
    let invitesPending = false

    const flush = () => {
      if (tastingsPending) {
        tastingsPending = false
        onTastingsChanged()
      }
      if (beersPending) {
        beersPending = false
        onBeersChanged()
      }
      if (invitesPending) {
        invitesPending = false
        onInvitesChanged()
      }
    }

    const schedule = (kind: 'tastings' | 'beers' | 'invites') => {
      if (kind === 'tastings') {
        tastingsPending = true
      } else if (kind === 'beers') {
        beersPending = true
      } else {
        invitesPending = true
      }
      window.clearTimeout(timer)
      timer = window.setTimeout(flush, 200)
    }

    const channel = supabase
      .channel(`tenant:${tenantId}:${canSeeInvites ? 'admin' : 'member'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tastings',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => schedule('tastings'),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beers',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => schedule('beers'),
      )
    if (canSeeInvites) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tenant_invites',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => schedule('invites'),
      )
    }

    channel.subscribe()

    return () => {
      window.clearTimeout(timer)
      void supabase?.removeChannel(channel)
    }
  }, [tenantId, canSeeInvites, onTastingsChanged, onBeersChanged, onInvitesChanged])
}
