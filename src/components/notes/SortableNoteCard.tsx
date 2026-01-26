import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { NoteCard } from './NoteCard'
import type { Note, Tag, Folder } from '@/types'

export interface SortableNoteCardProps {
  note: Note
  tags: Tag[]
  folder?: Folder | null
  onClick: () => void
  onPin?: () => void
  onArchive?: () => void
  onDelete: () => void
  onRestore?: () => void
  onShare?: () => void
  onMoveToFolder?: () => void
  showRestore?: boolean
  showFolder?: boolean
  isDragDisabled?: boolean
  reorderMode?: boolean
}

export function SortableNoteCard({
  note,
  tags,
  folder,
  onClick,
  onPin,
  onArchive,
  onDelete,
  onRestore,
  onShare,
  onMoveToFolder,
  showRestore,
  showFolder,
  isDragDisabled,
  reorderMode,
}: SortableNoteCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id, disabled: isDragDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
    // Only disable touch scrolling when in reorder mode (mobile) or when dragging
    touchAction: reorderMode && !isDragDisabled ? 'none' : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragDisabled ? '' : 'cursor-grab active:cursor-grabbing'}
      {...attributes}
      {...listeners}
    >
      <NoteCard
        note={note}
        tags={tags}
        folder={folder}
        onClick={onClick}
        onPin={onPin}
        onArchive={onArchive}
        onDelete={onDelete}
        onRestore={onRestore}
        onShare={onShare}
        onMoveToFolder={onMoveToFolder}
        showRestore={showRestore}
        showFolder={showFolder}
      />
    </div>
  )
}
