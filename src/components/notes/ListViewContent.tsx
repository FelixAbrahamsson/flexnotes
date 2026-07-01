import type { ComponentProps } from "react";
import { Trash, Share2, Users } from "lucide-react";
import { NoteGrid, type NoteGridProps } from "./NoteGrid";
import { SharedWithMeView } from "./SharedWithMeView";
import { MESSAGES } from "@/constants";
import { getEmptyStateMessage } from "@/utils/notesEmptyState";

type SharedWithMeProps = ComponentProps<typeof SharedWithMeView>;

export interface ListViewContentProps extends NoteGridProps {
  // Reorder banner
  onExitReorder: () => void;
  // Trash header
  trashCount: number;
  onEmptyTrash: () => void;
  // Shared view
  showShared: boolean;
  sharedTab: "with_me" | "by_me";
  onSharedTabChange: (tab: "with_me" | "by_me") => void;
  sharedWithMeNotes: SharedWithMeProps["notes"];
  sharedWithMeLoading: boolean;
  onRemoveSharedWithMe: SharedWithMeProps["onRemove"];
  // Empty-state inputs
  searchQuery: string;
  selectedTagIds: string[];
  selectedFolderId: string | null;
  displayedNotesCount: number;
  onCreateNote: () => void;
}

/**
 * List/archive/trash/shared view body for NotesPage: the reorder + trash
 * banners, the shared-view tabs, and the loading / empty-state / NoteGrid
 * switch. Purely presentational — all data and handlers arrive via props, so
 * it renders identically to the block previously inlined in NotesPage.
 */
export function ListViewContent(props: ListViewContentProps) {
  const {
    onExitReorder,
    trashCount,
    onEmptyTrash,
    showShared,
    sharedTab,
    onSharedTabChange,
    sharedWithMeNotes,
    sharedWithMeLoading,
    onRemoveSharedWithMe,
    searchQuery,
    selectedTagIds,
    selectedFolderId,
    displayedNotesCount,
    onCreateNote,
    ...gridProps
  } = props;

  const { reorderMode, showTrash, showArchived, viewMode, gridClasses, loading } =
    gridProps;

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex-1 min-w-0">
        {/* Reorder mode banner */}
        {reorderMode && (
          <div className="flex items-center justify-between mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
            <p className="text-sm text-primary-800 dark:text-primary-200">
              Drag notes to reorder them
            </p>
            <button
              onClick={onExitReorder}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              Done
            </button>
          </div>
        )}

        {/* Trash header */}
        {showTrash && trashCount > 0 && (
          <div className="flex items-center justify-between mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {MESSAGES.trashAutoDeleteNotice}
            </p>
            <button
              onClick={onEmptyTrash}
              className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
            >
              Empty trash
            </button>
          </div>
        )}

        {/* Shared tabs */}
        {showShared && (
          <div className="flex gap-1 mb-4 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => onSharedTabChange("with_me")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                sharedTab === "with_me"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <Users className="w-4 h-4" />
              Shared with me
            </button>
            <button
              onClick={() => onSharedTabChange("by_me")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                sharedTab === "by_me"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <Share2 className="w-4 h-4" />
              Shared by me
            </button>
          </div>
        )}

        {/* Shared with me content */}
        {showShared && sharedTab === "with_me" ? (
          <SharedWithMeView
            notes={sharedWithMeNotes}
            loading={sharedWithMeLoading}
            gridClasses={gridClasses}
            onRemove={onRemoveSharedWithMe}
          />
        ) : loading && displayedNotesCount === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : displayedNotesCount === 0 ? (
          <div className="text-center py-12">
            <div className="mb-4">
              {showTrash ? (
                <Trash className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
              ) : showShared ? (
                <Share2 className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
              ) : null}
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {getEmptyStateMessage({
                showTrash,
                showArchived,
                showShared,
                searchQuery,
                hasSelectedTags: selectedTagIds.length > 0,
                viewMode,
                hasSelectedFolder: !!selectedFolderId,
              })}
            </p>
            {showShared && sharedTab === "by_me" && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Share a note to see it here
              </p>
            )}
            {!showArchived &&
              !showTrash &&
              !showShared &&
              !searchQuery &&
              selectedTagIds.length === 0 && (
                <button onClick={onCreateNote} className="btn btn-primary">
                  {viewMode === "folder" && selectedFolderId
                    ? "Create note in this folder"
                    : "Create your first note"}
                </button>
              )}
          </div>
        ) : (
          <NoteGrid {...gridProps} />
        )}
      </div>
    </main>
  );
}
