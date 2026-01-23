import { useEffect } from 'react'
import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react'
import { useSyncStore } from '@/stores/syncStore'

export function SyncStatus() {
  const { isOnline, isSyncing, pendingCount, conflicts, error } = useSyncStore()

  // Show different states
  if (!isOnline) {
    return (
      <div className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-500" title="Offline - changes will sync when online">
        <CloudOff className="w-4 h-4" />
        <span className="text-xs hidden sm:inline">Offline</span>
        {pendingCount > 0 && (
          <span className="text-xs bg-yellow-100 dark:bg-yellow-900/50 px-1.5 py-0.5 rounded-full">
            {pendingCount}
          </span>
        )}
      </div>
    )
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400" title="Syncing...">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-xs hidden sm:inline">Syncing</span>
      </div>
    )
  }

  if (conflicts.length > 0) {
    return (
      <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-500" title="Conflicts need resolution">
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs hidden sm:inline">{conflicts.length} conflict(s)</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-red-600 dark:text-red-500" title={error}>
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs hidden sm:inline">Sync error</span>
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400" title={`${pendingCount} changes pending`}>
        <Cloud className="w-4 h-4" />
        <span className="text-xs hidden sm:inline">{pendingCount} pending</span>
      </div>
    )
  }

  // All synced
  return (
    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-500" title="All changes synced">
      <Cloud className="w-4 h-4" />
      <span className="text-xs hidden sm:inline">Synced</span>
    </div>
  )
}

// Hook to initialize sync on app load
export function useSyncInit() {
  const { fullSync, subscribeToChanges, refreshPendingCount } = useSyncStore()

  useEffect(() => {
    // Initial sync
    fullSync()
    refreshPendingCount()

    // Subscribe to realtime changes
    const unsubscribe = subscribeToChanges()

    return () => {
      unsubscribe()
    }
  }, [fullSync, subscribeToChanges, refreshPendingCount])
}
