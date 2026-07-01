/**
 * App-wide configuration constants and user-facing message strings.
 *
 * Centralized so there is a single, discoverable place to find and change
 * tunable values instead of hunting through components. Prefer importing from
 * here over hardcoding magic numbers or duplicating message text.
 */

/** Days a note stays in trash before it is automatically permanently deleted. */
export const TRASH_RETENTION_DAYS = 30

/** Debounce for auto-saving note edits (ms). */
export const AUTO_SAVE_DEBOUNCE_MS = 500

/** Debounce for re-extracting the heading outline from markdown content (ms). */
export const HEADING_EXTRACTION_DEBOUNCE_MS = 150

/** User-facing message strings shown in toasts and banners. */
export const MESSAGES = {
  noteMovedToTrash: `Note moved to trash. Deleted notes are stored for ${TRASH_RETENTION_DAYS} days.`,
  trashAutoDeleteNotice: `Notes in trash are automatically deleted after ${TRASH_RETENTION_DAYS} days`,
} as const
