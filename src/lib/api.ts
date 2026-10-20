import type { Json } from './database.types'
import { buildTastingSnapshot } from './snapshot'
import type { AppSupabaseClient } from './supabase'
import type {
  Beer,
  Participant,
  SaveScoreInput,
  SaveScoreResult,
  ScoreRow,
  TastingSnapshot,
  TastingStatus,
  TastingSummary,
  Tenant,
  TenantInvite,
  TenantMembership,
  TenantRankingData,
  TenantRole,
} from './types'

type RawTenant = {
  id: string
  name: string
  slug: string
}

type MembershipRow = {
  role: TenantRole
  created_at: string
  tenants: RawTenant | RawTenant[] | null
}

type TastingRow = {
  id: string
  tenant_id: string
  host_user_id: string
  title: string
  description: string | null
  tasting_date: string
  status: TastingStatus
  created_at: string
}

type TastingWithTenantRow = TastingRow & {
  tenants: RawTenant | RawTenant[] | null
}

type ParticipantDbRow = {
  id: string
  display_name: string
  user_id: string | null
  is_host: boolean
}

type BeerDbRow = {
  id: string
  name: string
  brewery: string | null
  style: string | null
  alcohol: number | null
}

type AssignmentDbRow = {
  beer_id: string
  position: number
}

type ScoreDbRow = {
  participant_id: string
  beer_id: string
  smell: number | null
  color: number | null
  branding: number | null
  taste: number | null
  notes: string | null
  updated_at: string
}

type InviteRow = {
  id: string
  token: string
  role: TenantRole
  created_at: string
  expires_at: string
  accepted_at: string | null
}

type TenantRankingTastingRow = {
  id: string
  title: string
  tasting_date: string
  status: TastingStatus
}

type TenantRankingParticipantRow = {
  id: string
  tasting_id: string
  display_name: string
  user_id: string | null
}

type TenantRankingScoreRow = {
  tasting_id: string
  participant_id: string
  beer_id: string
  smell: number | null
  color: number | null
  branding: number | null
  taste: number | null
}

type ErrorLike = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const candidate = error as ErrorLike

    switch (candidate.code) {
      case '23505':
        return 'That name is already in use. Choose a different one.'
      case '23503':
        return 'That item is still referenced by other data.'
      case '23514':
        return candidate.message ?? 'That value is not allowed.'
      case '42501':
        return 'You do not have permission to do that.'
      case '40001':
        return 'Someone else changed this data. Reload and try again.'
      case '28000':
        return 'Please sign in again.'
      case 'PGRST116':
        return 'That item no longer exists.'
      default:
        if (candidate.message) {
          return candidate.message
        }
    }
  }

  return 'Something went wrong.'
}

type PageQuery<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null
    error: unknown
    count: number | null
  }>
}

/**
 * PostgREST caps a single response (Supabase's default is 1000 rows). The
 * imported group has more than 5,000 scores, and the synthetic 2020 tasting
 * alone has more than 3,000, so every potentially large query must page.
 *
 * `count` is requested as exact so this also works when the server's row cap
 * is lower than the page size: keep advancing by the number of rows actually
 * returned until the reported count is reached.
 */
export async function fetchAllPages<T>(
  makeQuery: () => PageQuery<T>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const { data, error, count } = await makeQuery().range(from, from + pageSize - 1)

    if (error) {
      throw new Error(formatError(error))
    }

    const page = data ?? []
    rows.push(...page)

    if (page.length === 0) {
      break
    }
    if (typeof count === 'number' && rows.length >= count) {
      break
    }

    from += page.length
  }

  return rows
}

const normalizeDate = (value: string | null | undefined): string =>
  value ? String(value).slice(0, 10) : ''

const toTenant = (row: RawTenant): Tenant => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
})

const toTasting = (row: TastingRow): TastingSummary => ({
  id: row.id,
  tenantId: row.tenant_id,
  hostUserId: row.host_user_id,
  title: row.title,
  status: row.status,
  date: normalizeDate(row.tasting_date),
  createdAt: row.created_at,
})

