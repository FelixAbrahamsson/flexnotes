import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ToastOptions {
  message: string
  /** Optional undo callback. If provided, an "Undo" button is shown. */
  onUndo?: () => void
  /** Duration in milliseconds before auto-dismiss. Default: 5000 */
  duration?: number
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context.showToast
}

interface ActiveToast extends ToastOptions {
  id: number
  exiting: boolean
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const nextId = useRef(0)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach(t => clearTimeout(t))
    }
  }, [])

  const dismissToast = useCallback((id: number) => {
    // Start exit animation
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    // Remove after animation
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 200)
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    const duration = options.duration ?? 5000

    setToasts(prev => [...prev, { ...options, id, exiting: false }])

    const timer = setTimeout(() => {
      dismissToast(id)
      timers.current.delete(id)
    }, duration)
    timers.current.set(id, timer)
  }, [dismissToast])

  const handleUndo = useCallback((toast: ActiveToast) => {
    toast.onUndo?.()
    dismissToast(toast.id)
  }, [dismissToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container - fixed at bottom center */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 bg-gray-800 dark:bg-gray-700 text-white rounded-lg shadow-lg max-w-sm transition-all duration-200 ${
                toast.exiting
                  ? 'opacity-0 translate-y-2'
                  : 'opacity-100 translate-y-0 animate-in fade-in slide-in-from-bottom-4'
              }`}
            >
              <p className="text-sm flex-1">{toast.message}</p>
              {toast.onUndo && (
                <button
                  onClick={() => handleUndo(toast)}
                  className="text-sm font-semibold text-primary-400 hover:text-primary-300 flex-shrink-0"
                >
                  Undo
                </button>
              )}
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-gray-400 hover:text-gray-200 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
