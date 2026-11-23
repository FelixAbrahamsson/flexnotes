import { Cloud, CloudOff, RefreshCw, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useSyncStore } from "@/stores/syncStore";
import { ConflictResolver } from "./ConflictResolver";

export function SyncStatus() {
  const { isOnline, isSyncing, pendingCount, conflicts, error } =
    useSyncStore();
  const [showConflicts, setShowConflicts] = useState(false);

  // Rendered alongside whatever status is showing, so it doesn't vanish
  // while a sync runs in the background.
  const resolver = showConflicts && conflicts.length > 0 && (
    <ConflictResolver onClose={() => setShowConflicts(false)} />
  );

  // Show different states
  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-500"
        title="Offline - changes will sync when online"
      >
        <CloudOff className="w-4 h-4" />
        <span className="text-xs">Offline</span>
        {pendingCount > 0 && (
          <span className="text-xs bg-yellow-100 dark:bg-yellow-900/50 px-1.5 py-0.5 rounded-full">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div
        className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400"
        title="Syncing..."
      >
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-xs">Syncing</span>
        {resolver}
      </div>
    );
  }

  if (conflicts.length > 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowConflicts(true)}
          className="flex items-center gap-1.5 text-orange-600 dark:text-orange-500 hover:underline"
          title="Click to review and resolve conflicts"
        >
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs">
            {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}
          </span>
        </button>
        {resolver}
      </>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-1.5 text-red-600 dark:text-red-500"
        title={error}
      >
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs">Sync error</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div
        className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"
        title={`${pendingCount} changes pending`}
      >
        <Cloud className="w-4 h-4" />
        <span className="text-xs">{pendingCount} pending</span>
      </div>
    );
  }

  // All synced
  return (
    <div
      className="flex items-center gap-1.5 text-green-600 dark:text-green-500"
      title="All changes synced"
    >
      <Cloud className="w-4 h-4" />
      <span className="text-xs">Synced</span>
    </div>
  );
}
