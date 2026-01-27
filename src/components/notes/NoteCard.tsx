import { useState } from "react";
import {
  Pin,
  PinOff,
  Archive,
  Trash2,
  MoreVertical,
  RotateCcw,
  Share2,
  FolderOpen,
  Copy,
} from "lucide-react";
import type { Note, Tag, Folder } from "@/types";
import { TagBadge } from "@/components/tags/TagBadge";
import { FolderBadge } from "@/components/folders/FolderBadge";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { formatRelativeDate, getContentPreview } from "@/utils/formatters";

interface NoteCardProps {
  note: Note;
  tags: Tag[];
  folder?: Folder | null;
  onClick: () => void;
  onPin?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  onShare?: () => void;
  onDuplicate?: () => void;
  onMoveToFolder?: () => void;
  showRestore?: boolean;
  showFolder?: boolean; // Show folder badge on the card
}

export function NoteCard({
  note,
  tags,
  folder,
  onClick,
  onPin,
  onArchive,
  onDelete,
  onRestore,
  onShare,
  onDuplicate,
  onMoveToFolder,
  showRestore,
  showFolder,
}: NoteCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const displayTitle = note.title || "Untitled";
  const preview = getContentPreview(note.content, note.note_type);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(true);
  };

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onPin?.();
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onArchive?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onDelete?.();
  };

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onRestore?.();
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onShare?.();
  };

  const handleMoveToFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onMoveToFolder?.();
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    onDuplicate?.();
  };

  return (
    <div className="relative group">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClick();
        }}
        onContextMenu={handleContextMenu}
        className="w-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer select-none"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
            {displayTitle}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            {note.is_pinned && (
              <Pin className="w-4 h-4 text-gray-400 dark:text-gray-500 fill-current" />
            )}
          </div>
        </div>

        {preview && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-3 whitespace-pre-line">
            {preview}
          </p>
        )}

        {/* Folder badge */}
        {showFolder && folder && (
          <div className="mt-2">
            <FolderBadge folder={folder} size="sm" />
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, 3).map((tag) => (
              <TagBadge key={tag.id} tag={tag} size="sm" />
            ))}
            {tags.length > 3 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatRelativeDate(note.updated_at)}
          </span>
          <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
            {note.note_type}
          </span>
          {note._pendingSync && (
            <>
              <span className="text-xs text-gray-300 dark:text-gray-600">
                ·
              </span>
              <span className="text-xs text-yellow-500">Pending sync</span>
            </>
          )}
        </div>
      </div>

      {/* Quick actions menu - always visible on mobile, hover on desktop */}
      {(onPin ||
        onArchive ||
        onDelete ||
        onRestore ||
        onShare ||
        onDuplicate ||
        onMoveToFolder) && (
        <div className="absolute top-2 right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleMenuClick}
            className="p-1.5 bg-white dark:bg-gray-700 rounded-lg shadow border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>

          <DropdownMenu open={showMenu} onClose={() => setShowMenu(false)}>
            {showRestore && onRestore && (
              <DropdownMenuItem
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={handleRestore}
              >
                Restore
              </DropdownMenuItem>
            )}
            {onPin && !showRestore && (
              <DropdownMenuItem
                icon={
                  note.is_pinned ? (
                    <PinOff className="w-4 h-4" />
                  ) : (
                    <Pin className="w-4 h-4" />
                  )
                }
                onClick={handlePin}
              >
                {note.is_pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
            )}
            {onShare && !showRestore && (
              <DropdownMenuItem
                icon={<Share2 className="w-4 h-4" />}
                onClick={handleShare}
              >
                Share
              </DropdownMenuItem>
            )}
            {onDuplicate && !showRestore && (
              <DropdownMenuItem
                icon={<Copy className="w-4 h-4" />}
                onClick={handleDuplicate}
              >
                Duplicate
              </DropdownMenuItem>
            )}
            {onMoveToFolder && !showRestore && (
              <DropdownMenuItem
                icon={<FolderOpen className="w-4 h-4" />}
                onClick={handleMoveToFolder}
              >
                Move to folder
              </DropdownMenuItem>
            )}
            {onArchive && !showRestore && (
              <DropdownMenuItem
                icon={<Archive className="w-4 h-4" />}
                onClick={handleArchive}
              >
                {note.is_archived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                icon={<Trash2 className="w-4 h-4" />}
                onClick={handleDelete}
                variant="danger"
              >
                {showRestore ? "Delete forever" : "Delete"}
              </DropdownMenuItem>
            )}
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
