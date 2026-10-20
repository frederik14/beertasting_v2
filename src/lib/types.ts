export type TenantRole = 'owner' | 'admin' | 'member'

export type Tenant = {
  id: string
  name: string
  slug: string
}

export type TenantMembership = {
  tenant: Tenant
  role: TenantRole
  createdAt: string
}

export type Participant = {
  id: string
  displayName: string
  userId: string | null
  isHost: boolean
}

export type Beer = {
  id: string
  name: string
  brewery: string | null
  style: string | null
  alcohol: number | null
}

export type ScoreRow = {
  participantId: string
  beerId: string
  smell: number | null
  color: number | null
  branding: number | null
  taste: number | null
  notes: string | null
  updatedAt: string | null
}

export type TastingStatus = 'draft' | 'active' | 'completed'

export type TastingSummary = {
  id: string
  tenantId: string
  hostUserId: string
  title: string
  status: TastingStatus
  date: string
  createdAt: string
}

export type TastingSnapshot = {
  tenant: Tenant
  tasting: TastingSummary
  participants: Participant[]
  beers: Beer[]
  rows: ScoreRow[]
}

export type RankedBeer = {
  beerId: string
  name: string
  brewery: string | null
  style: string | null
  rank: number | null
  /** Sum of complete row scores; each row is scored out of 100. */
  totalScore: number
  /** Average of complete row scores, 0–100; null when the beer is unrated. */
  averageScore: number | null
  votes: number
  incompleteVotes: number
}

export type TenantInvite = {
  id: string
  token: string
  role: TenantRole
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
}

export type ScoreDraft = {
  smell: string
  color: string
  branding: string
  taste: string
  notes: string
  updatedAt: string | null
}

export type SaveScoreInput = {
  participantId: string
  beerId: string
  smell: number | null
  color: number | null
  branding: number | null
  taste: number | null
  notes: string | null
  expectedUpdatedAt: string | null
  force: boolean
}

export type SaveScoreResult = {
  participantId: string
  beerId: string
  status: 'saved' | 'conflict'
  updatedAt?: string
}

export type ScoreCriterion = 'smell' | 'color' | 'branding' | 'taste'

export type TenantRankingTasting = {
  id: string
  title: string
  date: string
  status: TastingStatus
}

export type TenantRankingParticipant = {
  id: string
  tastingId: string
  displayName: string
  userId: string | null
}

export type TenantRankingScore = {
  tastingId: string
  participantId: string
  beerId: string
  smell: number | null
  color: number | null
  branding: number | null
  taste: number | null
}

export type TenantRankingData = {
  tastings: TenantRankingTasting[]
  participants: TenantRankingParticipant[]
  beers: Beer[]
  scores: TenantRankingScore[]
}

export type OverallRankingFilters = {
  from?: string | null
  to?: string | null
  participantNames?: string[]
  style?: string | null
  search?: string
}

export type OverallRankedBeer = {
  beerId: string
  name: string
  brewery: string | null
  style: string | null
  alcohol: number | null
  rank: number
  averageScore: number
  votes: number
  incompleteVotes: number
  averageSmell: number
  averageColor: number
  averageBranding: number
  averageTaste: number
  tastingCount: number
}
