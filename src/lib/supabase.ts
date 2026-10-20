import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type AppSupabaseClient = SupabaseClient<Database>

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

let client: AppSupabaseClient | null = null
let configurationError: string | null = null

if (!supabaseUrl || !supabaseAnonKey) {
  configurationError =
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a .env file, then restart the dev server.'
} else {
  try {
    // Validate the URL before createClient so a typo produces a readable
    // configuration message instead of a module-load crash.
    new URL(supabaseUrl)
    client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  } catch (error) {
    configurationError =
      error instanceof Error
        ? `Supabase configuration is invalid: ${error.message}`
        : 'Supabase configuration is invalid.'
  }
}

export const supabase = client
export const hasSupabaseConfig = client !== null
export const supabaseConfigError = configurationError