export async function fetchMemberships(
  client: AppSupabaseClient,
  userId: string,
): Promise<TenantMembership[]> {
  const { data, error } = await client
    .from('tenant_members')
    .select('role, created_at, tenants(id, name, slug)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(formatError(error))
  }

  return ((data ?? []) as unknown as MembershipRow[]).flatMap((row) => {
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants
    if (!tenant) {
      return []
    }

    return [
      {
        tenant: toTenant(tenant),
        role: row.role,
        createdAt: row.created_at,
      },
    ]
  })
}

export async function createTenant(
  client: AppSupabaseClient,
  name: string,
  slug: string,
): Promise<Tenant> {
  const { data, error } = await client.rpc('create_tenant', {
    p_name: name.trim(),
    p_slug: slug.trim() || null,
  })

  if (error) {
    throw new Error(formatError(error))
  }

  return toTenant(data as unknown as RawTenant)
}

export async function createTenantInvite(
  client: AppSupabaseClient,
  tenantId: string,
  role: Exclude<TenantRole, 'owner'> = 'member',
): Promise<TenantInvite> {
  const { data, error } = await client.rpc('create_tenant_invite', {
    p_tenant_id: tenantId,
    p_role: role,
  })

  if (error) {
    throw new Error(formatError(error))
  }

  const row = data as unknown as InviteRow
  return {
    id: row.id,
    token: row.token,
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
  }
}

export async function fetchTenantInvites(
  client: AppSupabaseClient,
  tenantId: string,
): Promise<TenantInvite[]> {
  const { data, error } = await client
    .from('tenant_invites')
    .select('id, token, role, created_at, expires_at, accepted_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(formatError(error))
  }

  return ((data ?? []) as unknown as InviteRow[]).map((row) => ({
    id: row.id,
    token: row.token,
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
  }))
}

export async function deleteTenantInvite(
  client: AppSupabaseClient,
  inviteId: string,
): Promise<void> {
  const { error } = await client.from('tenant_invites').delete().eq('id', inviteId)

  if (error) {
    throw new Error(formatError(error))
  }
}

export async function acceptTenantInvite(
  client: AppSupabaseClient,
  token: string,
): Promise<string> {
  const { data, error } = await client.rpc('accept_tenant_invite', {
    p_token: token.trim(),
  })

  if (error) {
    throw new Error(formatError(error))
  }

  return data as string
}

export async function fetchTastings(
  client: AppSupabaseClient,
  tenantId: string,
): Promise<TastingSummary[]> {
  const { data, error } = await client
    .from('tastings')
    .select('id, tenant_id, host_user_id, title, status, tasting_date, created_at')
    .eq('tenant_id', tenantId)
    .order('tasting_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(formatError(error))
  }

  return ((data ?? []) as unknown as TastingRow[]).map(toTasting)
}

export async function createTasting(
  client: AppSupabaseClient,
  tenantId: string,
  title: string,
  date: string,
): Promise<TastingSummary> {
  const { data, error } = await client.rpc('create_tasting', {
    p_tenant_id: tenantId,
    p_title: title.trim(),
    p_date: date || null,
  })

  if (error) {
    throw new Error(formatError(error))
  }

  return toTasting(data as unknown as TastingRow)
}

export async function updateTastingStatus(
  client: AppSupabaseClient,
  tastingId: string,
  status: TastingStatus,
): Promise<void> {
  const { error } = await client
    .from('tastings')
    .update({ status })
    .eq('id', tastingId)

  if (error) {
    throw new Error(formatError(error))
  }
}

export async function deleteTasting(
  client: AppSupabaseClient,
  tastingId: string,
): Promise<void> {
  const { error } = await client.from('tastings').delete().eq('id', tastingId)

  if (error) {
    throw new Error(formatError(error))
  }
}

export async function addParticipant(
  client: AppSupabaseClient,
  tastingId: string,
  displayName: string,
  userId: string | null,
): Promise<Participant> {
  const { data, error } = await client
    .from('tasting_participants')
    .insert({
      tasting_id: tastingId,
      display_name: displayName.trim(),
      user_id: userId,
      is_host: false,
    })
    .select('id, display_name, user_id, is_host')
    .single()

  if (error) {
    throw new Error(formatError(error))
  }

  const row = data as unknown as ParticipantDbRow
  return {
    id: row.id,
    displayName: row.display_name,
    userId: row.user_id,
    isHost: row.is_host,
  }
}

export async function removeParticipant(
  client: AppSupabaseClient,
  participantId: string,
): Promise<void> {
  const { error } = await client
    .from('tasting_participants')
    .delete()
    .eq('id', participantId)

  if (error) {
    throw new Error(formatError(error))
  }
}

