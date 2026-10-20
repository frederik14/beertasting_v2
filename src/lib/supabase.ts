import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { TastingSnapshot } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

type ParticipantRow = {
  id: string
  display_name: string
  user_id?: string | null
}

type BeerRow = {
  id: string
  name: string
  brewery?: string | null
  style?: string | null
  alcohol?: number | null
}

type ScoreRow = {
  participant_id: string
  beer_id: string
  smell: number | null
  color: number | null
  branding: number | null
  taste: number | null
  notes?: string | null
}

export async function ensureProfile(
  client: SupabaseClient,
  userId: string,
  fullName?: string | null,
) {
  const { data: existingProfile } = await client
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (existingProfile) {
    return existingProfile
  }

  const { data, error } = await client
    .from('profiles')
    .insert({
      id: userId,
      full_name: fullName ?? null,
      avatar_url: null,
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function fetchCurrentTenant(client: SupabaseClient, userId: string) {
  const { data: memberships, error } = await client
    .from('tenant_members')
    .select('tenant_id, tenants(id, name, slug)')
    .eq('user_id', userId)
    .limit(1)

  if (error) {
    throw error
  }

  const membership = memberships?.[0] as { tenants?: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] } | undefined
  if (!membership) {
    return null
  }

  const tenant = Array.isArray(membership.tenants)
    ? membership.tenants[0]
    : membership.tenants

  if (!tenant) {
    return null
  }

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
  }
}

export async function createTenantForUser(
  client: SupabaseClient,
  userId: string,
  name: string,
  preferredSlug?: string,
) {
  const safeName = name.trim()
  if (!safeName) {
    throw new Error('Tenant name is required.')
  }

  const normalized = (preferredSlug ?? safeName)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const slug = normalized || 'tenant'

  const { data: existingTenant } = await client
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  const finalSlug = existingTenant ? `${slug}-${Math.random().toString(36).slice(2, 8)}` : slug

  const { data: tenant, error: tenantError } = await client
    .from('tenants')
    .insert({ name: safeName, slug: finalSlug })
    .select('id, name, slug')
    .single()

  if (tenantError) {
    throw tenantError
  }

  const { error: memberError } = await client.from('tenant_members').insert({
    tenant_id: tenant.id,
    user_id: userId,
    role: 'owner',
  })

  if (memberError) {
    throw memberError
  }

  return tenant
}

export async function fetchTenantTastings(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from('tastings')
    .select('id, title, status, tasting_date')
    .eq('tenant_id', tenantId)
    .order('tasting_date', { ascending: false })

  if (error) {
    throw error
  }

  return data ?? []
}

export async function createTastingForTenant(
  client: SupabaseClient,
  tenantId: string,
  hostUserId: string,
  title: string,
  tastingDate: string,
) {
  const safeTitle = title.trim()
  if (!safeTitle) {
    throw new Error('Tasting title is required.')
  }

  const { data, error } = await client
    .from('tastings')
    .insert({
      tenant_id: tenantId,
      host_user_id: hostUserId,
      title: safeTitle,
      tasting_date: tastingDate || new Date().toISOString(),
      status: 'draft',
    })
    .select('id, title, status, tasting_date')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function addParticipantToTasting(
  client: SupabaseClient,
  tastingId: string,
  displayName: string,
  userId?: string | null,
  isHost = false,
) {
  const safeName = displayName.trim()
  if (!safeName) {
    throw new Error('Participant name is required.')
  }

  const { data, error } = await client
    .from('tasting_participants')
    .insert({
      tasting_id: tastingId,
      user_id: userId ?? null,
      display_name: safeName,
      is_host: isHost,
    })
    .select('id, display_name, user_id')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function upsertBeerForTenant(
  client: SupabaseClient,
  tenantId: string,
  beer: {
    name: string
    brewery?: string | null
    style?: string | null
    alcohol?: number | null
  },
) {
  const safeName = beer.name.trim()
  if (!safeName) {
    throw new Error('Beer name is required.')
  }

  const { data, error } = await client
    .from('beers')
    .upsert(
      {
        tenant_id: tenantId,
        name: safeName,
        brewery: beer.brewery?.trim() || null,
        style: beer.style?.trim() || null,
        alcohol: beer.alcohol ?? null,
      },
      { onConflict: 'tenant_id,name' },
    )
    .select('id, name, brewery, style, alcohol')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function assignBeerToTasting(
  client: SupabaseClient,
  tastingId: string,
  beerId: string,
  position: number,
) {
  const { data, error } = await client
    .from('tasting_beers')
    .upsert(
      {
        tasting_id: tastingId,
        beer_id: beerId,
        position,
      },
      { onConflict: 'tasting_id,beer_id' },
    )
    .select('id, beer_id, position')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function fetchSnapshotForTasting(
  client: SupabaseClient,
  tastingId: string,
): Promise<TastingSnapshot | null> {
  const { data: tasting } = await client
    .from('tastings')
    .select('id, title, status, tasting_date, tenant_id')
    .eq('id', tastingId)
    .maybeSingle()

  if (!tasting) {
    return null
  }

  const { data: tenant } = await client
    .from('tenants')
    .select('id, name, slug')
    .eq('id', tasting.tenant_id)
    .maybeSingle()

  if (!tenant) {
    return null
  }

  const { data: participants } = await client
    .from('tasting_participants')
    .select('id, display_name, user_id')
    .eq('tasting_id', tasting.id)

  const { data: tastingBeerRows } = await client
    .from('tasting_beers')
    .select('beer_id, position')
    .eq('tasting_id', tasting.id)
    .order('position', { ascending: true })

  const beerIds = (tastingBeerRows ?? []).map((row) => row.beer_id)
  const { data: beers } = beerIds.length
    ? await client.from('beers').select('id, name, brewery, style, alcohol').in('id', beerIds)
    : { data: [] }

  const beerMap = new Map<string, BeerRow>((beers ?? []).map((beer) => [beer.id, beer]))

  const { data: scores } = await client
    .from('scores')
    .select('participant_id, beer_id, smell, color, branding, taste, notes')
    .eq('tasting_id', tasting.id)

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    },
    tasting: {
      id: tasting.id,
      title: tasting.title,
      status: tasting.status,
      date: new Date(tasting.tasting_date).toISOString().slice(0, 10),
    },
    participants: (participants ?? []).map((participant: ParticipantRow) => ({
      id: participant.id,
      displayName: participant.display_name,
      userId: participant.user_id ?? null,
    })),
    beers: (tastingBeerRows ?? [])
      .map((assignment) => beerMap.get(assignment.beer_id))
      .filter((beer): beer is BeerRow => Boolean(beer))
      .map((beer) => ({
        id: beer.id,
        name: beer.name,
        brewery: beer.brewery ?? null,
        style: beer.style ?? null,
        alcohol: beer.alcohol ?? null,
      })),
    rows: (scores ?? []).map((score: ScoreRow) => ({
      participantId: score.participant_id,
      beerId: score.beer_id,
      smell: score.smell,
      color: score.color,
      branding: score.branding,
      taste: score.taste,
      notes: score.notes ?? null,
    })),
  }
}

export async function fetchLatestSnapshot(
  client: SupabaseClient | null,
): Promise<TastingSnapshot | null> {
  if (!client) {
    return null
  }

  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return null
  }

  const { data: memberships } = await client
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)

  if (!memberships?.length) {
    return null
  }

  const tenantId = memberships[0].tenant_id

  const { data: tasting } = await client
    .from('tastings')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('tasting_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tasting) {
    return null
  }

  return fetchSnapshotForTasting(client, tasting.id)
}

export async function saveScoreRow(
  client: SupabaseClient,
  tastingId: string,
  participantId: string,
  beerId: string,
  values: {
    smell?: number | null
    color?: number | null
    branding?: number | null
    taste?: number | null
    notes?: string | null
  },
) {
  const payload = {
    tasting_id: tastingId,
    participant_id: participantId,
    beer_id: beerId,
    smell: values.smell ?? null,
    color: values.color ?? null,
    branding: values.branding ?? null,
    taste: values.taste ?? null,
    notes: values.notes ?? null,
  }

  const { data, error } = await client
    .from('scores')
    .upsert(payload, {
      onConflict: 'tasting_id,beer_id,participant_id',
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return data
}
