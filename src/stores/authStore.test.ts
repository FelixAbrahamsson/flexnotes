import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}))

vi.mock('@/services/supabase', () => ({
  authStorageKey: 'sb-test-auth-token',
  supabase: {
    auth: { getSession: h.getSession, onAuthStateChange: h.onAuthStateChange },
  },
}))

import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { useAuthStore } from './authStore'

const cachedSession = {
  access_token: 'expired-token',
  refresh_token: 'r',
  expires_at: 0,
  user: { id: 'user-1', email: 'a@b.c' },
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ user: null, session: null, initialized: false })
  h.getSession.mockReset()
  h.onAuthStateChange.mockReset()
})

describe('authStore.initialize', () => {
  it('stays signed in from the cached session when the refresh fails offline', async () => {
    localStorage.setItem('sb-test-auth-token', JSON.stringify(cachedSession))
    h.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().initialized).toBe(true)
    expect(useAuthStore.getState().user?.id).toBe('user-1')
  })

  it('ignores a null INITIAL_SESSION event but honours SIGNED_OUT', async () => {
    localStorage.setItem('sb-test-auth-token', JSON.stringify(cachedSession))
    h.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })

    await useAuthStore.getState().initialize()
    const listener = h.onAuthStateChange.mock.calls[0][0]

    listener('INITIAL_SESSION', null)
    expect(useAuthStore.getState().user?.id).toBe('user-1')

    listener('SIGNED_OUT', null)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('signs out when there is no session and the failure is not a network error', async () => {
    localStorage.setItem('sb-test-auth-token', JSON.stringify(cachedSession))
    h.getSession.mockResolvedValue({ data: { session: null }, error: null })

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().initialized).toBe(true)
  })

  it('has no user when nothing is cached', async () => {
    h.getSession.mockResolvedValue({ data: { session: null }, error: null })

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().user).toBeNull()
  })
})
