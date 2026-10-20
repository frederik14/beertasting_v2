export type Tenant = {
  id: string
  name: string
  slug: string
}

export type Participant = {
  id: string
  displayName: string
  userId?: string | null
}

export type Beer = {
  id: string
  name: string
  brewery?: string | null
  style?: string | null
  alcohol?: number | null
}

export type ScoreRow = {
  participantId: string
  beerId: string
  smell: number | null
  color: number | null
  branding: number | null
  taste: number | null
  notes?: string | null
}

export type TastingSnapshot = {
  tenant: Tenant
  tasting: {
    id: string
    title: string
    status: 'draft' | 'active' | 'completed'
    date: string
  }
  participants: Participant[]
  beers: Beer[]
  rows: ScoreRow[]
}

export type RankedBeer = {
  beerId: string
  name: string
  totalScore: number
  averageScore: number
  votes: number
}
