import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not found. Please create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  )
}

const resolvedUrl = supabaseUrl || 'https://placeholder.supabase.co'

/**
 * localStorage key holding the auth session. This is supabase-js's default
 * (`sb-<project-ref>-auth-token`), spelled out so we can read the cached
 * session directly when starting offline.
 */
export const authStorageKey = `sb-${new URL(resolvedUrl).hostname.split('.')[0]}-auth-token`

export const supabase = createClient(resolvedUrl, supabaseAnonKey || 'placeholder-key', {
  auth: { storageKey: authStorageKey },
})