export async function addBeerToTasting(
  client: AppSupabaseClient,
  tastingId: string,
  beer: {
    name: string
    brewery: string | null
    style: string | null
    alcohol: number | null
  },
): Promise<void> {
  const { error } = await client.rpc('add_beer_to_tasting', {
    p_tasting_id: tastingId,
    p_name: beer.name.trim(),
    p_brewery: beer.brewery,
    p_style: beer.style,
    p_alcohol: beer.alcohol,
  })

  if (error) {
    throw new Error(formatError(error))
  }
}

export async function removeBeerFromTasting(
  client: AppSupabaseClient,
  tastingId: string,
  beerId: string,
): Promise<void> {
  const { error } = await client
    .from('tasting_beers')
    .delete()
    .eq('tasting_id', tastingId)
    .eq('beer_id', beerId)

  if (error) {
    throw new Error(formatError(error))
  }
}

export async function fetchSnapshot(
  client: AppSupabaseClient,
  tastingId: string,
): Promise<TastingSnapshot | null> {
  const { data: tastingData, error: tastingError } = await client
    .from('tastings')
    .select(
      'id, tenant_id, host_user_id, title, description, tasting_date, status, created_at, tenants(id, name, slug)',
    )
    .eq('id', tastingId)
    .maybeSingle()

  if (tastingError) {
    throw new Error(formatError(tastingError))
  }

  const tastingRow = tastingData as unknown as TastingWithTenantRow | null
  if (!tastingRow) {
    return null
  }

  const tenantRaw = Array.isArray(tastingRow.tenants)
    ? tastingRow.tenants[0]
    : tastingRow.tenants

  if (!tenantRaw) {
    return null
  }

  const [participantsResult, assignmentsResult, scoreRows] = await Promise.all([
    client
      .from('tasting_participants')
      .select('id, display_name, user_id, is_host')
      .eq('tasting_id', tastingId)
      // Order by columns that have existed since the first scaffold. The host
      // comes first, then names alphabetically. This avoids making the whole
      // snapshot depend on the optional created_at metadata column.
      .order('is_host', { ascending: false })
      .order('display_name', { ascending: true }),
    client
      .from('tasting_beers')
      .select('beer_id, position')
      .eq('tasting_id', tastingId)
      .order('position', { ascending: true }),
    fetchAllPages<ScoreDbRow>(
      () =>
        client
          .from('scores')
          .select(
            'participant_id, beer_id, smell, color, branding, taste, notes, updated_at',
            { count: 'exact' },
          )
          .eq('tasting_id', tastingId)
          .order('participant_id', { ascending: true })
          .order('beer_id', { ascending: true }) as unknown as PageQuery<ScoreDbRow>,
    ),
  ])

  if (participantsResult.error) {
    throw new Error(formatError(participantsResult.error))
  }
  if (assignmentsResult.error) {
    throw new Error(formatError(assignmentsResult.error))
  }

  const assignments = (
    (assignmentsResult.data ?? []) as unknown as AssignmentDbRow[]
  ).map((row) => ({
    beerId: row.beer_id,
    position: row.position,
  }))

  const assignedBeerIds = new Set(assignments.map((assignment) => assignment.beerId))
  let beerRows: BeerDbRow[] = []

  if (assignedBeerIds.size > 0) {
    if (assignedBeerIds.size > 100) {
      // Putting hundreds of UUIDs in `.in(...)` produces a very long request
      // URL. The synthetic 2020 tasting alone has 284 beers, so fetch the
      // tenant catalog and filter locally instead.
      const tenantBeerRows = await fetchAllPages<BeerDbRow>(
        () =>
          client
            .from('beers')
            .select('id, name, brewery, style, alcohol', { count: 'exact' })
            .eq('tenant_id', tastingRow.tenant_id)
            .order('id', { ascending: true }) as unknown as PageQuery<BeerDbRow>,
      )

      beerRows = tenantBeerRows.filter((row) => assignedBeerIds.has(row.id))
    } else {
      const { data: beersData, error: beersError } = await client
        .from('beers')
        .select('id, name, brewery, style, alcohol')
        .eq('tenant_id', tastingRow.tenant_id)
        .in('id', [...assignedBeerIds])

      if (beersError) {
        throw new Error(formatError(beersError))
      }

      beerRows = (beersData ?? []) as unknown as BeerDbRow[]
    }
  }

  const participants: Participant[] = (
    (participantsResult.data ?? []) as unknown as ParticipantDbRow[]
  ).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    userId: row.user_id,
    isHost: row.is_host,
  }))

  const beers: Beer[] = beerRows.map((row) => ({
    id: row.id,
    name: row.name,
    brewery: row.brewery,
    style: row.style,
    alcohol: row.alcohol,
  }))

  const scores: ScoreRow[] = scoreRows.map((row) => ({
    participantId: row.participant_id,
    beerId: row.beer_id,
    smell: row.smell,
    color: row.color,
    branding: row.branding,
    taste: row.taste,
    notes: row.notes,
    updatedAt: row.updated_at,
  }))

  return buildTastingSnapshot({
    tenant: toTenant(tenantRaw),
    tasting: toTasting(tastingRow),
    participants,
    assignments,
    beers,
    scores,
  })
}

