import { create } from 'zustand'
import { isAuthRetryableFetchError, type User, type Session } from '@supabase/supabase-js'
import { supabase, authStorageKey } from '@/services/supabase'
import { clearLocalData } from '@/services/db'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  initialized: boolean

  initialize: () => Promise<void>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return

    // Start from the cached session right away. When the access token has
    // expired, getSession() first tries to refresh it; offline that retries
    // for a while and then reports "no session", which used to bounce the
    // installed PWA to the login screen instead of opening local notes.
    const cached = readCachedSession()
    if (cached) {
      set({ session: cached, user: cached.user, initialized: true })
    }

    supabase.auth.onAuthStateChange((event, session) => {
      // A null session outside an explicit sign-out means the refresh failed
      // (typically offline) - keep the cached user rather than logging out.
      if (!session && event !== 'SIGNED_OUT') return
      set({ session, user: session?.user ?? null, initialized: true })
    })

    const { data: { session }, error } = await supabase.auth.getSession()
    if (session) {
      set({ session, user: session.user, initialized: true })
    } else if (cached && error && isAuthRetryableFetchError(error)) {
      // Network failure while refreshing - stay signed in with the cached user;
      // supabase-js retries the refresh once we're back online.
    } else {
      set({ session: null, user: null, initialized: true })
    }
  },

  signUp: async (email: string, password: string) => {
    set({ loading: true })
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    } finally {
      set({ loading: false })
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true })
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    } finally {
      set({ loading: false })
    }
  },

  signInWithGoogle: async () => {
    set({ loading: true })
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (error) throw error
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    } finally {
      set({ loading: false })
    }
  },

  signOut: async () => {
    // Clear local data first
    await clearLocalData()

    // Then sign out from Supabase
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))

/** Read the persisted supabase session without touching the network. */
function readCachedSession(): Session | null {
  try {
    const raw = localStorage.getItem(authStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const session = (parsed?.currentSession ?? parsed) as Session | null
    return session?.access_token && session.user ? session : null
  } catch {
    return null
  }
}
