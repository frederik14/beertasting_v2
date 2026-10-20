// Hand-maintained subset of the Supabase generated types.
//
// Keep this in sync with supabase/schema.sql. If you have the Supabase CLI
// available, prefer:
//
//   supabase gen types typescript --local > src/lib/database.types.ts
//
// The application only uses the tables and RPCs declared here.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type TenantRow = {
  id: string
  name: string
  slug: string
  created_at: string
  updated_at: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

type TenantMemberRow = {
  id: string
  tenant_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
  updated_at: string
}

type TenantInviteRow = {
  id: string
  tenant_id: string
  token: string
  role: 'admin' | 'member'
  created_by: string
  created_at: string
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
}

type TastingRow = {
  id: string
  tenant_id: string
  host_user_id: string
  title: string
  description: string | null
  tasting_date: string
  status: 'draft' | 'active' | 'completed'
  created_at: string
  updated_at: string
}

type ParticipantRow = {
  id: string
  tasting_id: string
  user_id: string | null
  display_name: string
  is_host: boolean
  created_at: string
  updated_at: string
}

type BeerRow = {
  id: string
  tenant_id: string
  name: string
  brewery: string | null
  style: string | null
  alcohol: number | null
  description: string | null
  created_at: string
  updated_at: string
}

type TastingBeerRow = {
  id: string
  tasting_id: string
  beer_id: string
  position: number
  created_at: string
}

type ScoreRow = {
  id: string
  tasting_id: string
  beer_id: string
  participant_id: string
  smell: number | null
  color: number | null
  branding: number | null
  taste: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      tenants: Table<TenantRow>
      profiles: Table<ProfileRow>
      tenant_members: Table<TenantMemberRow>
      tenant_invites: Table<TenantInviteRow>
      tastings: Table<TastingRow>
      tasting_participants: Table<ParticipantRow>
      beers: Table<BeerRow>
      tasting_beers: Table<TastingBeerRow>
      scores: Table<ScoreRow>
    }
    Views: Record<string, never>
    Functions: {
      create_tenant: {
        Args: { p_name: string; p_slug?: string | null }
        Returns: TenantRow
      }
      create_tasting: {
        Args: { p_tenant_id: string; p_title: string; p_date?: string | null }
        Returns: TastingRow
      }
      add_beer_to_tasting: {
        Args: {
          p_tasting_id: string
          p_name: string
          p_brewery?: string | null
          p_style?: string | null
          p_alcohol?: number | null
        }
        Returns: TastingBeerRow
      }
      create_tenant_invite: {
        Args: { p_tenant_id: string; p_role?: 'admin' | 'member' }
        Returns: TenantInviteRow
      }
      accept_tenant_invite: {
        Args: { p_token: string }
        Returns: string
      }
      save_scores: {
        Args: { p_tasting_id: string; p_rows: Json }
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
