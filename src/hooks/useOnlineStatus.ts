import { useState, useEffect } from 'react'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (wasOffline) {
        // Trigger sync when coming back online
        window.dispatchEvent(new CustomEvent('app:online'))
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      setWasOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [wasOffline])

  return { isOnline, wasOffline }
}

// Hook to listen for sync events
export function useSyncEvents(onSync: () => void) {
  useEffect(() => {
    const handleOnline = () => onSync()

    window.addEventListener('app:online', handleOnline)
    return () => window.removeEventListener('app:online', handleOnline)
  }, [onSync])
}

// Utility to check if we should attempt network requests
export function shouldAttemptNetwork(): boolean {
  return navigator.onLine
}
