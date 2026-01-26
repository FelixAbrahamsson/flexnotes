import { useState } from 'react'
import { X, Sun, Moon, Monitor, Grid2X2, Grid3X3, LayoutList, LogOut, Key } from 'lucide-react'
import { usePreferencesStore } from '@/stores/preferencesStore'
import { useAuthStore } from '@/stores/authStore'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { GoogleKeepImport } from '@/components/import/GoogleKeepImport'
import { supabase } from '@/services/supabase'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { theme, notesPerRow, setTheme, setNotesPerRow } = usePreferencesStore()
  const { user, signOut } = useAuthStore()
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const handleChangePassword = async () => {
    setPasswordError('')
    setPasswordSuccess(false)

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setPasswordSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        setShowPasswordChange(false)
        setPasswordSuccess(false)
      }, 2000)
    } catch (error) {
      setPasswordError((error as Error).message)
    } finally {
      setChangingPassword(false)
    }
  }

  const handleSignOut = () => {
    signOut()
    onClose()
  }

  useEscapeKey(onClose)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
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

          {/* Import from Google Keep */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Import from Google Keep
            </label>
            <GoogleKeepImport />
          </div>

          {/* Account section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Account
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Signed in as {user?.email}
            </p>

            {/* Change password */}
            {!showPasswordChange ? (
              <button
                onClick={() => setShowPasswordChange(true)}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Key className="w-4 h-4" />
                Change password
              </button>
            ) : (
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                {passwordError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-sm text-green-600 dark:text-green-400">Password changed successfully!</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {changingPassword ? 'Changing...' : 'Change password'}
                  </button>
                  <button
                    onClick={() => {
                      setShowPasswordChange(false)
                      setNewPassword('')
                      setConfirmPassword('')
                      setPasswordError('')
                    }}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Logout button */}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 w-full px-4 py-2 mt-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
