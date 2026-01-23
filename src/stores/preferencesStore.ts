import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'
type NotesPerRow = 1 | 2 | 3

interface PreferencesState {
  theme: Theme
  notesPerRow: NotesPerRow

  setTheme: (theme: Theme) => void
  setNotesPerRow: (count: NotesPerRow) => void
  getEffectiveTheme: () => 'light' | 'dark'
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      notesPerRow: 2,

      setTheme: (theme: Theme) => {
        set({ theme })
        applyTheme(theme)
      },

      setNotesPerRow: (notesPerRow: NotesPerRow) => {
        set({ notesPerRow })
      },

      getEffectiveTheme: () => {
        const { theme } = get()
        if (theme === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
        return theme
      },
    }),
    {
      name: 'felix-notes-preferences',
      onRehydrateStorage: () => (state) => {
        // Apply theme when store is rehydrated
        if (state) {
          applyTheme(state.theme)
        }
      },
    }
  )
)

// Apply theme to document
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return

  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  // Always remove first, then add if needed - ensures clean state
  document.documentElement.classList.remove('dark')
  if (isDark) {
    document.documentElement.classList.add('dark')
  }

  // Update meta theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#1f2937' : '#ffffff')
  }
}

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = usePreferencesStore.getState()
    if (theme === 'system') {
      applyTheme('system')
    }
  })

  // Apply theme immediately on load from localStorage (before React hydration)
  try {
    const stored = localStorage.getItem('felix-notes-preferences')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.state?.theme) {
        applyTheme(parsed.state.theme)
      }
    }
  } catch {
    // Ignore errors, theme will be applied when store hydrates
  }
}
