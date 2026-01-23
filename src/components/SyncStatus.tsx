import { useEffect } from 'react'
import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react'
import { useSyncStore } from '@/stores/syncStore'

export function SyncStatus() {
  const { isOnline, isSyncing, pendingCount, conflicts, error } = useSyncStore()

  // Show different states
  if (!isOnline) {
    return (
      <div className="flex items-center gap-1.5 text-yellow-600" title="Offline - changes will sync when online">
        <CloudOff className="w-4 h-4" />
        <span className="text-xs">Offline</span>
        {pendingCount > 0 && (
          <span className="text-xs bg-yellow-100 px-1.5 py-0.5 rounded-full">
            {pendingCount}
          </span>
        )}
      </div>
    )
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 text-primary-600" title="Syncing...">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-xs">Syncing</span>
      </div>
    )
  }

  if (conflicts.length > 0) {
    return (
      <div className="flex items-center gap-1.5 text-orange-600" title="Conflicts need resolution">
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs">{conflicts.length} conflict(s)</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-red-600" title={error}>
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs">Sync error</span>
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-1.5 text-gray-500" title={`${pendingCount} changes pending`}>
        <Cloud className="w-4 h-4" />
        <span className="text-xs">{pendingCount} pending</span>
      </div>
    )
  }

  // All synced
  return (
    <div className="flex items-center gap-1.5 text-green-600" title="All changes synced">
      <Cloud className="w-4 h-4" />
      <span className="text-xs">Synced</span>
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
