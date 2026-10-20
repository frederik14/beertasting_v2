#!/usr/bin/env node
/**
 * One-off importer for the old Amplify/DynamoDB BeerTasting data into a
 * Supabase tenant (ZBL).
 *
 * It reads the DynamoDB S3 export, transforms the old BeerTasting / Beer /
 * BeerRating items, and writes:
 *
 *   .legacy-export/zbl-legacy-import.sql
 *   .legacy-export/zbl-legacy-report.md
 *
 * It does not write to Supabase. Review the report, provide the ZBL tenant ID
 * and owner profile ID, regenerate, then run the SQL in the Supabase SQL editor
 * (or with psql) inside the transaction that the file creates.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'

const DEFAULTS = {
  bucket: 'front-door-camera',
  prefix: 'AWSDynamoDB/',
  region: 'eu-west-1',
  out: '.legacy-export/zbl-legacy-import.sql',
  report: '.legacy-export/zbl-legacy-report.md',
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  console.log(`Usage:
  node scripts/migrate-legacy-zbl.mjs [options]

Options:
  --tenant-id <uuid>       ZBL tenant id (required for a runnable SQL file)
  --host-user-id <uuid>    ZBL owner profile id used as tastings.host_user_id
  --skip-orphans           Do not import the unassigned 2020 ratings
  --synthetic-title <text> Title for the synthetic unassigned tasting
  --user-map <path>        JSON mapping old userName -> { displayName, userId }
  --bucket <name>          S3 bucket (default ${DEFAULTS.bucket})
  --prefix <prefix>        S3 prefix (default ${DEFAULTS.prefix})
  --region <region>        AWS region (default ${DEFAULTS.region})
  --out <path>             SQL output (default ${DEFAULTS.out})
  --report <path>          Report output (default ${DEFAULTS.report})
  --help                   This help
`)
  process.exit(0)
}

const bucket = args.bucket ?? DEFAULTS.bucket
const prefix = args.prefix ?? DEFAULTS.prefix
const region = args.region ?? DEFAULTS.region
const skipOrphans = Boolean(args['skip-orphans'])
const tenantId = args['tenant-id'] ?? null
const hostUserId = args['host-user-id'] ?? null
const outPath = args.out ?? DEFAULTS.out
const reportPath = args.report ?? DEFAULTS.report
const syntheticTitleOption = args['synthetic-title'] ?? null

if (tenantId && !UUID_RE.test(tenantId)) {
  throw new Error(`--tenant-id is not a UUID: ${tenantId}`)
}
if (hostUserId && !UUID_RE.test(hostUserId)) {
  throw new Error(`--host-user-id is not a UUID: ${hostUserId}`)
}

const userMap = loadUserMap(args['user-map'])

const s3 = new S3Client({ region })
const startedAt = new Date().toISOString()

// ---------------------------------------------------------------------------
// DynamoDB export reading
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const result = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg?.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      result[key] = true
    } else {
      result[key] = next
      i++
    }
  }
  return result
}

function loadUserMap(path) {
  if (!path) return {}
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const normalized = {}
  for (const [oldName, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      normalized[oldName] = { displayName: value, userId: null }
    } else {
      normalized[oldName] = {
        displayName: value.displayName ?? oldName,
        userId: value.userId ?? null,
      }
    }
  }
  return normalized
}

function unmarshal(value) {
  if (value === null || value === undefined) return null
  if ('S' in value) return value.S
  if ('N' in value) return Number(value.N)
  if ('BOOL' in value) return value.BOOL
  if ('NULL' in value) return null
  if ('M' in value) {
    return Object.fromEntries(
      Object.entries(value.M).map(([key, nested]) => [key, unmarshal(nested)]),
    )
  }
  if ('L' in value) return value.L.map(unmarshal)
  if ('SS' in value) return value.SS
  if ('NS' in value) return value.NS.map(Number)
  if ('B' in value) return value.B
  return value
}

async function listExportPrefixes() {
  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: '/',
    }),
  )
  return (result.CommonPrefixes ?? [])
    .map((entry) => entry.Prefix)
    .filter(Boolean)
}

async function getText(key) {
  const result = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  )
  return result.Body.transformToString()
}

async function getJsonLines(key) {
  const text = await getText(key)
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

async function loadTableItems(exportPrefix, manifestSummary) {
  const manifestKey = manifestSummary.manifestFilesS3Key
  const files = await getJsonLines(manifestKey)
  const items = []

  for (const file of files) {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: file.dataFileS3Key }),
    )
    const compressed = Buffer.from(await result.Body.transformToByteArray())
    const text = gunzipSync(compressed).toString('utf8')

    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      const parsed = JSON.parse(line)
      const item = Object.fromEntries(
        Object.entries(parsed.Item ?? {}).map(([key, value]) => [
          key,
          unmarshal(value),
        ]),
      )
      items.push(item)
    }
  }

  return items
}

function tableTypeFromSummary(summary) {
  const tableName = summary.tableArn?.split('/').pop() ?? ''
  if (tableName.includes('BeerRating')) return 'ratings'
  if (tableName.includes('BeerTasting')) return 'tastings'
  if (tableName.includes('Beer')) return 'beers'
  return null
}

async function discoverExports() {
  const prefixes = await listExportPrefixes()
  const selected = new Map()

  for (const exportPrefix of prefixes) {
    try {
      const summary = JSON.parse(
        await getText(`${exportPrefix}manifest-summary.json`),
      )
      const type = tableTypeFromSummary(summary)
      if (!type) continue

      const current = selected.get(type)
      const currentStart = current?.summary.startTime ?? ''
      if (!current || summary.startTime > currentStart) {
        selected.set(type, { exportPrefix, summary })
      }
    } catch (error) {
      console.warn(`Skipping ${exportPrefix}: ${error.message}`)
    }
  }

  for (const type of ['tastings', 'beers', 'ratings']) {
    if (!selected.has(type)) {
      throw new Error(`No ${type} export found under s3://${bucket}/${prefix}`)
    }
  }

  return selected
}

// ---------------------------------------------------------------------------
// Formatting and cleanup helpers
// ---------------------------------------------------------------------------

const q = (value) =>
  value === null || value === undefined
    ? 'null'
    : `'${String(value).replace(/'/g, "''")}'`

const num = (value) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? 'null'
    : String(Math.round(Number(value) * 10) / 10)

const ts = (value) =>
  value === null || value === undefined ? 'null' : `${q(value)}::timestamptz`

const dateLit = (value) =>
  value === null || value === undefined ? 'null' : `${q(value)}::date`

function safeTimestamp(value, fallback) {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function safeDate(value, fallback) {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toISOString().slice(0, 10)
}

function uuidOrNew(value) {
  return UUID_RE.test(String(value ?? '')) ? value : randomUUID()
}

function firstFinite(values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function firstText(values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return null
}

function cleanNotes(description) {
  if (description === null || description === undefined) return null
  const text = String(description).trim().replace(/\s+/g, ' ')
  if (!text) return null
  if (Number.isFinite(Number(text))) return null
  if (text.toLowerCase() === 'imported from excel') return null
  return text.slice(0, 4000)
}

function scoreValue(value, maximum, stats, field) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    stats.nonNumericScores++
    stats.nonNumericByField[field] = (stats.nonNumericByField[field] ?? 0) + 1
    return null
  }
  if (value < 0 || value > maximum) {
    stats.outOfRangeScores++
    return null
  }
  return Math.round(value * 10) / 10
}

// ---------------------------------------------------------------------------
// Load and classify
// ---------------------------------------------------------------------------

const selectedExports = await discoverExports()
const tableInfo = {}

const tastingsRaw = await loadTableItems(
  selectedExports.get('tastings').exportPrefix,
  selectedExports.get('tastings').summary,
)
const beersRaw = await loadTableItems(
  selectedExports.get('beers').exportPrefix,
  selectedExports.get('beers').summary,
)
const ratingsRaw = await loadTableItems(
  selectedExports.get('ratings').exportPrefix,
  selectedExports.get('ratings').summary,
)

for (const type of ['tastings', 'beers', 'ratings']) {
  const { summary, exportPrefix } = selectedExports.get(type)
  tableInfo[type] = {
    tableArn: summary.tableArn,
    tableName: summary.tableArn?.split('/').pop(),
    exportPrefix,
    itemCount: summary.itemCount,
    exportTime: summary.exportTime,
  }
}

const stats = {
  emptyHosts: 0,
  badTastingFks: 0,
  missingBeerRatings: 0,
  duplicateRatings: 0,
  nonNumericScores: 0,
  nonNumericByField: {},
  outOfRangeScores: 0,
  numericNotesDropped: 0,
  placeholderNotesDropped: 0,
  longNamesTruncated: 0,
  longStylesTruncated: 0,
  longTitlesTruncated: 0,
  longParticipantNamesTruncated: 0,
  longNotesTruncated: 0,
  unratedOrphanBeersSkipped: 0,
  beerMergeConflicts: 0,
  mergeConflictDetails: [],
  mappingUserConflicts: 0,
}

const now = new Date().toISOString()
const tastingByLegacyId = new Map()
const realTastings = []

for (const tasting of tastingsRaw) {
  const date = safeDate(tasting.createdAt, '2020-10-27')
  const rawHost = String(tasting.host ?? '').trim()
  if (!rawHost) stats.emptyHosts++

  let title = rawHost || `Imported tasting ${date}`
  if (title.length > 160) {
    title = title.slice(0, 160)
    stats.longTitlesTruncated++
  }

  const createdAt = safeTimestamp(tasting.createdAt, now)
  const updatedAt = safeTimestamp(tasting.updatedAt, createdAt)
  const mapped = {
    id: uuidOrNew(tasting.id),
    legacyId: tasting.id,
    title,
    description: `Imported from BeerTasting v1 · legacy host: ${rawHost || 'unknown'}`,
    date,
    createdAt,
    updatedAt,
    synthetic: false,
  }
  realTastings.push(mapped)
  tastingByLegacyId.set(tasting.id, mapped)
}

const beerById = new Map(beersRaw.map((beer) => [beer.id, beer]))
const ratingBeerIds = new Set(ratingsRaw.map((rating) => rating.beerRatingBeerId))

const linkedRatingsRaw = []
const orphanRatingsRaw = []
for (const rating of ratingsRaw) {
  const beer = beerById.get(rating.beerRatingBeerId)
  if (!beer) {
    stats.missingBeerRatings++
    continue
  }
  if (beer.beerBeerTastingId && tastingByLegacyId.has(beer.beerBeerTastingId)) {
    linkedRatingsRaw.push(rating)
  } else {
    orphanRatingsRaw.push(rating)
  }
}

const linkedBeers = beersRaw.filter(
  (beer) =>
    beer.beerBeerTastingId && tastingByLegacyId.has(beer.beerBeerTastingId),
)
const orphanBeers = beersRaw.filter(
  (beer) =>
    !beer.beerBeerTastingId || !tastingByLegacyId.has(beer.beerBeerTastingId),
)
const ratedOrphanBeers = orphanBeers.filter((beer) => ratingBeerIds.has(beer.id))
stats.unratedOrphanBeersSkipped = orphanBeers.length - ratedOrphanBeers.length
stats.badTastingFks = orphanBeers.filter((beer) => beer.beerBeerTastingId).length

// Only orphan beers that actually have a rating are useful in the new app.
// Unrated orphan beers are test/import leftovers and are not assigned to any
// tasting.
const includedBeers = skipOrphans
  ? linkedBeers
  : [...linkedBeers, ...ratedOrphanBeers]

// ---------------------------------------------------------------------------
// Synthetic tasting for the 2020 unassigned ratings
// ---------------------------------------------------------------------------

let syntheticTasting = null
if (!skipOrphans && orphanRatingsRaw.length > 0) {
  const dates = orphanRatingsRaw
    .map((rating) => safeTimestamp(rating.createdAt, now))
    .sort()
  const createdAt = dates[0] ?? now
  const updatedAt = dates[dates.length - 1] ?? createdAt
  const date = safeDate(updatedAt, '2020-10-27')
  const defaultTitle = `Imported 2020 ratings (${date})`
  let title = syntheticTitleOption ?? defaultTitle
  if (title.length > 160) {
    title = title.slice(0, 160)
    stats.longTitlesTruncated++
  }

  syntheticTasting = {
    id: randomUUID(),
    legacyId: null,
    title,
    description:
      'Imported from BeerTasting v1 · unassigned historical ratings (no original tasting link)',
    date,
    createdAt,
    updatedAt,
    synthetic: true,
  }
}

// ---------------------------------------------------------------------------
// Beer catalog, merged by trimmed name
// ---------------------------------------------------------------------------

const beerGroups = new Map()
for (const beer of includedBeers) {
  const rawName = String(beer.name ?? '').trim()
  if (!rawName) continue
  let name = rawName
  if (name.length > 120) {
    name = name.slice(0, 120)
    stats.longNamesTruncated++
  }
  const group = beerGroups.get(name) ?? []
  group.push(beer)
  beerGroups.set(name, group)
}

const canonicalByOldBeerId = new Map()
const catalogBeers = []

for (const [name, group] of beerGroups) {
  const ordered = [...group].sort((a, b) => {
    const aDate = safeTimestamp(a.createdAt, '')
    const bDate = safeTimestamp(b.createdAt, '')
    return aDate.localeCompare(bDate) || String(a.id).localeCompare(String(b.id))
  })
  const first = ordered[0]
  const id = uuidOrNew(first.id)

  const rawStyle = firstText(ordered.map((beer) => beer.description))
  let style = rawStyle
  if (style && style.length > 120) {
    style = style.slice(0, 120)
    stats.longStylesTruncated++
  }

  const alcohols = ordered
    .map((beer) => beer.alcohol)
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
  const alcohol = firstFinite(alcohols)
  const distinctAlcohols = [...new Set(alcohols.map((value) => Math.round(value * 100) / 100))]
  const styles = [...new Set(ordered.map((beer) => String(beer.description ?? '').trim()).filter(Boolean))]

  if (distinctAlcohols.length > 1 || styles.length > 1) {
    stats.beerMergeConflicts++
    stats.mergeConflictDetails.push({
      name,
      alcohols: distinctAlcohols,
      styles,
    })
  }

  const createdAt = ordered
    .map((beer) => safeTimestamp(beer.createdAt, now))
    .sort()[0] ?? now
  const updatedAt = ordered
    .map((beer) => safeTimestamp(beer.updatedAt, createdAt))
    .sort()
    .slice(-1)[0] ?? createdAt

  const canonical = {
    id,
    name,
    style,
    alcohol,
    createdAt,
    updatedAt,
  }
  catalogBeers.push(canonical)

  for (const beer of ordered) {
    canonicalByOldBeerId.set(beer.id, canonical)
  }
}

// ---------------------------------------------------------------------------
// Tasting assignments
// ---------------------------------------------------------------------------

const assignmentByKey = new Map()
for (const beer of includedBeers) {
  const canonical = canonicalByOldBeerId.get(beer.id)
  if (!canonical) continue

  let tasting = null
  if (beer.beerBeerTastingId && tastingByLegacyId.has(beer.beerBeerTastingId)) {
    tasting = tastingByLegacyId.get(beer.beerBeerTastingId)
  } else if (!skipOrphans && syntheticTasting) {
    tasting = syntheticTasting
  }
  if (!tasting) continue

  const key = `${tasting.id}|${canonical.id}`
  if (assignmentByKey.has(key)) continue

  assignmentByKey.set(key, {
    id: randomUUID(),
    tasting,
    beer: canonical,
    orderDate: safeTimestamp(beer.createdAt, canonical.createdAt),
  })
}

const assignmentsByTasting = new Map()
for (const assignment of assignmentByKey.values()) {
  const list = assignmentsByTasting.get(assignment.tasting.id) ?? []
  list.push(assignment)
  assignmentsByTasting.set(assignment.tasting.id, list)
}

const tastingBeers = []
for (const [tastingId, assignments] of assignmentsByTasting) {
  const sorted = [...assignments].sort((a, b) => {
    const byDate = a.orderDate.localeCompare(b.orderDate)
    return byDate || a.beer.name.localeCompare(b.beer.name)
  })
  sorted.forEach((assignment, index) => {
    tastingBeers.push({
      id: assignment.id,
      tastingId,
      beerId: assignment.beer.id,
      position: index + 1,
      createdAt: assignment.orderDate,
    })
  })
}

// ---------------------------------------------------------------------------
// Participants and scores
// ---------------------------------------------------------------------------

const allRatings = skipOrphans
  ? linkedRatingsRaw
  : [...linkedRatingsRaw, ...orphanRatingsRaw]

const participantByKey = new Map()
const participantByUserKey = new Map()
const participants = []
const scoreByKey = new Map()
const scores = []

function participantFor(tasting, rawUserName) {
  const mapping = userMap[rawUserName] ?? null
  let displayName = String(mapping?.displayName ?? rawUserName ?? '').trim()
  if (!displayName) displayName = 'Unknown participant'
  if (displayName.length > 80) {
    displayName = displayName.slice(0, 80)
    stats.longParticipantNamesTruncated++
  }
  const userId = mapping?.userId ?? null

  const key = `${tasting.id}|${displayName}`
  let participant = participantByKey.get(key)
  if (!participant) {
    participant = {
      id: randomUUID(),
      tastingId: tasting.id,
      displayName,
      userId,
    }
    participantByKey.set(key, participant)
    participants.push(participant)

    if (userId) {
      const userKey = `${tasting.id}|${userId}`
      const existing = participantByUserKey.get(userKey)
      if (existing && existing.displayName !== displayName) {
        stats.mappingUserConflicts++
        throw new Error(
          `User mapping conflict in tasting ${tasting.title}: ${existing.displayName} and ${displayName} both map to ${userId}`,
        )
      }
      participantByUserKey.set(userKey, participant)
    }
  } else if (participant.userId && userId && participant.userId !== userId) {
    stats.mappingUserConflicts++
    throw new Error(
      `User mapping conflict for ${displayName} in tasting ${tasting.title}`,
    )
  }

  return participant
}

for (const rating of allRatings) {
  const oldBeer = beerById.get(rating.beerRatingBeerId)
  if (!oldBeer) continue
  const canonical = canonicalByOldBeerId.get(oldBeer.id)
  if (!canonical) continue

  let tasting = null
  if (oldBeer.beerBeerTastingId && tastingByLegacyId.has(oldBeer.beerBeerTastingId)) {
    tasting = tastingByLegacyId.get(oldBeer.beerBeerTastingId)
  } else if (!skipOrphans && syntheticTasting) {
    tasting = syntheticTasting
  }
  if (!tasting) continue

  const participant = participantFor(tasting, rating.userName)
  const key = `${tasting.id}|${canonical.id}|${participant.displayName}`

  const smell = scoreValue(rating.smell, 10, stats, 'smell')
  const color = scoreValue(rating.color, 10, stats, 'color')
  const branding = scoreValue(rating.branding, 10, stats, 'branding')
  const taste = scoreValue(rating.taste, 20, stats, 'taste')

  const rawDescription = rating.description
  const notes = cleanNotes(rawDescription)
  if (notes === null && rawDescription !== null && rawDescription !== undefined) {
    const text = String(rawDescription).trim()
    if (text && Number.isFinite(Number(text))) stats.numericNotesDropped++
    else if (text && text.toLowerCase() === 'imported from excel') stats.placeholderNotesDropped++
  }

  const createdAt = safeTimestamp(rating.createdAt, tasting.createdAt)
  const updatedAt = safeTimestamp(rating.updatedAt, createdAt)

  const candidate = {
    id: uuidOrNew(rating.id),
    tastingId: tasting.id,
    beerId: canonical.id,
    participantId: participant.id,
    smell,
    color,
    branding,
    taste,
    notes,
    createdAt,
    updatedAt,
  }

  const existing = scoreByKey.get(key)
  if (existing) {
    stats.duplicateRatings++
    if (candidate.updatedAt >= existing.updatedAt) {
      scoreByKey.set(key, candidate)
    }
  } else {
    scoreByKey.set(key, candidate)
  }
}

for (const score of scoreByKey.values()) {
  scores.push(score)
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

const tenantLabel = tenantId ?? 'auto: tenant named/slugged ZBL'
const hostLabel = hostUserId ?? 'auto: first ZBL owner'

function insertMany(table, columns, rows, chunkSize = 400) {
  if (rows.length === 0) return ''
  const blocks = []
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    blocks.push(
      `insert into public.${table} (${columns.join(', ')}) values\n` +
        chunk
          .map((row) => `  (${row.join(', ')})`)
          .join(',\n') +
        ';',
    )
  }
  return blocks.join('\n\n') + '\n'
}

const tastingRows = [...realTastings]
if (syntheticTasting) tastingRows.push(syntheticTasting)

const sqlParts = []
sqlParts.push(`-- Generated by scripts/migrate-legacy-zbl.mjs at ${startedAt}
-- Source: s3://${bucket}/${prefix}
-- Tables:
--   ${tableInfo.tastings.tableName} (${tableInfo.tastings.itemCount})
--   ${tableInfo.beers.tableName} (${tableInfo.beers.itemCount})
--   ${tableInfo.ratings.tableName} (${tableInfo.ratings.itemCount})
--
-- Tenant: ${tenantLabel}
-- Host profile: ${hostLabel}
-- Imported tastings: ${tastingRows.length} (${syntheticTasting ? 'including synthetic 2020 tasting' : 'real tastings only'})
-- Catalog beers: ${catalogBeers.length}
-- Tasting-beer assignments: ${tastingBeers.length}
-- Participants: ${participants.length}
-- Scores: ${scores.length}
--
-- This import assumes the ZBL tenant has no tastings and no beers yet.
-- The guard below aborts if that is not true. Run the whole file as one
-- transaction; it is not intended to be re-run.
begin;

set local statement_timeout = '10min';

do $$
declare
  v_tenant uuid;
  v_host uuid;
  v_count integer;
begin
  v_tenant := ${tenantId ? `${q(tenantId)}::uuid` : 'null'};

  if v_tenant is null then
    select count(*) into v_count
    from public.tenants
    where lower(trim(name)) = 'zbl' or lower(trim(slug)) = 'zbl';

    if v_count <> 1 then
      raise exception 'Expected exactly one tenant named or slugged ZBL, found %. Pass --tenant-id if needed.', v_count;
    end if;

    select id into v_tenant
    from public.tenants
    where lower(trim(name)) = 'zbl' or lower(trim(slug)) = 'zbl';
  end if;

  if not exists (select 1 from public.tenants where id = v_tenant) then
    raise exception 'Tenant not found: %', v_tenant;
  end if;

  v_host := ${hostUserId ? `${q(hostUserId)}::uuid` : 'null'};

  if v_host is null then
    select user_id into v_host
    from public.tenant_members
    where tenant_id = v_tenant and role = 'owner'
    order by created_at
    limit 1;
  end if;

  if v_host is null or not exists (select 1 from public.profiles where id = v_host) then
    raise exception 'No owner profile found for tenant %. Pass --host-user-id if needed.', v_tenant;
  end if;

  if exists (select 1 from public.tastings where tenant_id = v_tenant)
     or exists (select 1 from public.beers where tenant_id = v_tenant) then
    raise exception 'Tenant % already has tastings or beers; legacy import aborted.', v_tenant;
  end if;

`)

sqlParts.push(
  insertMany(
    'tastings',
    [
      'id',
      'tenant_id',
      'host_user_id',
      'title',
      'description',
      'tasting_date',
      'status',
      'created_at',
      'updated_at',
    ],
    tastingRows.map((tasting) => [
      q(tasting.id),
      'v_tenant',
      'v_host',
      q(tasting.title),
      q(tasting.description),
      dateLit(tasting.date),
      q('completed'),
      ts(tasting.createdAt),
      ts(tasting.updatedAt),
    ]),
  ),
)

sqlParts.push(
  insertMany(
    'beers',
    [
      'id',
      'tenant_id',
      'name',
      'brewery',
      'style',
      'alcohol',
      'description',
      'created_at',
      'updated_at',
    ],
    catalogBeers.map((beer) => [
      q(beer.id),
      'v_tenant',
      q(beer.name),
      'null',
      q(beer.style),
      num(beer.alcohol),
      q(beer.style),
      ts(beer.createdAt),
      ts(beer.updatedAt),
    ]),
  ),
)

sqlParts.push(
  insertMany(
    'tasting_beers',
    ['id', 'tasting_id', 'beer_id', 'position', 'created_at'],
    tastingBeers.map((assignment) => [
      q(assignment.id),
      q(assignment.tastingId),
      q(assignment.beerId),
      String(assignment.position),
      ts(assignment.createdAt),
    ]),
  ),
)

sqlParts.push(
  insertMany(
    'tasting_participants',
    ['id', 'tasting_id', 'user_id', 'display_name', 'is_host'],
    participants.map((participant) => [
      q(participant.id),
      q(participant.tastingId),
      participant.userId ? q(participant.userId) : 'null',
      q(participant.displayName),
      'false',
    ]),
  ),
)

sqlParts.push(
  insertMany(
    'scores',
    [
      'id',
      'tasting_id',
      'beer_id',
      'participant_id',
      'smell',
      'color',
      'branding',
      'taste',
      'notes',
      'created_at',
      'updated_at',
    ],
    scores.map((score) => [
      q(score.id),
      q(score.tastingId),
      q(score.beerId),
      q(score.participantId),
      num(score.smell),
      num(score.color),
      num(score.branding),
      num(score.taste),
      q(score.notes),
      ts(score.createdAt),
      ts(score.updatedAt),
    ]),
  ),
)

sqlParts.push(`end $$;\n\ncommit;\n`)

const sql = sqlParts.filter(Boolean).join('\n')

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const userNameStats = new Map()
for (const rating of allRatings) {
  const oldBeer = beerById.get(rating.beerRatingBeerId)
  if (!oldBeer) continue
  const entry = userNameStats.get(rating.userName) ?? {
    total: 0,
    linked: 0,
    orphan: 0,
  }
  entry.total++
  if (oldBeer.beerBeerTastingId && tastingByLegacyId.has(oldBeer.beerBeerTastingId)) {
    entry.linked++
  } else {
    entry.orphan++
  }
  userNameStats.set(rating.userName, entry)
}

const userLines = [...userNameStats.entries()]
  .sort((a, b) => b[1].total - a[1].total)
  .map(
    ([name, counts]) =>
      `| ${name} | ${counts.total} | ${counts.linked} | ${counts.orphan} |`,
  )

const report = `# ZBL legacy import report

Generated: ${startedAt}

## Source

| Table | Export | Items |
| --- | --- | ---: |
| ${tableInfo.tastings.tableName} | ${tableInfo.tastings.exportPrefix} | ${tableInfo.tastings.itemCount} |
| ${tableInfo.beers.tableName} | ${tableInfo.beers.exportPrefix} | ${tableInfo.beers.itemCount} |
| ${tableInfo.ratings.tableName} | ${tableInfo.ratings.exportPrefix} | ${tableInfo.ratings.itemCount} |

## Import plan

| Output | Count |
| --- | ---: |
| Real tastings | ${realTastings.length} |
| Synthetic unassigned tasting | ${syntheticTasting ? 1 : 0} |
| Catalog beers | ${catalogBeers.length} |
| Tasting-beer assignments | ${tastingBeers.length} |
| Participants | ${participants.length} |
| Scores | ${scores.length} |

${syntheticTasting ? `The synthetic tasting **${syntheticTasting.title}** holds the ${orphanRatingsRaw.length} ratings whose old beers had no \`beerBeerTastingId\`. They are all dated 2020-10-27 in the export.` : 'Unassigned/orphan ratings were skipped (`--skip-orphans`).'}

## Data findings

- Old tastings: **${tastingsRaw.length}**.
- Old beers: **${beersRaw.length}**.
- Old ratings: **${ratingsRaw.length}**.
- Beers with a valid tasting link: **${linkedBeers.length}**.
- Orphan beers: **${orphanBeers.length}**; of those, **${ratedOrphanBeers.length}** have ratings and are included.
- Linked ratings: **${linkedRatingsRaw.length}**.
- Unassigned (2020) ratings: **${orphanRatingsRaw.length}**.
- Ratings missing their beer row: **${stats.missingBeerRatings}** (skipped).
- Duplicate beer+user ratings: **${stats.duplicateRatings}** (latest kept).
- Tastings with an empty host/title: **${stats.emptyHosts}** (fallback title used).
- Beers with an invalid tasting FK: **${stats.badTastingFks}** (treated as unassigned).
- Unrated orphan beers skipped: **${stats.unratedOrphanBeersSkipped}**.
- Beer merge conflicts (same name, different alcohol/style): **${stats.beerMergeConflicts}**.
- Non-numeric score fields: **${stats.nonNumericScores}** (stored as null).
- Out-of-range score fields: **${stats.outOfRangeScores}** (stored as null).
- Numeric notes dropped (old taste-value bug): **${stats.numericNotesDropped}**.
- "Imported from excel" placeholder notes dropped: **${stats.placeholderNotesDropped}**.
- Truncated names/styles/titles/participants/notes: ${stats.longNamesTruncated}/${stats.longStylesTruncated}/${stats.longTitlesTruncated}/${stats.longParticipantNamesTruncated}/${stats.longNotesTruncated}.

${stats.mergeConflictDetails.length ? `### Beer merge conflicts

These beer names had differing alcohol/style values across old rows. The earliest row's metadata is used.

${stats.mergeConflictDetails.map((item) => `- **${item.name}**: alcohol ${item.alcohols.join(', ') || '—'}; style ${item.styles.join(' / ') || '—'}`).join('\n')}
` : ''}

## Old usernames found in the database

These are the exact \`BeerRating.userName\` values. No Cognito emails or extra
accounts are created. Names not present in the old ratings are ignored.

| Old userName | Total ratings | Linked | 2020 orphan |
| --- | ---: | ---: | ---: |
${userLines.join('\n')}

${Object.keys(userMap).length ? `\nUser mapping applied: ${JSON.stringify(userMap, null, 2)}\n` : ''}

## Tenant and host resolution

- Tenant: ${tenantLabel}
- Host profile: ${hostLabel}

The SQL resolves the tenant by name/slug \`ZBL\` (or uses the explicit
\`--tenant-id\`) and uses the first owner membership as \`tastings.host_user_id\`.
It aborts if ZBL is missing, has no owner, or already contains tastings/beers.

## Output

- SQL: \`${outPath}\`
- Report: \`${reportPath}\`

The SQL creates everything inside one transaction and aborts if the ZBL tenant
already has any tastings or beers.
`

mkdirSync(dirname(outPath), { recursive: true })
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(outPath, sql)
writeFileSync(reportPath, report)

console.log(report)
console.log(`\nWrote SQL: ${outPath}`)
console.log(`Wrote report: ${reportPath}`)
