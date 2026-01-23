import { X, Sun, Moon, Monitor, Grid2X2, Grid3X3, LayoutList } from 'lucide-react'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { TagManager } from '@/components/tags/TagManager'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { theme, notesPerRow, setTheme, setNotesPerRow } = usePreferencesStore()

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  theme === 'light'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <Sun className={`w-5 h-5 ${theme === 'light' ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`} />
                <span className={`text-sm ${theme === 'light' ? 'text-primary-600 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                  Light
                </span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  theme === 'dark'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <Moon className={`w-5 h-5 ${theme === 'dark' ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`} />
                <span className={`text-sm ${theme === 'dark' ? 'text-primary-600 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                  Dark
                </span>
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  theme === 'system'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <Monitor className={`w-5 h-5 ${theme === 'system' ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`} />
                <span className={`text-sm ${theme === 'system' ? 'text-primary-600 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                  System
                </span>
              </button>
            </div>
          </div>

          {/* Notes per row */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Notes per row
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setNotesPerRow(1)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  notesPerRow === 1
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <LayoutList className={`w-5 h-5 ${notesPerRow === 1 ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`} />
                <span className={`text-sm ${notesPerRow === 1 ? 'text-primary-600 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                  1
                </span>
              </button>
              <button
                onClick={() => setNotesPerRow(2)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  notesPerRow === 2
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <Grid2X2 className={`w-5 h-5 ${notesPerRow === 2 ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`} />
                <span className={`text-sm ${notesPerRow === 2 ? 'text-primary-600 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                  2
                </span>
              </button>
              <button
                onClick={() => setNotesPerRow(3)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  notesPerRow === 3
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <Grid3X3 className={`w-5 h-5 ${notesPerRow === 3 ? 'text-primary-600' : 'text-gray-500 dark:text-gray-400'}`} />
                <span className={`text-sm ${notesPerRow === 3 ? 'text-primary-600 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                  3
                </span>
              </button>
            </div>
          </div>

          {/* Tag management */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Manage Tags
            </label>
            <TagManager />
          </div>
        </div>
      </div>
    </div>
  )
}