export async function fetchTenantRankingData(
  client: AppSupabaseClient,
  tenantId: string,
): Promise<TenantRankingData> {
  const tastingRows = await fetchAllPages<TenantRankingTastingRow>(
    () =>
      client
        .from('tastings')
        .select('id, title, tasting_date, status', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('id', { ascending: true }) as unknown as PageQuery<TenantRankingTastingRow>,
  )

  const tastingIds = tastingRows.map((row) => row.id)
  if (tastingIds.length === 0) {
    return { tastings: [], participants: [], beers: [], scores: [] }
  }

  const [participantRows, beerRows, scoreRows] = await Promise.all([
    fetchAllPages<TenantRankingParticipantRow>(
      () =>
        client
          .from('tasting_participants')
          .select('id, tasting_id, display_name, user_id', { count: 'exact' })
          .in('tasting_id', tastingIds)
          .order('id', { ascending: true }) as unknown as PageQuery<TenantRankingParticipantRow>,
    ),
    fetchAllPages<BeerDbRow>(
      () =>
        client
          .from('beers')
          .select('id, name, brewery, style, alcohol', { count: 'exact' })
          .eq('tenant_id', tenantId)
          .order('id', { ascending: true }) as unknown as PageQuery<BeerDbRow>,
    ),
    fetchAllPages<TenantRankingScoreRow>(
      () =>
        client
          .from('scores')
          .select('tasting_id, participant_id, beer_id, smell, color, branding, taste', {
            count: 'exact',
          })
          .in('tasting_id', tastingIds)
          .order('tasting_id', { ascending: true })
          .order('participant_id', { ascending: true })
          .order('beer_id', { ascending: true }) as unknown as PageQuery<TenantRankingScoreRow>,
    ),
  ])

  return {
    tastings: tastingRows.map((row) => ({
      id: row.id,
      title: row.title,
      date: normalizeDate(row.tasting_date),
      status: row.status,
    })),
    participants: participantRows.map((row) => ({
      id: row.id,
      tastingId: row.tasting_id,
      displayName: row.display_name,
      userId: row.user_id,
    })),
    beers: beerRows.map((row) => ({
      id: row.id,
      name: row.name,
      brewery: row.brewery,
      style: row.style,
      alcohol: row.alcohol,
    })),
    scores: scoreRows.map((row) => ({
      tastingId: row.tasting_id,
      participantId: row.participant_id,
      beerId: row.beer_id,
      smell: row.smell,
      color: row.color,
      branding: row.branding,
      taste: row.taste,
    })),
  }
}

export async function saveScores(
  client: AppSupabaseClient,
  tastingId: string,
  rows: SaveScoreInput[],
): Promise<SaveScoreResult[]> {
  const { data, error } = await client.rpc('save_scores', {
    p_tasting_id: tastingId,
    p_rows: rows as unknown as Json,
  })

  if (error) {
    throw new Error(formatError(error))
  }

  if (!Array.isArray(data)) {
    throw new Error('Unexpected response while saving scores.')
  }

  return (data as unknown as Array<Record<string, unknown>>).map((row) => ({
    participantId: String(row.participantId),
    beerId: String(row.beerId),
    status: row.status === 'conflict' ? 'conflict' : 'saved',
    ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
  }))
}
