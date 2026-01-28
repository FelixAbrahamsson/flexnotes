import { Users, Trash as TrashIcon } from "lucide-react";
import type { SharedWithMeNote } from "@/stores/noteStore";

interface SharedWithMeViewProps {
  notes: SharedWithMeNote[];
  loading: boolean;
  gridClasses: string;
  onRemove: (savedShareId: string) => void;
}

/**
 * Displays notes that have been shared with the current user.
 */
export function SharedWithMeView({
  notes,
  loading,
  gridClasses,
  onRemove,
}: SharedWithMeViewProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 mb-2">
          No notes shared with you yet
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          When someone shares a note with you, it will appear here
        </p>
      </div>
    );
  }

  return (
    <div className={`grid ${gridClasses} gap-3 items-start`}>
      {notes.map(({ note, permission, savedShareId, shareToken }) => (
        <a
          key={savedShareId}
          href={`/shared/${shareToken}`}
          className="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer block"
        >
          {/* Permission badge */}
          <div className="absolute top-2 right-2 flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                permission === "write"
                  ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                  : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
              }`}
            >
              {permission === "write" ? "Can edit" : "View only"}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(savedShareId);
              }}
              className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              title="Remove from list"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Title */}
          {note.title && (
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2 pr-24 line-clamp-2">
              {note.title}
            </h3>
          )}

          {/* Content preview */}
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3">
            {note.note_type === "list"
              ? (() => {
                  try {
                    const parsed = JSON.parse(note.content);
                    return (
                      parsed.items
                        ?.slice(0, 3)
                        .map((i: { text: string }) => i.text)
                        .join(", ") || "Empty list"
                    );
                  } catch {
                    return note.content.slice(0, 100);
                  }
                })()
              : note.content.replace(/<[^>]*>/g, "").slice(0, 150)}
          </p>
        </a>
      ))}
    </div>
  );
}
