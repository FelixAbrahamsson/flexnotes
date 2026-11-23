import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { useSyncStore } from "@/stores/syncStore";
import { fetchServerNote } from "@/services/sync";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { getContentPreview, formatRelativeDate } from "@/utils/formatters";
import type { LocalNote } from "@/services/db";
import type { Note } from "@/types";

interface ConflictResolverProps {
  onClose: () => void;
}

/**
 * Lists notes whose local edits clash with a newer server copy, shows both
 * versions side by side, and lets the user keep one of them.
 */
export function ConflictResolver({ onClose }: ConflictResolverProps) {
  const conflicts = useSyncStore((s) => s.conflicts);

  useEscapeKey(onClose);

  // Close automatically once everything is resolved
  useEffect(() => {
    if (conflicts.length === 0) onClose();
  }, [conflicts.length, onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Sync conflicts
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              These notes were changed here and on another device. Choose which
              version to keep.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {conflicts.map((note) => (
            <ConflictItem key={note.id} localNote={note} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConflictItem({ localNote }: { localNote: LocalNote }) {
  const resolveConflict = useSyncStore((s) => s.resolveConflict);
  const [serverNote, setServerNote] = useState<Note | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<"local" | "server" | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchServerNote(localNote.id)
      .then((n) => !cancelled && setServerNote(n))
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [localNote.id]);

  const resolve = async (choice: "local" | "server") => {
    setResolving(choice);
    setResolveError(null);
    try {
      await resolveConflict(localNote.id, choice);
    } catch (e) {
      setResolveError((e as Error).message);
      setResolving(null);
    }
  };

  const title = localNote.title || serverNote?.title || "Untitled";

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
        <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{title}</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <VersionPanel
          label="This device"
          note={localNote}
          updatedAt={localNote._localUpdatedAt}
          actionLabel="Keep this version"
          busy={resolving === "local"}
          disabled={resolving !== null || serverNote === undefined}
          onChoose={() => resolve("local")}
        />
        {loadError ? (
          <div className="text-sm text-red-600 dark:text-red-400 p-3">
            Couldn't load the server version: {loadError}
          </div>
        ) : serverNote === undefined ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 p-3">
            Loading server version…
          </div>
        ) : serverNote === null ? (
          <VersionPanel
            label="Server"
            emptyText="Deleted on another device"
            actionLabel="Delete here too"
            busy={resolving === "server"}
            disabled={resolving !== null}
            onChoose={() => resolve("server")}
          />
        ) : (
          <VersionPanel
            label="Server"
            note={serverNote}
            updatedAt={serverNote.updated_at}
            actionLabel="Keep this version"
            busy={resolving === "server"}
            disabled={resolving !== null}
            onChoose={() => resolve("server")}
          />
        )}
      </div>

      {resolveError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{resolveError}</p>
      )}
    </div>
  );
}

interface VersionPanelProps {
  label: string;
  note?: Note;
  updatedAt?: string;
  emptyText?: string;
  actionLabel: string;
  busy: boolean;
  disabled: boolean;
  onChoose: () => void;
}

function VersionPanel({
  label,
  note,
  updatedAt,
  emptyText,
  actionLabel,
  busy,
  disabled,
  onChoose,
}: VersionPanelProps) {
  const preview = note ? getContentPreview(note.content, note.note_type, 600) : "";

  return (
    <div className="flex flex-col rounded-md bg-gray-50 dark:bg-gray-900/40 p-3 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </span>
        {updatedAt && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatRelativeDate(updatedAt)}
          </span>
        )}
      </div>
      {note?.title && (
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1 break-words">
          {note.title}
        </p>
      )}
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words line-clamp-[12] flex-1">
        {note ? preview || <em className="text-gray-400">Empty</em> : <em>{emptyText}</em>}
      </p>
      <button
        onClick={onChoose}
        disabled={disabled}
        className="btn btn-primary mt-3 text-sm disabled:opacity-50"
      >
        {busy ? "Saving…" : actionLabel}
      </button>
    </div>
  );
}
